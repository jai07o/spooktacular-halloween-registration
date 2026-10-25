/**
 * Registration service - handles registration creation and queries.
 * Supports both persistent Supabase PostgreSQL (production/Vercel) and local SQLite (testing/offline).
 */

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { getSupabase, isSupabaseConfigured } = require('../db/supabase');
const { getCurrentPricing, isRegistrationClosed, now, toISOStringIST } = require('../utils/time');
const { generateRegistrationId } = require('../utils/validation');

class RegistrationService {
  /**
   * Create a new registration.
   */
  async createRegistration({ fullName, phone, participantCount, place, state, district }) {
    const currentTime = now();

    if (isRegistrationClosed(currentTime)) {
      throw new Error('Registration is closed. The deadline was 30 October 2026.');
    }

    const pricing = getCurrentPricing(currentTime);
    if (!pricing.available) {
      throw new Error(pricing.reason);
    }

    const id = generateRegistrationId();
    const accessToken = uuidv4();
    const totalAmount = participantCount * pricing.unitPrice;
    const createdAt = currentTime.toISOString();

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('registrations')
        .insert({
          id,
          full_name: fullName,
          phone,
          participant_count: participantCount,
          place,
          state,
          district,
          unit_price: pricing.unitPrice,
          total_amount: totalAmount,
          pricing_category: pricing.category,
          status: 'PENDING_PAYMENT',
          access_token: accessToken,
          created_at: createdAt,
          updated_at: createdAt
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Database error creating registration: ${error.message}`);
      }

      return {
        id,
        fullName,
        full_name: fullName,
        phone,
        participantCount,
        participant_count: participantCount,
        place,
        state,
        district,
        unitPrice: pricing.unitPrice,
        unit_price: pricing.unitPrice,
        totalAmount,
        total_amount: totalAmount,
        pricingCategory: pricing.category,
        pricing_category: pricing.category,
        pricingLabel: pricing.label,
        status: 'PENDING_PAYMENT',
        accessToken,
        access_token: accessToken,
        createdAt,
        created_at: createdAt
      };
    }

    // SQLite fallback
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO registrations (id, full_name, phone, participant_count, place, state, district,
        unit_price, total_amount, pricing_category, status, access_token, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_PAYMENT', ?, ?, ?)
    `);

    stmt.run(id, fullName, phone, participantCount, place, state, district,
      pricing.unitPrice, totalAmount, pricing.category, accessToken, createdAt, createdAt);

    return {
      id,
      fullName,
      full_name: fullName,
      phone,
      participantCount,
      participant_count: participantCount,
      place,
      state,
      district,
      unitPrice: pricing.unitPrice,
      unit_price: pricing.unitPrice,
      totalAmount,
      total_amount: totalAmount,
      pricingCategory: pricing.category,
      pricing_category: pricing.category,
      pricingLabel: pricing.label,
      status: 'PENDING_PAYMENT',
      accessToken,
      access_token: accessToken,
      createdAt,
      created_at: createdAt
    };
  }

  /**
   * Get registration by ID (admin use).
   */
  async getRegistrationById(id) {
    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      const { data: reg, error } = await supabase
        .from('registrations')
        .select(`
          *,
          tickets (*),
          payment_submissions (*)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error || !reg) return null;

      // Extract latest ticket and submission
      const latestTicket = Array.isArray(reg.tickets)
        ? (reg.tickets.length > 0 ? reg.tickets.sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at))[0] : null)
        : (reg.tickets || null);

      const latestSub = Array.isArray(reg.payment_submissions)
        ? (reg.payment_submissions.length > 0 ? reg.payment_submissions.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))[0] : null)
        : (reg.payment_submissions || null);

      return {
        ...reg,
        ticket_number: latestTicket?.ticket_number || null,
        ticket_issued_at: latestTicket?.issued_at || null,
        qr_data: latestTicket?.qr_data || null,
        ticket_is_valid: latestTicket?.is_valid ? 1 : 0,
        utr_reference: latestSub?.utr_reference || null,
        utr_normalized: latestSub?.utr_normalized || null,
        payment_submitted_at: latestSub?.submitted_at || null,
        payment_submission_status: latestSub?.status || null,
        reviewed_at: latestSub?.reviewed_at || null,
        review_decision: latestSub?.review_decision || null,
        rejection_reason: latestSub?.rejection_reason || null
      };
    }

    const db = getDb();
    return db.prepare(`
      SELECT r.*, t.ticket_number, t.issued_at as ticket_issued_at, t.is_valid as ticket_is_valid, t.qr_data,
        ps.utr_reference, ps.utr_normalized, ps.submitted_at as payment_submitted_at, ps.status as payment_submission_status,
        ps.reviewed_at, ps.review_decision, ps.rejection_reason
      FROM registrations r
      LEFT JOIN tickets t ON t.registration_id = r.id AND t.id = (SELECT MAX(id) FROM tickets WHERE registration_id = r.id)
      LEFT JOIN payment_submissions ps ON ps.registration_id = r.id 
        AND ps.id = (SELECT MAX(id) FROM payment_submissions WHERE registration_id = r.id)
      WHERE r.id = ?
    `).get(id);
  }

  /**
   * Get registration by access token (user use).
   */
  async getRegistrationByToken(token) {
    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      const { data: reg, error } = await supabase
        .from('registrations')
        .select(`
          *,
          tickets (*),
          payment_submissions (*)
        `)
        .eq('access_token', token)
        .maybeSingle();

      if (error || !reg) return null;

      const latestTicket = Array.isArray(reg.tickets)
        ? (reg.tickets.length > 0 ? reg.tickets.sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at))[0] : null)
        : (reg.tickets || null);

      const latestSub = Array.isArray(reg.payment_submissions)
        ? (reg.payment_submissions.length > 0 ? reg.payment_submissions.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))[0] : null)
        : (reg.payment_submissions || null);

      return {
        ...reg,
        ticket_number: latestTicket?.ticket_number || null,
        ticket_issued_at: latestTicket?.issued_at || null,
        qr_data: latestTicket?.qr_data || null,
        ticket_is_valid: latestTicket?.is_valid ? 1 : 0,
        utr_reference: latestSub?.utr_reference || null,
        utr_normalized: latestSub?.utr_normalized || null,
        payment_submitted_at: latestSub?.submitted_at || null,
        payment_submission_status: latestSub?.status || null,
        reviewed_at: latestSub?.reviewed_at || null,
        review_decision: latestSub?.review_decision || null,
        rejection_reason: latestSub?.rejection_reason || null
      };
    }

    const db = getDb();
    return db.prepare(`
      SELECT r.*, t.ticket_number, t.issued_at as ticket_issued_at, t.is_valid as ticket_is_valid, t.qr_data,
        ps.utr_reference, ps.utr_normalized, ps.submitted_at as payment_submitted_at, ps.status as payment_submission_status,
        ps.reviewed_at, ps.review_decision, ps.rejection_reason
      FROM registrations r
      LEFT JOIN tickets t ON t.registration_id = r.id AND t.id = (SELECT MAX(id) FROM tickets WHERE registration_id = r.id)
      LEFT JOIN payment_submissions ps ON ps.registration_id = r.id 
        AND ps.id = (SELECT MAX(id) FROM payment_submissions WHERE registration_id = r.id)
      WHERE r.access_token = ?
    `).get(token);
  }

  /**
   * Get all registrations with pagination, filtering, sorting.
   */
  async getRegistrations({ page = 1, limit = 20, search, status, dateFrom, dateTo, sortBy = 'created_at', sortOrder = 'DESC' }) {
    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      const offset = (page - 1) * limit;

      let query = supabase
        .from('registrations')
        .select(`
          *,
          tickets (*),
          payment_submissions (*)
        `, { count: 'exact' });

      if (search) {
        query = query.or(`id.ilike.%${search}%,full_name.ilike.%${search}%,phone.ilike.%${search}%`);
      }

      if (status) {
        let normalizedStatus = status;
        if (status === 'UNDER_REVIEW') normalizedStatus = 'PAYMENT_UNDER_REVIEW';
        if (status === 'APPROVED') normalizedStatus = 'PAYMENT_VERIFIED';
        if (status === 'REJECTED') normalizedStatus = 'PAYMENT_REJECTED';
        if (status === 'CANCELLED' || status === 'ARCHIVED') normalizedStatus = 'CANCELLED';
        if (status === 'FLAGGED' || status === 'FLAGGED_FOR_REVIEW') normalizedStatus = 'FLAGGED_FOR_REVIEW';
        query = query.eq('status', normalizedStatus);
      }

      if (dateFrom) {
        query = query.gte('created_at', dateFrom);
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo);
      }

      const ascending = sortOrder === 'ASC';
      const safeSortBy = ['created_at', 'full_name', 'phone', 'participant_count', 'total_amount', 'status', 'id'].includes(sortBy)
        ? sortBy
        : 'created_at';

      query = query.order(safeSortBy, { ascending }).range(offset, offset + limit - 1);

      const { data, count, error } = await query;
      if (error) {
        throw new Error(`Supabase query error: ${error.message}`);
      }

      const rows = (data || []).map(r => {
        const latestTicket = Array.isArray(r.tickets)
          ? (r.tickets.length > 0 ? r.tickets.sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at))[0] : null)
          : (r.tickets || null);
        const latestSub = Array.isArray(r.payment_submissions)
          ? (r.payment_submissions.length > 0 ? r.payment_submissions.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))[0] : null)
          : (r.payment_submissions || null);

        return {
          ...r,
          ticket_number: latestTicket?.ticket_number || null,
          ticket_issued_at: latestTicket?.issued_at || null,
          ticket_is_valid: latestTicket?.is_valid ? 1 : 0,
          utr_reference: latestSub?.utr_reference || null,
          utr_normalized: latestSub?.utr_normalized || null,
          payment_submitted_at: latestSub?.submitted_at || null,
          payment_submission_status: latestSub?.status || null,
          reviewed_at: latestSub?.reviewed_at || null,
          review_decision: latestSub?.review_decision || null,
          rejection_reason: latestSub?.rejection_reason || null
        };
      });

      return {
        registrations: rows,
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      };
    }

    // SQLite mode
    const db = getDb();
    const offset = (page - 1) * limit;
    let conditions = [];
    let params = [];

    if (search) {
      conditions.push(`(r.id LIKE ? OR r.full_name LIKE ? OR r.phone LIKE ? OR t.ticket_number LIKE ? OR ps.utr_reference LIKE ?)`);
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam);
    }

    if (status) {
      let normalizedStatus = status;
      if (status === 'UNDER_REVIEW') normalizedStatus = 'PAYMENT_UNDER_REVIEW';
      if (status === 'APPROVED') normalizedStatus = 'PAYMENT_VERIFIED';
      if (status === 'REJECTED') normalizedStatus = 'PAYMENT_REJECTED';
      if (status === 'CANCELLED' || status === 'ARCHIVED') normalizedStatus = 'CANCELLED';
      if (status === 'FLAGGED' || status === 'FLAGGED_FOR_REVIEW') normalizedStatus = 'FLAGGED_FOR_REVIEW';
      conditions.push('r.status = ?');
      params.push(normalizedStatus);
    }

    if (dateFrom) {
      conditions.push('r.created_at >= ?');
      params.push(dateFrom);
    }

    if (dateTo) {
      conditions.push('r.created_at <= ?');
      params.push(dateTo);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const allowedSort = ['created_at', 'full_name', 'phone', 'participant_count', 'total_amount', 'status', 'id'];
    const safeSortBy = allowedSort.includes(sortBy) ? `r.${sortBy}` : 'r.created_at';
    const safeSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const countResult = db.prepare(`
      SELECT COUNT(DISTINCT r.id) as total FROM registrations r
      LEFT JOIN tickets t ON t.registration_id = r.id AND t.id = (SELECT MAX(id) FROM tickets WHERE registration_id = r.id)
      LEFT JOIN payment_submissions ps ON ps.registration_id = r.id 
        AND ps.id = (SELECT MAX(id) FROM payment_submissions WHERE registration_id = r.id)
      ${whereClause}
    `).get(...params);

    const rows = db.prepare(`
      SELECT r.*, t.ticket_number, t.issued_at as ticket_issued_at, t.is_valid as ticket_is_valid,
        ps.utr_reference, ps.utr_normalized, ps.submitted_at as payment_submitted_at, ps.status as payment_submission_status,
        ps.reviewed_at, ps.review_decision, ps.rejection_reason
      FROM registrations r
      LEFT JOIN tickets t ON t.registration_id = r.id AND t.id = (SELECT MAX(id) FROM tickets WHERE registration_id = r.id)
      LEFT JOIN payment_submissions ps ON ps.registration_id = r.id 
        AND ps.id = (SELECT MAX(id) FROM payment_submissions WHERE registration_id = r.id)
      ${whereClause}
      ORDER BY ${safeSortBy} ${safeSortOrder}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return {
      registrations: rows,
      total: countResult.total,
      page,
      limit,
      totalPages: Math.ceil(countResult.total / limit)
    };
  }

  /**
   * Get dashboard statistics.
   * In Supabase mode, delegates to the server-side PostgreSQL function get_dashboard_statistics().
   * In SQLite mode, calculates metrics synchronously.
   */
  getStatistics() {
    if (isSupabaseConfigured()) {
      return this._getSupabaseStatistics();
    }
    return this._getSqliteStatistics();
  }

  async _getSupabaseStatistics() {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('get_dashboard_statistics');
    if (error) {
      throw new Error(`Failed to retrieve Supabase statistics: ${error.message}`);
    }
    return data;
  }

  _getSqliteStatistics() {
    const db = getDb();
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_registrations,
        COALESCE(SUM(CASE WHEN status IN ('PENDING_PAYMENT', 'PAYMENT_UNDER_REVIEW', 'PAYMENT_VERIFIED') THEN 1 ELSE 0 END), 0) as active_registrations,
        COALESCE(SUM(CASE WHEN status IN ('PENDING_PAYMENT', 'PAYMENT_UNDER_REVIEW', 'PAYMENT_VERIFIED') THEN participant_count ELSE 0 END), 0) as total_participants,
        COALESCE(SUM(CASE WHEN status = 'PENDING_PAYMENT' THEN 1 ELSE 0 END), 0) as pending_payment,
        COALESCE(SUM(CASE WHEN status = 'PAYMENT_UNDER_REVIEW' THEN 1 ELSE 0 END), 0) as under_review,
        COALESCE(SUM(CASE WHEN status = 'PAYMENT_VERIFIED' THEN 1 ELSE 0 END), 0) as approved,
        COALESCE(SUM(CASE WHEN status = 'PAYMENT_REJECTED' THEN 1 ELSE 0 END), 0) as rejected,
        COALESCE(SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END), 0) as expired,
        COALESCE(SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END), 0) as cancelled,
        COALESCE(SUM(CASE WHEN status = 'FLAGGED_FOR_REVIEW' THEN 1 ELSE 0 END), 0) as flagged_duplicates,
        COALESCE(SUM(CASE WHEN status IN ('PAYMENT_UNDER_REVIEW', 'PAYMENT_VERIFIED') THEN total_amount ELSE 0 END), 0) as total_claimed,
        COALESCE(SUM(CASE WHEN status = 'PAYMENT_VERIFIED' AND id IN (SELECT registration_id FROM tickets WHERE is_valid = 1) THEN total_amount ELSE 0 END), 0) as total_verified,
        (SELECT COUNT(DISTINCT ticket_number) FROM tickets WHERE is_valid = 1) as tickets_issued
      FROM registrations
    `).get();

    return {
      ...stats,
      totalRegistrations: stats.active_registrations,
      allTimeRegistrations: stats.total_registrations,
      totalParticipants: stats.total_participants,
      totalRevenue: stats.total_verified,
      flaggedDuplicates: stats.flagged_duplicates,
      byStatus: {
        PENDING_PAYMENT: stats.pending_payment,
        UNDER_REVIEW: stats.under_review,
        PAYMENT_UNDER_REVIEW: stats.under_review,
        APPROVED: stats.approved,
        PAYMENT_VERIFIED: stats.approved,
        REJECTED: stats.rejected,
        PAYMENT_REJECTED: stats.rejected,
        EXPIRED: stats.expired,
        CANCELLED: stats.cancelled,
        ARCHIVED: stats.cancelled,
        FLAGGED_FOR_REVIEW: stats.flagged_duplicates
      }
    };
  }

  /**
   * Remove / Cancel / Archive a registration safely.
   */
  async removeRegistration(registrationId, adminId, adminUsername, reason = 'Cancelled by administrator') {
    const currentTime = now().toISOString();

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      const { data: reg, error: fetchErr } = await supabase
        .from('registrations')
        .select('*')
        .eq('id', registrationId)
        .maybeSingle();

      if (fetchErr || !reg) throw new Error('Registration not found');

      // Check if ticket exists
      const { data: ticket } = await supabase
        .from('tickets')
        .select('*')
        .eq('registration_id', registrationId)
        .maybeSingle();

      // Revoke ticket if exists
      if (ticket) {
        await supabase
          .from('tickets')
          .update({
            is_valid: false,
            revoked_at: currentTime,
            revoked_reason: reason
          })
          .eq('registration_id', registrationId);
      }

      // Update registration to CANCELLED
      await supabase
        .from('registrations')
        .update({
          status: 'CANCELLED',
          cancellation_reason: reason,
          cancelled_at: currentTime,
          updated_at: currentTime
        })
        .eq('id', registrationId);

      // Add audit log
      await supabase.from('admin_audit_log').insert({
        admin_username: adminUsername || 'admin',
        action: 'REGISTRATION_REMOVED',
        target_type: 'registration',
        target_id: registrationId,
        details: JSON.stringify({
          previousStatus: reg.status,
          hadTicket: !!ticket,
          ticketNumber: ticket?.ticket_number || null,
          totalAmount: reg.total_amount,
          reason
        }),
        created_at: currentTime
      });

      return {
        success: true,
        registrationId,
        status: 'CANCELLED',
        revokedTicket: ticket ? ticket.ticket_number : null,
        message: 'Registration safely removed and archived.'
      };
    }

    // SQLite mode
    const db = getDb();
    const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(registrationId);
    if (!reg) throw new Error('Registration not found');

    const ticket = db.prepare('SELECT * FROM tickets WHERE registration_id = ?').get(registrationId);

    const removeTransaction = db.transaction(() => {
      if (ticket) {
        db.prepare(`
          UPDATE tickets SET is_valid = 0, revoked_at = ?, revoked_reason = ?
          WHERE registration_id = ?
        `).run(currentTime, reason, registrationId);
      }

      db.prepare(`
        UPDATE registrations SET status = 'CANCELLED', cancellation_reason = ?, cancelled_at = ?, cancelled_by = ?, updated_at = ?
        WHERE id = ?
      `).run(reason, currentTime, adminId, currentTime, registrationId);

      db.prepare(`
        INSERT INTO admin_audit_log (admin_id, admin_username, action, target_type, target_id, details, ip_address, created_at)
        VALUES (?, ?, 'REGISTRATION_REMOVED', 'registration', ?, ?, '127.0.0.1', ?)
      `).run(
        adminId,
        adminUsername,
        registrationId,
        JSON.stringify({
          previousStatus: reg.status,
          hadTicket: !!ticket,
          ticketNumber: ticket?.ticket_number || null,
          totalAmount: reg.total_amount,
          reason
        }),
        currentTime
      );
    });

    removeTransaction();

    return {
      success: true,
      registrationId,
      status: 'CANCELLED',
      revokedTicket: ticket ? ticket.ticket_number : null,
      message: 'Registration safely removed and archived.'
    };
  }

  /**
   * Restore an archived unpaid/pending registration.
   */
  async restoreRegistration(registrationId, adminId, adminUsername) {
    const currentTime = now().toISOString();

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      const { data: reg, error: fetchErr } = await supabase
        .from('registrations')
        .select('*')
        .eq('id', registrationId)
        .maybeSingle();

      if (fetchErr || !reg) throw new Error('Registration not found');
      if (reg.status !== 'CANCELLED') throw new Error('Only cancelled registrations can be restored');

      await supabase
        .from('registrations')
        .update({
          status: 'PENDING_PAYMENT',
          cancellation_reason: null,
          cancelled_at: null,
          updated_at: currentTime
        })
        .eq('id', registrationId);

      await supabase.from('admin_audit_log').insert({
        admin_username: adminUsername || 'admin',
        action: 'REGISTRATION_RESTORED',
        target_type: 'registration',
        target_id: registrationId,
        details: JSON.stringify({ restoredTo: 'PENDING_PAYMENT' }),
        created_at: currentTime
      });

      return {
        success: true,
        registrationId,
        status: 'PENDING_PAYMENT',
        message: 'Registration restored to PENDING_PAYMENT.'
      };
    }

    const db = getDb();
    const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(registrationId);
    if (!reg) throw new Error('Registration not found');
    if (reg.status !== 'CANCELLED') throw new Error('Only cancelled registrations can be restored');

    const restoreTransaction = db.transaction(() => {
      db.prepare(`
        UPDATE registrations SET status = 'PENDING_PAYMENT', cancellation_reason = NULL, cancelled_at = NULL, cancelled_by = NULL, updated_at = ?
        WHERE id = ?
      `).run(currentTime, registrationId);

      db.prepare(`
        INSERT INTO admin_audit_log (admin_id, admin_username, action, target_type, target_id, details, ip_address, created_at)
        VALUES (?, ?, 'REGISTRATION_RESTORED', 'registration', ?, ?, '127.0.0.1', ?)
      `).run(
        adminId,
        adminUsername,
        registrationId,
        JSON.stringify({ restoredTo: 'PENDING_PAYMENT' }),
        currentTime
      );
    });

    restoreTransaction();

    return {
      success: true,
      registrationId,
      status: 'PENDING_PAYMENT',
      message: 'Registration restored to PENDING_PAYMENT.'
    };
  }

  /**
   * Permanently delete a registration and all associated records from the database.
   * No restore is possible.
   */
  async permanentDeleteRegistration(id, adminId, adminUsername) {
    const currentTime = now().toISOString();

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      
      // Delete child records first
      await supabase.from('tickets').delete().eq('registration_id', id);
      await supabase.from('payment_submissions').delete().eq('registration_id', id);
      await supabase.from('payment_sessions').delete().eq('registration_id', id);

      // Delete the registration
      const { error } = await supabase.from('registrations').delete().eq('id', id);
      if (error) {
        throw new Error(`Failed to delete registration: ${error.message}`);
      }

      // Log permanent deletion in audit log
      await supabase.from('admin_audit_log').insert({
        admin_username: adminUsername || 'admin',
        action: 'PERMANENT_DELETE',
        target_type: 'registration',
        target_id: id,
        details: JSON.stringify({ deletedPermanently: true, noRestorePossible: true }),
        created_at: currentTime
      });

      return {
        success: true,
        registrationId: id,
        message: `Registration ${id} permanently deleted from database. No restore possible.`
      };
    }

    const db = getDb();
    const deleteTransaction = db.transaction(() => {
      db.prepare('DELETE FROM tickets WHERE registration_id = ?').run(id);
      db.prepare('DELETE FROM payment_submissions WHERE registration_id = ?').run(id);
      db.prepare('DELETE FROM payment_sessions WHERE registration_id = ?').run(id);
      db.prepare('DELETE FROM registrations WHERE id = ?').run(id);

      db.prepare(`
        INSERT INTO admin_audit_log (admin_id, admin_username, action, target_type, target_id, details, ip_address, created_at)
        VALUES (?, ?, 'PERMANENT_DELETE', 'registration', ?, ?, '127.0.0.1', ?)
      `).run(
        adminId || 1,
        adminUsername || 'admin',
        id,
        JSON.stringify({ deletedPermanently: true, noRestorePossible: true }),
        currentTime
      );
    });

    deleteTransaction();

    return {
      success: true,
      registrationId: id,
      message: `Registration ${id} permanently deleted from database. No restore possible.`
    };
  }

  /**
   * Permanently delete ALL registrations, tickets, submissions, and sessions from the database.
   * Total wipe / reset. No restore is possible.
   */
  async deleteAllRegistrations(adminId, adminUsername) {
    const currentTime = now().toISOString();

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();

      // Delete all tickets, submissions, sessions, and registrations
      await supabase.from('tickets').delete().neq('id', 0);
      await supabase.from('payment_submissions').delete().neq('id', 0);
      await supabase.from('payment_sessions').delete().neq('id', 'NONE');
      const { error } = await supabase.from('registrations').delete().neq('id', 'NONE');
      if (error) {
        throw new Error(`Failed to delete all registrations: ${error.message}`);
      }

      await supabase.from('admin_audit_log').insert({
        admin_username: adminUsername || 'admin',
        action: 'DELETE_ALL_REGISTRATIONS',
        target_type: 'database',
        target_id: 'all',
        details: JSON.stringify({ deletedAll: true, noRestorePossible: true }),
        created_at: currentTime
      });

      return {
        success: true,
        message: 'All registrations, tickets, and payment submissions permanently deleted from database. No restore possible.'
      };
    }

    const db = getDb();
    const deleteAllTransaction = db.transaction(() => {
      db.prepare('DELETE FROM tickets').run();
      db.prepare('DELETE FROM payment_submissions').run();
      db.prepare('DELETE FROM payment_sessions').run();
      db.prepare('DELETE FROM registrations').run();

      db.prepare(`
        INSERT INTO admin_audit_log (admin_id, admin_username, action, target_type, target_id, details, ip_address, created_at)
        VALUES (?, ?, 'DELETE_ALL_REGISTRATIONS', 'database', 'all', ?, '127.0.0.1', ?)
      `).run(
        adminId || 1,
        adminUsername || 'admin',
        JSON.stringify({ deletedAll: true, noRestorePossible: true }),
        currentTime
      );
    });

    deleteAllTransaction();

    return {
      success: true,
      message: 'All registrations, tickets, and payment submissions permanently deleted from database. No restore possible.'
    };
  }

  /**
   * Update registration status.
   */
  async updateStatus(id, status) {
    const currentTime = now().toISOString();
    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      await supabase
        .from('registrations')
        .update({ status, updated_at: currentTime })
        .eq('id', id);
      return;
    }
    const db = getDb();
    db.prepare('UPDATE registrations SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, currentTime, id);
  }
}

module.exports = new RegistrationService();
