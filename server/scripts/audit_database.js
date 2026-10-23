const { getDb } = require('../src/db/database');

const db = getDb();
console.log('=== COMPREHENSIVE DATABASE AUDIT ===\n');

// 1. Registrations count by status
const statusCounts = db.prepare('SELECT status, count(*) as count, sum(participant_count) as total_parts, sum(total_amount) as total_rev FROM registrations GROUP BY status').all();
console.log('1. Registrations Status Breakdown:');
console.table(statusCounts);

// 2. Duplicate Registration IDs
const dupRegIds = db.prepare('SELECT id, count(*) as c FROM registrations GROUP BY id HAVING c > 1').all();
console.log('2. Duplicate Registration IDs:', dupRegIds.length === 0 ? 'None (0)' : dupRegIds);

// 3. Duplicate Access Tokens
const dupTokens = db.prepare('SELECT access_token, count(*) as c FROM registrations GROUP BY access_token HAVING c > 1').all();
console.log('3. Duplicate Access Tokens:', dupTokens.length === 0 ? 'None (0)' : dupTokens);

// 4. Duplicate Tickets by Ticket Number
const dupTicketNums = db.prepare('SELECT ticket_number, count(*) as c FROM tickets GROUP BY ticket_number HAVING c > 1').all();
console.log('4. Duplicate Ticket Numbers:', dupTicketNums.length === 0 ? 'None (0)' : dupTicketNums);

// 5. Multiple Tickets for the same Registration
const dupRegTickets = db.prepare('SELECT registration_id, count(*) as c FROM tickets GROUP BY registration_id HAVING c > 1').all();
console.log('5. Multiple Tickets for single Registration:', dupRegTickets.length === 0 ? 'None (0)' : dupRegTickets);

// 6. Duplicate UTR in payment_submissions
const dupUtrs = db.prepare('SELECT utr_normalized, count(*) as c, group_concat(registration_id) as regs, group_concat(status) as statuses FROM payment_submissions GROUP BY utr_normalized HAVING c > 1').all();
console.log('6. Duplicate Normalized UTRs in payment_submissions:', dupUtrs.length === 0 ? 'None (0)' : dupUtrs);

// 7. Multiple payment submissions for the same registration
const multiSubs = db.prepare('SELECT registration_id, count(*) as c FROM payment_submissions GROUP BY registration_id HAVING c > 1').all();
console.log('7. Multiple submissions for same Registration:', multiSubs.length === 0 ? 'None (0)' : multiSubs);

// 8. Registrations with verified payment but no valid ticket
const verifiedNoTicket = db.prepare(`
  SELECT r.id, r.full_name, r.status, t.ticket_number, t.is_valid
  FROM registrations r
  LEFT JOIN tickets t ON t.registration_id = r.id
  WHERE r.status = 'PAYMENT_VERIFIED' AND (t.id IS NULL OR t.is_valid = 0)
`).all();
console.log('8. PAYMENT_VERIFIED registrations without valid ticket:', verifiedNoTicket.length === 0 ? 'None (0)' : verifiedNoTicket);

// 9. Valid tickets where registration is NOT PAYMENT_VERIFIED
const ticketNoVerified = db.prepare(`
  SELECT t.id, t.ticket_number, t.is_valid, r.id as reg_id, r.status as reg_status
  FROM tickets t
  LEFT JOIN registrations r ON r.id = t.registration_id
  WHERE t.is_valid = 1 AND (r.id IS NULL OR r.status != 'PAYMENT_VERIFIED')
`).all();
console.log('9. Valid tickets where registration is not verified:', ticketNoVerified.length === 0 ? 'None (0)' : ticketNoVerified);

// 10. Check if any duplicate UTR exists across different registrations (even if one is rejected or cancelled)
const allUtrPairs = db.prepare(`
  SELECT ps1.utr_normalized, ps1.registration_id as reg1, ps1.status as status1,
         ps2.registration_id as reg2, ps2.status as status2
  FROM payment_submissions ps1
  JOIN payment_submissions ps2 ON ps1.utr_normalized = ps2.utr_normalized AND ps1.id < ps2.id
`).all();
console.log('10. Any matching UTRs across submissions (any status):', allUtrPairs.length === 0 ? 'None (0)' : allUtrPairs);

// 11. Check total rows in all tables
const totalRegs = db.prepare('SELECT count(*) as c FROM registrations').get().c;
const totalSubs = db.prepare('SELECT count(*) as c FROM payment_submissions').get().c;
const totalTickets = db.prepare('SELECT count(*) as c FROM tickets').get().c;
console.log(`\nTotals: Registrations = ${totalRegs}, Submissions = ${totalSubs}, Tickets = ${totalTickets}`);
