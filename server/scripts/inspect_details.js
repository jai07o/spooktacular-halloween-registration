const { getDb } = require('../src/db/database');

const db = getDb();
console.log('--- ALL REGISTRATIONS ---');
const regs = db.prepare('SELECT id, full_name, phone, participant_count, total_amount, status, cancellation_reason, created_at FROM registrations').all();
console.table(regs);

console.log('\n--- ALL PAYMENT SUBMISSIONS ---');
const subs = db.prepare('SELECT id, registration_id, utr_reference, utr_normalized, status, review_decision, submitted_at FROM payment_submissions').all();
console.table(subs);

console.log('\n--- ALL TICKETS ---');
const tickets = db.prepare('SELECT id, ticket_number, registration_id, is_valid, issued_at FROM tickets').all();
console.table(tickets);
