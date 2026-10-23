/**
 * Admin setup script - creates the initial admin account.
 * Run: node src/scripts/setup-admin.js
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { getDb, initializeDb } = require('../db/database');

async function setupAdmin() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  const email = process.env.ADMIN_EMAIL || '';

  if (!password) {
    console.error('ERROR: ADMIN_PASSWORD environment variable is required.');
    console.error('Set it in your .env file or environment.');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('ERROR: Admin password must be at least 8 characters.');
    process.exit(1);
  }

  try {
    const db = getDb();
    initializeDb(db);

    // Check if admin already exists
    const existing = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(username);
    if (existing) {
      // Update password
      const hash = bcrypt.hashSync(password, 12);
      db.prepare('UPDATE admin_users SET password_hash = ?, email = ?, updated_at = datetime("now") WHERE username = ?')
        .run(hash, email, username);
      console.log(`Admin user "${username}" password updated successfully.`);
    } else {
      // Create new admin
      const hash = bcrypt.hashSync(password, 12);
      db.prepare('INSERT INTO admin_users (username, email, password_hash, role) VALUES (?, ?, ?, ?)')
        .run(username, email, hash, 'admin');
      console.log(`Admin user "${username}" created successfully.`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Setup failed:', error.message);
    process.exit(1);
  }
}

setupAdmin();
