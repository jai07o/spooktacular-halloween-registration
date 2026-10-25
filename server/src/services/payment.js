/**
 * Payment service - handles payment sessions, UTR submissions, verification.
 * Supports persistent Supabase PostgreSQL (production/Vercel) and local SQLite (testing/offline).
 */

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { getSupabase, isSupabaseConfigured } = require('../db/supabase');
const { now } = require('../utils/time');
const { normalizeUTR, generateTicketNumber } = require('../utils/validation');
const QRCode = require('qrcode');

const SESSION_DURATION_MS = 3 * 60 * 1000; // 3 minutes

class PaymentService {
  /**
   * Create a payment session for a registration.
   */
  async createPaymentSession(registrationId) {
    const currentTime = now();
    const expiresAt = new Date(currentTime.getTime() + SESSION_DURATION_MS);
    const sessionId = uuidv4();

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      const { data: reg, error: regErr } = await supabase
        .from('registrations')
        .select('status')
        .eq('id', registrationId)
        .maybeSingle();

      if (regErr || !reg) throw new Error('Registration not found');
      if (reg.status !== 'PENDING_PAYMENT' && reg.status !== 'EXPIRED') {
        throw new Error('Payment session cannot be created for this registration status');
      }

      // Expire previous active sessions for this registration
      await supabase
        .from('payment_sessions')
        .update({ status: 'EXPIRED' })
        .eq('registration_id', registrationId)
        .eq('status', 'ACTIVE');

      // Reset registration status if expired
      if (reg.status === 'EXPIRED') {
        await supabase
          .from('registrations')
          .update({ status: 'PENDING_PAYMENT', updated_at: currentTime.toISOString() })
          .eq('id', registrationId);
      }

      // Insert new session
      const { error: insErr } = await supabase
        .from('payment_sessions')
        .insert({
          id: sessionId,
          registration_id: registrationId,
          expires_at: expiresAt.toISOString(),
          status: 'ACTIVE',
          created_at: currentTime.toISOString()
        });

      if (insErr) {
        throw new Error(`Failed to create payment session: ${insErr.message}`);
      }

      return {
        sessionId,
        registrationId,
        expiresAt: expiresAt.toISOString(),
        createdAt: currentTime.toISOString()
      };
    }

    // SQLite mode
    const db = getDb();
    const reg = db.prepare('SELECT status FROM registrations WHERE id = ?').get(registrationId);
    if (!reg) throw new Error('Registration not found');
    if (reg.status !== 'PENDING_PAYMENT' && reg.status !== 'EXPIRED') {
      throw new Error('Payment session cannot be created for this registration status');
    }

    db.prepare(`
      UPDATE payment_sessions SET status = 'EXPIRED' 
      WHERE registration_id = ? AND status = 'ACTIVE'
    `).run(registrationId);

    if (reg.status === 'EXPIRED') {
      db.prepare('UPDATE registrations SET status = ?, updated_at = ? WHERE id = ?')
        .run('PENDING_PAYMENT', currentTime.toISOString(), registrationId);
    }

    db.prepare(`
      INSERT INTO payment_sessions (id, registration_id, expires_at, status, created_at)
      VALUES (?, ?, ?, 'ACTIVE', ?)
    `).run(sessionId, registrationId, expiresAt.toISOString(), currentTime.toISOString());

    return {
      sessionId,
      registrationId,
      expiresAt: expiresAt.toISOString(),
      createdAt: currentTime.toISOString()
    };
  }

  /**
   * Get active payment session for a registration.
   */
  async getActiveSession(registrationId) {
    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      const { data: session } = await supabase
        .from('payment_sessions')
        .select('*')
        .eq('registration_id', registrationId)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return session || null;
    }

    const db = getDb();
    return db.prepare(`
      SELECT * FROM payment_sessions 
      WHERE registration_id = ? AND status = 'ACTIVE'
      ORDER BY created_at DESC LIMIT 1
    `).get(registrationId);
  }

  /**
   * Check if a payment session is still valid.
   */
  isSessionValid(session) {
    if (!session || session.status !== 'ACTIVE') return false;
    const currentTime = now();
    return currentTime < new Date(session.expires_at);
  }

  /**
   * Submit a UTR/transaction reference.
   */
  async submitPaymentReference(registrationId, sessionId, utrReference) {
    const currentTime = now();
    const normalized = normalizeUTR(utrReference);

    if (!normalized) {
      throw new Error('Invalid transaction reference');
    }

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();

      // Check session validity
      const { data: session, error: sessErr } = await supabase
        .from('payment_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('registration_id', registrationId)
        .maybeSingle();

      if (sessErr || !session) {
        throw new Error('Payment session not found');
      }

      if (session.status !== 'ACTIVE') {
        throw new Error('Payment session is no longer active');
      }

      if (currentTime >= new Date(session.expires_at)) {
        await supabase.from('payment_sessions').update({ status: 'EXPIRED' }).eq('id', sessionId);
        await supabase.from('registrations').update({ status: 'EXPIRED', updated_at: currentTime.toISOString() }).eq('id', registrationId);
        throw new Error('Payment session has expired. Please start a new registration.');
      }

      // Check for duplicate UTR across non-rejected submissions
      const { data: existingUTRs } = await supabase
        .from('payment_submissions')
        .select('registration_id, status, utr_reference')
        .eq('utr_normalized', normalized)
        .neq('status', 'REJECTED')
        .limit(1);

      const existingUTR = existingUTRs?.[0];

      if (existingUTR) {
        await supabase.from('admin_audit_log').insert({
          admin_username: 'system',
          action: 'DUPLICATE_PAYMENT_ATTEMPT',
          target_type: 'registration',
          target_id: registrationId,
          details: JSON.stringify({
            attemptedUtr: utrReference.trim(),
            normalizedUtr: normalized,
            claimedByExistingRegistration: existingUTR.registration_id,
            existingStatus: existingUTR.status
          }),
          created_at: currentTime.toISOString()
        });

        throw new Error('This transaction reference has already been submitted for another registration. Each UTR can only be used once.');
      }

      // Check if registration already has an active submission
      const { data: existingActive } = await supabase
        .from('payment_submissions')
        .select('id')
        .eq('registration_id', registrationId)
        .in('status', ['UNDER_REVIEW', 'APPROVED'])
        .maybeSingle();

      if (existingActive) {
        throw new Error('A payment submission is already under review for this registration.');
      }

      // Insert submission
      const { error: subErr } = await supabase
        .from('payment_submissions')
        .insert({
          registration_id: registrationId,
          session_id: sessionId,
          utr_reference: utrReference.trim(),
          utr_normalized: normalized,
          submitted_at: currentTime.toISOString(),
          status: 'UNDER_REVIEW'
        });

      if (subErr) {
        if (subErr.message && (subErr.message.includes('unique') || subErr.message.includes('duplicate'))) {
          throw new Error('This transaction reference has already been submitted for another registration. Each UTR can only be used once.');
        }
        throw new Error(`Failed to submit payment reference: ${subErr.message}`);
      }

      // Update session status
      await supabase.from('payment_sessions').update({ status: 'SUBMITTED' }).eq('id', sessionId);

      // Update registration status
      await supabase.from('registrations').update({
        status: 'PAYMENT_UNDER_REVIEW',
        updated_at: currentTime.toISOString()
      }).eq('id', registrationId);

      return { success: true, status: 'PAYMENT_UNDER_REVIEW' };
    }

    // SQLite mode
    const db = getDb();
    const session = db.prepare('SELECT * FROM payment_sessions WHERE id = ? AND registration_id = ?')
      .get(sessionId, registrationId);

    if (!session) {
      throw new Error('Payment session not found');
    }

    if (session.status !== 'ACTIVE') {
      throw new Error('Payment session is no longer active');
    }

    if (currentTime >= new Date(session.expires_at)) {
      db.prepare('UPDATE payment_sessions SET status = ? WHERE id = ?').run('EXPIRED', sessionId);
      db.prepare('UPDATE registrations SET status = ?, updated_at = ? WHERE id = ?')
        .run('EXPIRED', currentTime.toISOString(), registrationId);
      throw new Error('Payment session has expired. Please start a new registration.');
    }

    const existingUTR = db.prepare(`
      SELECT ps.registration_id, ps.status, r.full_name, r.phone 
      FROM payment_submissions ps
      JOIN registrations r ON r.id = ps.registration_id
      WHERE ps.utr_normalized = ? AND ps.status != 'REJECTED'
    `).get(normalized);

    if (existingUTR) {
      try {
        db.prepare(`
          INSERT INTO admin_audit_log (admin_id, admin_username, action, target_type, target_id, details, created_at)
          VALUES (1, 'system', 'DUPLICATE_PAYMENT_ATTEMPT', 'registration', ?, ?, ?)
        `).run(
          registrationId,
          JSON.stringify({
            attemptedUtr: utrReference.trim(),
            normalizedUtr: normalized,
            claimedByExistingRegistration: existingUTR.registration_id,
            existingStatus: existingUTR.status
          }),
          currentTime.toISOString()
        );
      } catch (e) {}

      throw new Error('This transaction reference has already been submitted for another registration. Each UTR can only be used once.');
    }

    const submitTransaction = db.transaction(() => {
      const raceCheck = db.prepare(`
        SELECT registration_id FROM payment_submissions
        WHERE utr_normalized = ? AND status != 'REJECTED'
      `).get(normalized);

      if (raceCheck) {
        throw new Error('This transaction reference has already been submitted for another registration. Each UTR can only be used once.');
      }

      const existingActive = db.prepare(`
        SELECT id FROM payment_submissions
        WHERE registration_id = ? AND status IN ('UNDER_REVIEW', 'APPROVED')
      `).get(registrationId);

      if (existingActive) {
        throw new Error('A payment submission is already under review for this registration.');
      }

      db.prepare(`
        INSERT INTO payment_submissions (registration_id, session_id, utr_reference, utr_normalized, submitted_at, status)
        VALUES (?, ?, ?, ?, ?, 'UNDER_REVIEW')
      `).run(registrationId, sessionId, utrReference.trim(), normalized, currentTime.toISOString());

      db.prepare('UPDATE payment_sessions SET status = ? WHERE id = ?').run('SUBMITTED', sessionId);

      db.prepare('UPDATE registrations SET status = ?, updated_at = ? WHERE id = ?')
        .run('PAYMENT_UNDER_REVIEW', currentTime.toISOString(), registrationId);
    });

    submitTransaction();

    return { success: true, status: 'PAYMENT_UNDER_REVIEW' };
  }

  /**
   * Admin: Approve a payment.
   */
  async approvePayment(registrationId, adminId, adminUsername) {
    const currentTime = now();

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();

      // Check registration
      const { data: reg, error: regErr } = await supabase
        .from('registrations')
        .select('*')
        .eq('id', registrationId)
        .maybeSingle();

      if (regErr || !reg) throw new Error('Registration not found');
      if (reg.status === 'PAYMENT_VERIFIED') throw new Error('Payment already verified');
      if (reg.status !== 'PAYMENT_UNDER_REVIEW') throw new Error('No pending payment to approve');

      // Check existing ticket
      const { data: existingTicket } = await supabase
        .from('tickets')
        .select('ticket_number')
        .eq('registration_id', registrationId)
        .maybeSingle();

      if (existingTicket) throw new Error('Ticket already issued for this registration');

      // Check for cloned / duplicate approved UTR
      const { data: subData } = await supabase
        .from('payment_submissions')
        .select('utr_normalized, utr_reference')
        .eq('registration_id', registrationId)
        .order('submitted_at', { ascending: false })
        .limit(1);

      if (subData && subData.length > 0) {
        const utrToApprove = subData[0].utr_normalized;
        const { data: duplicateApproved } = await supabase
          .from('payment_submissions')
          .select('registration_id')
          .eq('utr_normalized', utrToApprove)
          .eq('status', 'APPROVED')
          .neq('registration_id', registrationId)
          .limit(1);

        if (duplicateApproved && duplicateApproved.length > 0) {
          throw new Error(`Cannot approve: UTR ${subData[0].utr_reference} has already been approved for registration ${duplicateApproved[0].registration_id}. Duplicate or cloned UTR payments cannot be approved.`);
        }
      }

      // Generate ticket number with retry protection against collisions
      const isUUID = typeof adminId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(adminId);
      let ticketNumber = generateTicketNumber();
      let rpcResult = null;
      let rpcErr = null;
      let attempts = 0;

      while (attempts < 5) {
        attempts++;
        const qrPayload = JSON.stringify({
          ticketNumber,
          registrationId,
          name: reg.full_name,
          participants: reg.participant_count,
          event: 'SPOOKTACULAR HALLOWEEN PARTY 2026'
        });

        const res = await supabase.rpc('approve_payment_submission', {
          p_registration_id: registrationId,
          p_admin_id: isUUID ? adminId : null,
          p_admin_username: adminUsername || 'admin',
          p_ticket_number: ticketNumber,
          p_qr_data: qrPayload
        });

        if (!res.error) {
          rpcResult = res.data;
          rpcErr = null;
          break;
        }

        rpcErr = res.error;
        if (res.error.message && (res.error.message.includes('ticket') || res.error.message.includes('unique'))) {
          ticketNumber = generateTicketNumber(); // Generate fresh entropy and retry
        } else {
          break;
        }
      }

      if (rpcErr) {
        throw new Error(rpcErr.message || 'Payment approval failed in database transaction');
      }

      // Generate QR code image
      let qrImageBase64 = '';
      try {
        qrImageBase64 = await QRCode.toDataURL(JSON.stringify({ t: ticketNumber, r: registrationId, v: 'SPH2026' }), {
          width: 200,
          margin: 2,
          color: { dark: '#ff6600', light: '#1a1a2e' }
        });
      } catch (e) {
        console.error('QR generation error:', e);
      }

      return { ticketNumber, qrImage: qrImageBase64 };
    }

    // SQLite mode
    const db = getDb();
    const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(registrationId);
    if (!reg) throw new Error('Registration not found');
    if (reg.status === 'PAYMENT_VERIFIED') throw new Error('Payment already verified');
    if (reg.status !== 'PAYMENT_UNDER_REVIEW') throw new Error('No pending payment to approve');

    const existingTicket = db.prepare('SELECT * FROM tickets WHERE registration_id = ?').get(registrationId);
    if (existingTicket) throw new Error('Ticket already issued for this registration');

    const approveTransaction = db.transaction(() => {
      const freshReg = db.prepare('SELECT status FROM registrations WHERE id = ?').get(registrationId);
      if (freshReg.status === 'PAYMENT_VERIFIED') {
        throw new Error('Payment already verified for this registration');
      }

      const freshTicket = db.prepare('SELECT id FROM tickets WHERE registration_id = ?').get(registrationId);
      if (freshTicket) {
        throw new Error('Ticket already issued for this registration');
      }

      const activeSubmission = db.prepare(`
        SELECT id, utr_normalized FROM payment_submissions 
        WHERE registration_id = ? AND status = 'UNDER_REVIEW'
      `).get(registrationId);

      if (!activeSubmission) {
        throw new Error('No pending payment submission found to approve');
      }

      const duplicateApproved = db.prepare(`
        SELECT registration_id FROM payment_submissions
        WHERE utr_normalized = ? AND status = 'APPROVED' AND registration_id != ?
      `).get(activeSubmission.utr_normalized, registrationId);

      if (duplicateApproved) {
        throw new Error(`Cannot approve: Transaction reference was already approved on registration ${duplicateApproved.registration_id}`);
      }

      db.prepare(`
        UPDATE payment_submissions SET status = 'APPROVED', reviewed_by = ?, reviewed_at = ?, review_decision = 'APPROVED'
        WHERE id = ?
      `).run(adminId, currentTime.toISOString(), activeSubmission.id);

      db.prepare('UPDATE registrations SET status = ?, updated_at = ? WHERE id = ?')
        .run('PAYMENT_VERIFIED', currentTime.toISOString(), registrationId);

      let ticketNumber = generateTicketNumber(db);
      let attempts = 0;
      while (db.prepare('SELECT id FROM tickets WHERE ticket_number = ?').get(ticketNumber) && attempts < 10) {
        ticketNumber = generateTicketNumber(db);
        attempts++;
      }

      const qrData = JSON.stringify({
        ticketNumber,
        registrationId,
        name: reg.full_name,
        participants: reg.participant_count,
        event: 'SPOOKTACULAR HALLOWEEN PARTY 2026'
      });

      db.prepare(`
        INSERT INTO tickets (ticket_number, registration_id, issued_at, issued_by, qr_data)
        VALUES (?, ?, ?, ?, ?)
      `).run(ticketNumber, registrationId, currentTime.toISOString(), adminId, qrData);

      db.prepare(`
        INSERT INTO admin_audit_log (admin_id, admin_username, action, target_type, target_id, details, created_at)
        VALUES (?, ?, 'PAYMENT_APPROVED', 'registration', ?, ?, ?)
      `).run(adminId, adminUsername, registrationId, 
        JSON.stringify({ ticketNumber, amount: reg.total_amount }),
        currentTime.toISOString());

      return ticketNumber;
    });

    const ticketNumber = approveTransaction();

    let qrImageBase64 = '';
    try {
      qrImageBase64 = await QRCode.toDataURL(JSON.stringify({ t: ticketNumber, r: registrationId, v: 'SPH2026' }), { 
        width: 200, 
        margin: 2,
        color: { dark: '#ff6600', light: '#1a1a2e' }
      });
    } catch (e) {
      console.error('QR generation error:', e);
    }

    return { ticketNumber, qrImage: qrImageBase64 };
  }

  /**
   * Admin: Reject a payment.
   */
  async rejectPayment(registrationId, adminId, adminUsername, reason) {
    const currentTime = now();

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      const { data: reg, error: regErr } = await supabase
        .from('registrations')
        .select('*')
        .eq('id', registrationId)
        .maybeSingle();

      if (regErr || !reg) throw new Error('Registration not found');
      if (reg.status !== 'PAYMENT_UNDER_REVIEW') throw new Error('No pending payment to reject');

      // Update submission
      await supabase
        .from('payment_submissions')
        .update({
          status: 'REJECTED',
          reviewed_at: currentTime.toISOString(),
          review_decision: 'REJECTED',
          rejection_reason: reason
        })
        .eq('registration_id', registrationId)
        .eq('status', 'UNDER_REVIEW');

      // Update registration
      await supabase
        .from('registrations')
        .update({
          status: 'PAYMENT_REJECTED',
          updated_at: currentTime.toISOString()
        })
        .eq('id', registrationId);

      // Audit log
      await supabase.from('admin_audit_log').insert({
        admin_username: adminUsername || 'admin',
        action: 'PAYMENT_REJECTED',
        target_type: 'registration',
        target_id: registrationId,
        details: JSON.stringify({ reason, amount: reg.total_amount }),
        created_at: currentTime.toISOString()
      });

      return { success: true };
    }

    // SQLite mode
    const db = getDb();
    const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(registrationId);
    if (!reg) throw new Error('Registration not found');
    if (reg.status !== 'PAYMENT_UNDER_REVIEW') throw new Error('No pending payment to reject');

    const rejectTransaction = db.transaction(() => {
      db.prepare(`
        UPDATE payment_submissions SET status = 'REJECTED', reviewed_by = ?, reviewed_at = ?, 
        review_decision = 'REJECTED', rejection_reason = ?
        WHERE registration_id = ? AND status = 'UNDER_REVIEW'
      `).run(adminId, currentTime.toISOString(), reason, registrationId);

      db.prepare('UPDATE registrations SET status = ?, updated_at = ? WHERE id = ?')
        .run('PAYMENT_REJECTED', currentTime.toISOString(), registrationId);

      db.prepare(`
        INSERT INTO admin_audit_log (admin_id, admin_username, action, target_type, target_id, details, created_at)
        VALUES (?, ?, 'PAYMENT_REJECTED', 'registration', ?, ?, ?)
      `).run(adminId, adminUsername, registrationId, 
        JSON.stringify({ reason, amount: reg.total_amount }),
        currentTime.toISOString());
    });

    rejectTransaction();

    return { success: true };
  }

  /**
   * Expire stale payment sessions.
   */
  async expireStalePaymentSessions() {
    const currentTime = now();

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      const { data: expiredSessions } = await supabase
        .from('payment_sessions')
        .select('id, registration_id')
        .eq('status', 'ACTIVE')
        .lte('expires_at', currentTime.toISOString());

      if (!expiredSessions || expiredSessions.length === 0) return 0;

      for (const s of expiredSessions) {
        await supabase
          .from('payment_sessions')
          .update({ status: 'EXPIRED' })
          .eq('id', s.id);

        const { data: reg } = await supabase
          .from('registrations')
          .select('status')
          .eq('id', s.registration_id)
          .maybeSingle();

        if (reg && reg.status === 'PENDING_PAYMENT') {
          await supabase
            .from('registrations')
            .update({ status: 'EXPIRED', updated_at: currentTime.toISOString() })
            .eq('id', s.registration_id);
        }
      }

      return expiredSessions.length;
    }

    // SQLite mode
    const db = getDb();
    const expiredSessions = db.prepare(`
      SELECT ps.id as session_id, ps.registration_id 
      FROM payment_sessions ps
      JOIN registrations r ON r.id = ps.registration_id
      WHERE ps.status = 'ACTIVE' AND ps.expires_at <= ?
    `).all(currentTime.toISOString());

    for (const session of expiredSessions) {
      db.prepare('UPDATE payment_sessions SET status = ? WHERE id = ?').run('EXPIRED', session.session_id);
      
      const reg = db.prepare('SELECT status FROM registrations WHERE id = ?').get(session.registration_id);
      if (reg && reg.status === 'PENDING_PAYMENT') {
        db.prepare('UPDATE registrations SET status = ?, updated_at = ? WHERE id = ?')
          .run('EXPIRED', currentTime.toISOString(), session.registration_id);
      }
    }

    return expiredSessions.length;
  }
}

module.exports = new PaymentService();
