const { getDb } = require('../src/db/database');

const db = getDb();
console.log('--- TABLES SUMMARY ---');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name));

for (const t of tables) {
  if (t.name === 'sqlite_sequence') continue;
  const count = db.prepare(`SELECT count(*) as c FROM ${t.name}`).get().c;
  console.log(`Table ${t.name}: ${count} rows`);
}

console.log('\n--- ALL REGISTRATIONS ---');
const regs = db.prepare('SELECT id, full_name, phone, participant_count, total_amount, status, access_token, created_at FROM registrations ORDER BY created_at ASC').all();
console.table(regs);

console.log('\n--- ALL PAYMENT SESSIONS ---');
const sessions = db.prepare('SELECT * FROM payment_sessions').all();
console.table(sessions);

console.log('\n--- ALL PAYMENT SUBMISSIONS ---');
const submissions = db.prepare('SELECT * FROM payment_submissions').all();
console.table(submissions);

console.log('\n--- ALL TICKETS ---');
const tickets = db.prepare('SELECT * FROM tickets').all();
console.table(tickets);

console.log('\n--- ALL ADMIN AUDIT LOGS ---');
const logs = db.prepare('SELECT * FROM admin_audit_log').all();
console.table(logs);
