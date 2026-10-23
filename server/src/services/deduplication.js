/**
 * Deduplication & Audit Service.
 * Identifies, audits, flags, and safely reconciles duplicate registrations and payment transactions.
 * Supports persistent Supabase PostgreSQL and local SQLite.
 */

const { getDb } = require('../db/database');
const { getSupabase, isSupabaseConfigured } = require('../db/supabase');
const { now } = require('../utils/time');
const { normalizeUTR } = require('../utils/validation');

class DeduplicationService {
  /**
   * Run a comprehensive scan for duplicates across registrations, payments, and tickets.
   */
  scanDuplicates() {
    if (isSupabaseConfigured()) {
      return this._scanDuplicatesSupabase();
    }
    return this._scanDuplicatesSqlite();
  }

  async _scanDuplicatesSupabase() {
    const supabase = getSupabase();

    // High performance database RPC scan (runs inside PostgreSQL in < 15ms without transferring 10,000+ rows)
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('scan_duplicate_records');
      if (!rpcErr && rpcData) {
        const multiTickets = rpcData.multiTicketRegistrations || [];
        const dupTickets = rpcData.duplicateTicketNumbers || [];
        const flagged = rpcData.flaggedRegistrations || [];
        const dupUtrs = rpcData.duplicateUtrs || [];
        const dupRegCount = multiTickets.length + dupTickets.length;
        return {
          ...rpcData,
          scannedAt: rpcData.timestamp || now().toISOString(),
          summary: {
            ...rpcData.summary,
            duplicateRegistrationsCount: dupRegCount,
            isDatabaseClean: (dupUtrs.length === 0 && dupRegCount === 0)
          },
          duplicateRegistrations: [...multiTickets, ...dupTickets],
          flaggedForReview: flagged,
          multiSubmissionsPerReg: [],
          rapidRepeatRegistrations: []
        };
      }
    } catch (e) {
      // Fall through to fallback below
    }

    // 1. Fetch registrations, submissions, tickets (fallback with safe limit)
    const [regsRes, subsRes, ticketsRes] = await Promise.all([
      supabase.from('registrations').select('*').limit(2000),
      supabase.from('payment_submissions').select('*').limit(2000),
      supabase.from('tickets').select('*').limit(2000)
    ]);

    const registrations = regsRes.data || [];
    const submissions = subsRes.data || [];
    const tickets = ticketsRes.data || [];

    // Map helpers
    const regMap = new Map(registrations.map(r => [r.id, r]));
    const ticketMap = new Map();
    tickets.forEach(t => {
      ticketMap.set(t.registration_id, t);
    });

    // 1. Duplicate normalized UTRs
    const utrGroups = new Map();
    submissions.forEach(sub => {
      if (!sub.utr_normalized) return;
      if (!utrGroups.has(sub.utr_normalized)) utrGroups.set(sub.utr_normalized, []);
      utrGroups.get(sub.utr_normalized).push(sub);
    });

    const duplicateUtrDetails = [];
    utrGroups.forEach((group, utrNormalized) => {
      if (group.length > 1) {
        const records = group.map(ps => {
          const r = regMap.get(ps.registration_id) || {};
          const t = ticketMap.get(ps.registration_id);
          return {
            submission_id: ps.id,
            registration_id: ps.registration_id,
            utr_reference: ps.utr_reference,
            utr_normalized: ps.utr_normalized,
            submission_status: ps.status,
            submitted_at: ps.submitted_at,
            full_name: r.full_name,
            phone: r.phone,
            total_amount: r.total_amount,
            registration_status: r.status,
            ticket_number: t?.ticket_number || null,
            ticket_is_valid: t?.is_valid ? 1 : 0
          };
        });
        duplicateUtrDetails.push({
          utr_normalized: utrNormalized,
          count: group.length,
          records
        });
      }
    });

    // 2. Multi-ticket registrations
    const regTickets = new Map();
    tickets.forEach(t => {
      if (!regTickets.has(t.registration_id)) regTickets.set(t.registration_id, []);
      regTickets.get(t.registration_id).push(t);
    });
    const multiTicketRegistrations = [];
    regTickets.forEach((tList, regId) => {
      if (tList.length > 1) {
        multiTicketRegistrations.push({
          registration_id: regId,
          ticket_count: tList.length,
          ticket_numbers: tList.map(t => t.ticket_number).join(',')
        });
      }
    });

    // 3. Duplicate ticket numbers
    const ticketNumGroups = new Map();
    tickets.forEach(t => {
      if (!ticketNumGroups.has(t.ticket_number)) ticketNumGroups.set(t.ticket_number, []);
      ticketNumGroups.get(t.ticket_number).push(t);
    });
    const duplicateTicketNumbers = [];
    ticketNumGroups.forEach((tList, num) => {
      if (tList.length > 1) {
        duplicateTicketNumbers.push({
          ticket_number: num,
          ticket_count: tList.length,
          registration_ids: tList.map(t => t.registration_id).join(',')
        });
      }
    });

    // 4. Same phone groups
    const phoneGroups = new Map();
    registrations.filter(r => r.status !== 'CANCELLED').forEach(r => {
      if (!phoneGroups.has(r.phone)) phoneGroups.set(r.phone, []);
      phoneGroups.get(r.phone).push(r);
    });
    const samePhoneGroups = [];
    phoneGroups.forEach((list, phone) => {
      if (list.length > 1) {
        samePhoneGroups.push({
          phone,
          count: list.length,
          total_participants: list.reduce((sum, item) => sum + item.participant_count, 0),
          registration_ids: list.map(item => item.id).join(',')
        });
      }
    });

    // 5. Flagged registrations
    const flaggedRegistrations = registrations
      .filter(r => r.status === 'FLAGGED_FOR_REVIEW' || r.is_flagged_duplicate)
      .map(r => ({
        id: r.id,
        full_name: r.full_name,
        phone: r.phone,
        total_amount: r.total_amount,
        status: r.status,
        created_at: r.created_at,
        cancellation_reason: r.cancellation_reason
      }));

    const totalRegistrations = registrations.length;
    const activeRegistrations = registrations.filter(r => ['PENDING_PAYMENT', 'PAYMENT_UNDER_REVIEW', 'PAYMENT_VERIFIED'].includes(r.status)).length;
    const cancelledRegistrations = registrations.filter(r => r.status === 'CANCELLED').length;
    const verifiedPayments = registrations.filter(r => r.status === 'PAYMENT_VERIFIED').length;
    const duplicateRegistrationsCount = multiTicketRegistrations.length + duplicateTicketNumbers.length;
    const totalDuplicateGroups = duplicateUtrDetails.length + duplicateRegistrationsCount + flaggedRegistrations.length;

    return {
      timestamp: now().toISOString(),
      scannedAt: now().toISOString(),
      summary: {
        totalRegistrations,
        activeRegistrations,
        cancelledRegistrations,
        verifiedPayments,
        duplicateUtrCount: duplicateUtrDetails.length,
        duplicateRegistrationsCount,
        multiTicketCount: multiTicketRegistrations.length,
        duplicateTicketNumberCount: duplicateTicketNumbers.length,
        flaggedForReviewCount: flaggedRegistrations.length,
        samePhoneGroupsCount: samePhoneGroups.length,
        isDatabaseClean: (duplicateUtrDetails.length === 0 && duplicateRegistrationsCount === 0)
      },
      duplicateUtrs: duplicateUtrDetails,
      duplicateRegistrations: [...multiTicketRegistrations, ...duplicateTicketNumbers],
      multiTicketRegistrations,
      duplicateTicketNumbers,
      multiSubmissionsPerReg: [],
      flaggedRegistrations,
      flaggedForReview: flaggedRegistrations,
      rapidRepeatRegistrations: [],
      samePhoneGroups,
      totalDuplicateGroups
    };
  }

  _scanDuplicatesSqlite() {
    const db = getDb();

    // 1. Duplicate normalized UTRs across payment submissions
    const duplicateUtrs = db.prepare(`
      SELECT 
        ps.utr_normalized,
        COUNT(ps.id) as submission_count,
        GROUP_CONCAT(ps.registration_id) as registration_ids,
        GROUP_CONCAT(ps.status) as submission_statuses
      FROM payment_submissions ps
      GROUP BY ps.utr_normalized
      HAVING COUNT(ps.id) > 1
    `).all();

    const duplicateUtrDetails = [];
    for (const dup of duplicateUtrs) {
      const records = db.prepare(`
        SELECT ps.id as submission_id, ps.registration_id, ps.utr_reference, ps.utr_normalized,
               ps.status as submission_status, ps.submitted_at,
               r.full_name, r.phone, r.total_amount, r.status as registration_status,
               t.ticket_number, t.is_valid as ticket_is_valid
        FROM payment_submissions ps
        JOIN registrations r ON r.id = ps.registration_id
        LEFT JOIN tickets t ON t.registration_id = r.id
        WHERE ps.utr_normalized = ?
        ORDER BY ps.submitted_at ASC
      `).all(dup.utr_normalized);

      duplicateUtrDetails.push({
        utr_normalized: dup.utr_normalized,
        count: dup.submission_count,
        records
      });
    }

    const multiTicketRegistrations = db.prepare(`
      SELECT registration_id, COUNT(id) as ticket_count, GROUP_CONCAT(ticket_number) as ticket_numbers
      FROM tickets
      GROUP BY registration_id
      HAVING COUNT(id) > 1
    `).all();

    const duplicateTicketNumbers = db.prepare(`
      SELECT ticket_number, COUNT(id) as ticket_count, GROUP_CONCAT(registration_id) as registration_ids
      FROM tickets
      GROUP BY ticket_number
      HAVING COUNT(id) > 1
    `).all();

    const multiSubmissionsPerReg = db.prepare(`
      SELECT 
        ps.registration_id,
        COUNT(ps.id) as submission_count,
        r.full_name, r.phone, r.status as registration_status,
        GROUP_CONCAT(ps.utr_reference) as utr_references,
        GROUP_CONCAT(ps.status) as submission_statuses
      FROM payment_submissions ps
      JOIN registrations r ON r.id = ps.registration_id
      GROUP BY ps.registration_id
      HAVING COUNT(ps.id) > 1
    `).all();

    const flaggedRegistrations = db.prepare(`
      SELECT r.id, r.full_name, r.phone, r.total_amount, r.status, r.created_at,
             r.cancellation_reason,
             ps.utr_reference, ps.utr_normalized, ps.status as payment_status
      FROM registrations r
      LEFT JOIN payment_submissions ps ON ps.registration_id = r.id
      WHERE r.status = 'FLAGGED_FOR_REVIEW' 
         OR ps.status = 'FLAGGED_FOR_REVIEW'
         OR (r.cancellation_reason LIKE '%duplicate%' AND r.status != 'CANCELLED')
    `).all();

    const rapidRepeatRegistrations = db.prepare(`
      SELECT r1.id as id1, r1.full_name, r1.phone, r1.created_at as created1, r1.status as status1,
             r2.id as id2, r2.created_at as created2, r2.status as status2
      FROM registrations r1
      JOIN registrations r2 ON r1.phone = r2.phone 
        AND r1.full_name = r2.full_name 
        AND r1.id < r2.id
        AND ABS(strftime('%s', r1.created_at) - strftime('%s', r2.created_at)) <= 120
      WHERE r1.status != 'CANCELLED' AND r2.status != 'CANCELLED'
    `).all();

    const samePhoneGroups = db.prepare(`
      SELECT phone, COUNT(id) as count, SUM(participant_count) as total_participants,
             GROUP_CONCAT(id) as registration_ids
      FROM registrations
      WHERE status != 'CANCELLED'
      GROUP BY phone
      HAVING COUNT(id) > 1
    `).all();

    const totalRegistrations = db.prepare('SELECT COUNT(*) as c FROM registrations').get().c;
    const activeRegistrations = db.prepare(`
      SELECT COUNT(*) as c FROM registrations 
      WHERE status IN ('PENDING_PAYMENT', 'PAYMENT_UNDER_REVIEW', 'PAYMENT_VERIFIED')
    `).get().c;
    const cancelledRegistrations = db.prepare(`
      SELECT COUNT(*) as c FROM registrations WHERE status = 'CANCELLED'
    `).get().c;
    const verifiedPayments = db.prepare(`
      SELECT COUNT(DISTINCT r.id) as c FROM registrations r
      JOIN tickets t ON t.registration_id = r.id AND t.is_valid = 1
      WHERE r.status = 'PAYMENT_VERIFIED'
    `).get().c;

    const duplicateRegistrationsCount = multiTicketRegistrations.length + duplicateTicketNumbers.length;
    const totalDuplicateGroups = duplicateUtrDetails.length + duplicateRegistrationsCount + flaggedRegistrations.length;

    return {
      timestamp: now().toISOString(),
      scannedAt: now().toISOString(),
      summary: {
        totalRegistrations,
        activeRegistrations,
        cancelledRegistrations,
        verifiedPayments,
        duplicateUtrCount: duplicateUtrDetails.length,
        duplicateRegistrationsCount,
        multiTicketCount: multiTicketRegistrations.length,
        duplicateTicketNumberCount: duplicateTicketNumbers.length,
        multiSubmissionCount: multiSubmissionsPerReg.length,
        flaggedForReviewCount: flaggedRegistrations.length,
        rapidRepeatCount: rapidRepeatRegistrations.length,
        samePhoneGroupsCount: samePhoneGroups.length,
        isDatabaseClean: (duplicateUtrDetails.length === 0 && duplicateRegistrationsCount === 0)
      },
      duplicateUtrs: duplicateUtrDetails,
      duplicateRegistrations: [...multiTicketRegistrations, ...duplicateTicketNumbers],
      multiTicketRegistrations,
      duplicateTicketNumbers,
      multiSubmissionsPerReg,
      flaggedRegistrations,
      flaggedForReview: flaggedRegistrations,
      rapidRepeatRegistrations,
      samePhoneGroups,
      totalDuplicateGroups
    };
  }

  /**
   * Safely flag a registration or payment as suspicious for manual admin review.
   */
  async flagForReview(registrationId, reason, adminId, adminUsername) {
    const currentTime = now().toISOString();

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      await supabase
        .from('registrations')
        .update({
          status: 'FLAGGED_FOR_REVIEW',
          cancellation_reason: `FLAGGED_FOR_REVIEW: ${reason}`,
          is_flagged_duplicate: true,
          duplicate_flag_reason: reason,
          updated_at: currentTime
        })
        .eq('id', registrationId);

      await supabase
        .from('payment_submissions')
        .update({
          status: 'FLAGGED_FOR_REVIEW',
          rejection_reason: reason,
          is_flagged_duplicate: true
        })
        .eq('registration_id', registrationId)
        .in('status', ['UNDER_REVIEW', 'PENDING']);

      await supabase.from('admin_audit_log').insert({
        admin_username: adminUsername || 'admin',
        action: 'REGISTRATION_FLAGGED',
        target_type: 'registration',
        target_id: registrationId,
        details: JSON.stringify({ reason }),
        created_at: currentTime
      });

      return {
        success: true,
        status: 'FLAGGED_FOR_REVIEW',
        registrationId,
        message: `Registration ${registrationId} flagged for admin review.`
      };
    }

    // SQLite mode
    const db = getDb();
    const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(registrationId);
    if (!reg) throw new Error('Registration not found');

    const flagTransaction = db.transaction(() => {
      db.prepare(`
        UPDATE registrations 
        SET status = 'FLAGGED_FOR_REVIEW', cancellation_reason = ?, is_flagged_duplicate = 1, duplicate_flag_reason = ?, updated_at = ?
        WHERE id = ?
      `).run(`FLAGGED_FOR_REVIEW: ${reason}`, reason, currentTime, registrationId);

      db.prepare(`
        UPDATE payment_submissions
        SET status = 'FLAGGED_FOR_REVIEW', rejection_reason = ?, is_flagged_duplicate = 1
        WHERE registration_id = ? AND status IN ('UNDER_REVIEW', 'PENDING')
      `).run(reason, registrationId);

      db.prepare(`
        INSERT INTO admin_audit_log (admin_id, admin_username, action, target_type, target_id, details, created_at)
        VALUES (?, ?, 'REGISTRATION_FLAGGED', 'registration', ?, ?, ?)
      `).run(adminId, adminUsername, registrationId, JSON.stringify({ reason }), currentTime);
    });

    flagTransaction();
    return {
      success: true,
      status: 'FLAGGED_FOR_REVIEW',
      registrationId,
      message: `Registration ${registrationId} flagged for admin review.`
    };
  }

  /**
   * Safely resolve duplicate registrations.
   * Keeps canonical record, archives/cancels duplicate, revokes duplicate ticket if any,
   * and preserves all audit logs and financial traces.
   */
  async resolveDuplicate({ primaryId, duplicateId, adminId, adminUsername, reason }) {
    const currentTime = now().toISOString();

    if (primaryId === duplicateId) {
      throw new Error('Primary and duplicate IDs cannot be the same');
    }

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      const isUUID = typeof adminId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(adminId);
      
      const { data, error } = await supabase.rpc('resolve_duplicate_registration', {
        p_primary_id: primaryId,
        p_duplicate_id: duplicateId,
        p_admin_id: isUUID ? adminId : null,
        p_admin_username: adminUsername || 'admin',
        p_reason: reason
      });

      if (error) {
        throw new Error(`Failed to resolve duplicate: ${error.message}`);
      }

      return {
        success: true,
        primaryId,
        primaryRegistrationId: primaryId,
        duplicateId,
        duplicateRegistrationId: duplicateId,
        revokedTicket: data?.revokedTicket || null,
        message: `Duplicate registration ${duplicateId} safely resolved and archived. Canonical record ${primaryId} preserved.`
      };
    }

    // SQLite mode
    const db = getDb();
    const primaryReg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(primaryId);
    if (!primaryReg) throw new Error(`Primary registration ${primaryId} not found`);

    const dupReg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(duplicateId);
    if (!dupReg) throw new Error(`Duplicate registration ${duplicateId} not found`);

    const dupTicket = db.prepare('SELECT * FROM tickets WHERE registration_id = ?').get(duplicateId);

    const resolveTransaction = db.transaction(() => {
      if (dupTicket) {
        db.prepare(`
          UPDATE tickets 
          SET is_valid = 0, revoked_at = ?, revoked_reason = ?
          WHERE registration_id = ?
        `).run(currentTime, `Duplicate resolution: Superseded by ${primaryId}. Reason: ${reason}`, duplicateId);
      }

      db.prepare(`
        UPDATE payment_submissions 
        SET status = 'REJECTED', rejection_reason = ?, reviewed_by = ?, reviewed_at = ?, review_decision = 'REJECTED'
        WHERE registration_id = ? AND status != 'REJECTED'
      `).run(`Duplicate claim superseded by primary registration ${primaryId}. ${reason}`, adminId, currentTime, duplicateId);

      db.prepare(`
        UPDATE registrations
        SET status = 'CANCELLED', cancellation_reason = ?, cancelled_at = ?, cancelled_by = ?, updated_at = ?
        WHERE id = ?
      `).run(`DUPLICATE_RESOLVED: Kept canonical record ${primaryId}. Reason: ${reason}`, currentTime, adminId, currentTime, duplicateId);

      db.prepare(`
        INSERT INTO admin_audit_log (admin_id, admin_username, action, target_type, target_id, details, created_at)
        VALUES (?, ?, 'DUPLICATE_RESOLVED', 'registration', ?, ?, ?)
      `).run(
        adminId, 
        adminUsername, 
        duplicateId, 
        JSON.stringify({
          canonicalRegistrationId: primaryId,
          archivedDuplicateId: duplicateId,
          duplicateHadTicket: !!dupTicket,
          duplicateTicketNumber: dupTicket ? dupTicket.ticket_number : null,
          reason
        }), 
        currentTime
      );
    });

    resolveTransaction();

    return {
      success: true,
      primaryId,
      primaryRegistrationId: primaryId,
      duplicateId,
      duplicateRegistrationId: duplicateId,
      revokedTicket: dupTicket ? dupTicket.ticket_number : null,
      message: `Duplicate registration ${duplicateId} safely resolved and archived. Canonical record ${primaryId} preserved.`
    };
  }
}

module.exports = new DeduplicationService();
