/**
 * Excel export service - generates XLSX files from registration data.
 * Supports persistent Supabase PostgreSQL and local SQLite.
 */

const XLSX = require('xlsx');
const { getDb } = require('../db/database');
const { getSupabase, isSupabaseConfigured } = require('../db/supabase');
const { sanitizeForExcel } = require('../utils/validation');

class ExcelService {
  /**
   * Generate Excel export of registrations.
   */
  async generateExport({ search, status, dateFrom, dateTo } = {}) {
    let rows = [];

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      let query = supabase.from('registrations').select(`
        *,
        tickets (*),
        payment_submissions (*)
      `);

      if (search) {
        query = query.or(`id.ilike.%${search}%,full_name.ilike.%${search}%,phone.ilike.%${search}%`);
      }
      if (status) {
        query = query.eq('status', status);
      }
      if (dateFrom) {
        query = query.gte('created_at', dateFrom);
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) {
        throw new Error(`Failed to export from Supabase: ${error.message}`);
      }

      rows = (data || []).map(r => {
        const latestTicket = r.tickets && r.tickets.length > 0
          ? r.tickets.sort((a, b) => new Date(b.issued_at) - new Date(a.issued_at))[0]
          : null;
        const latestSub = r.payment_submissions && r.payment_submissions.length > 0
          ? r.payment_submissions.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))[0]
          : null;

        return {
          ...r,
          ticket_number: latestTicket?.ticket_number || null,
          ticket_issued_at: latestTicket?.issued_at || null,
          ticket_is_valid: latestTicket?.is_valid ? 1 : 0,
          utr_reference: latestSub?.utr_reference || null,
          utr_normalized: latestSub?.utr_normalized || null,
          payment_submitted_at: latestSub?.submitted_at || null,
          verification_timestamp: latestSub?.reviewed_at || null,
          payment_submission_status: latestSub?.status || null
        };
      });
    } else {
      const db = getDb();
      let conditions = [];
      let params = [];

      if (search) {
        conditions.push(`(r.id LIKE ? OR r.full_name LIKE ? OR r.phone LIKE ? OR t.ticket_number LIKE ? OR ps.utr_reference LIKE ?)`);
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam, searchParam, searchParam);
      }

      if (status) {
        conditions.push('r.status = ?');
        params.push(status);
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

      rows = db.prepare(`
        SELECT DISTINCT r.*, t.ticket_number, t.issued_at as ticket_issued_at, t.is_valid as ticket_is_valid,
          ps.utr_reference, ps.utr_normalized, ps.submitted_at as payment_submitted_at, 
          ps.reviewed_at as verification_timestamp, ps.status as payment_submission_status
        FROM registrations r
        LEFT JOIN tickets t ON t.registration_id = r.id AND t.id = (SELECT MAX(id) FROM tickets WHERE registration_id = r.id)
        LEFT JOIN payment_submissions ps ON ps.registration_id = r.id 
          AND ps.id = (SELECT MAX(id) FROM payment_submissions WHERE registration_id = r.id)
        ${whereClause}
        ORDER BY r.created_at DESC
      `).all(...params);
    }

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Main data sheet
    const dataHeaders = [
      'Registration ID',
      'Registration Date',
      'Name',
      'Phone Number',
      'Participants',
      'Place',
      'State',
      'District',
      'Unit Price (₹)',
      'Total Amount (₹)',
      'UTR / Transaction Ref',
      'Payment Status',
      'Ticket Number',
      'Ticket Valid',
      'Verification Timestamp',
      'Cancellation Reason'
    ];

    const dataRows = rows.map(row => [
      sanitizeForExcel(row.id),
      sanitizeForExcel(row.created_at),
      sanitizeForExcel(row.full_name),
      sanitizeForExcel(row.phone),
      row.participant_count,
      sanitizeForExcel(row.place),
      sanitizeForExcel(row.state),
      sanitizeForExcel(row.district),
      row.unit_price,
      row.total_amount,
      sanitizeForExcel(row.utr_reference || ''),
      sanitizeForExcel(row.status),
      sanitizeForExcel(row.ticket_number || ''),
      row.ticket_number ? (row.ticket_is_valid ? 'Yes' : 'Revoked') : '',
      sanitizeForExcel(row.verification_timestamp || ''),
      sanitizeForExcel(row.cancellation_reason || '')
    ]);

    const ws = XLSX.utils.aoa_to_sheet([dataHeaders, ...dataRows]);

    ws['!cols'] = [
      { wch: 20 }, // Reg ID
      { wch: 22 }, // Date
      { wch: 25 }, // Name
      { wch: 15 }, // Phone
      { wch: 12 }, // Participants
      { wch: 18 }, // Place
      { wch: 18 }, // State
      { wch: 18 }, // District
      { wch: 14 }, // Unit Price
      { wch: 14 }, // Total Amount
      { wch: 25 }, // UTR
      { wch: 20 }, // Status
      { wch: 20 }, // Ticket
      { wch: 12 }, // Ticket Valid
      { wch: 22 }, // Verification
      { wch: 40 }  // Cancellation Reason
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Registrations');

    // Summary sheet
    const activeRows = rows.filter(r => ['PENDING_PAYMENT', 'PAYMENT_UNDER_REVIEW', 'PAYMENT_VERIFIED'].includes(r.status));
    const totalActiveRegistrations = activeRows.length;
    const totalActiveParticipants = activeRows.reduce((sum, r) => sum + r.participant_count, 0);

    const statusCounts = {};
    rows.forEach(r => {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    });

    const verifiedAmount = rows
      .filter(r => r.status === 'PAYMENT_VERIFIED' && (r.ticket_is_valid === 1 || r.ticket_is_valid === true))
      .reduce((sum, r) => sum + r.total_amount, 0);

    const claimedAmount = rows
      .filter(r => ['PAYMENT_UNDER_REVIEW', 'PAYMENT_VERIFIED'].includes(r.status))
      .reduce((sum, r) => sum + r.total_amount, 0);

    const uniqueUtrs = new Set(rows.filter(r => r.utr_normalized).map(r => r.utr_normalized));
    const validTickets = rows.filter(r => r.ticket_number && (r.ticket_is_valid === 1 || r.ticket_is_valid === true));

    const summaryData = [
      ['SPOOKTACULAR HALLOWEEN PARTY 2026 - FINANCIAL & ATTENDANCE SUMMARY'],
      ['Report Generated At', new Date().toISOString()],
      ['Filter Applied - Status', status || 'ALL'],
      ['Filter Applied - Search', search || 'NONE'],
      [''],
      ['METRIC', 'VALUE'],
      ['Total Registrations (Exported)', rows.length],
      ['Active Valid Registrations', totalActiveRegistrations],
      ['Total Active Participants', totalActiveParticipants],
      ['Confirmed Tickets Issued', validTickets.length],
      ['Unique UTR References Verified', uniqueUtrs.size],
      ['Verified Revenue (₹)', verifiedAmount],
      ['Total Claimed Amount (₹)', claimedAmount],
      ['Pending Payment Count', statusCounts['PENDING_PAYMENT'] || 0],
      ['Under Review Count', (statusCounts['PAYMENT_UNDER_REVIEW'] || 0) + (statusCounts['UNDER_REVIEW'] || 0)],
      ['Approved / Verified Count', statusCounts['PAYMENT_VERIFIED'] || 0],
      ['Rejected Count', (statusCounts['PAYMENT_REJECTED'] || 0) + (statusCounts['REJECTED'] || 0)],
      ['Expired Sessions Count', statusCounts['EXPIRED'] || 0],
      ['Cancelled / Duplicate Resolved', statusCounts['CANCELLED'] || 0],
      ['Flagged For Review', statusCounts['FLAGGED_FOR_REVIEW'] || 0]
    ];

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 35 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }
}

module.exports = new ExcelService();
