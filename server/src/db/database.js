const path = require('path');
const fs = require('fs');
const { isSupabaseConfigured, getSupabase } = require('./supabase');

let Database = null;
if (!isSupabaseConfigured()) {
  try {
    const sqliteMod = 'better-sqlite3';
    Database = require(sqliteMod);
  } catch (e) {
    // Better-sqlite3 is optional in production environments running Supabase
  }
}

let db = null;

function getDbPath() {
  const dbPath = process.env.DATABASE_PATH || './data/spooktacular.db';
  const fullPath = path.resolve(__dirname, '../../', dbPath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return fullPath;
}

function getDb() {
  if (db) return db;
  if (!Database) {
    if (isSupabaseConfigured()) {
      return null;
    }
    throw new Error('SQLite driver (better-sqlite3) is not installed and Supabase credentials are not configured.');
  }
  const dbPath = getDbPath();
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

function initializeDb(dbInstance) {
  if (isSupabaseConfigured()) {
    // Supabase PostgreSQL handles schema through version-controlled migrations
    return null;
  }
  const database = dbInstance || getDb();
  if (!database) return null;

  database.exec(`
    -- Admin users table
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Registrations table
    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      participant_count INTEGER NOT NULL CHECK(participant_count > 0),
      place TEXT NOT NULL,
      state TEXT NOT NULL,
      district TEXT NOT NULL,
      unit_price INTEGER NOT NULL,
      total_amount INTEGER NOT NULL,
      pricing_category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
      access_token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Payment sessions table
    CREATE TABLE IF NOT EXISTS payment_sessions (
      id TEXT PRIMARY KEY,
      registration_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (registration_id) REFERENCES registrations(id)
    );

    -- Payment submissions table
    CREATE TABLE IF NOT EXISTS payment_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      utr_reference TEXT NOT NULL,
      utr_normalized TEXT NOT NULL,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'UNDER_REVIEW',
      reviewed_by INTEGER,
      reviewed_at TEXT,
      review_decision TEXT,
      rejection_reason TEXT,
      FOREIGN KEY (registration_id) REFERENCES registrations(id),
      FOREIGN KEY (session_id) REFERENCES payment_sessions(id),
      FOREIGN KEY (reviewed_by) REFERENCES admin_users(id)
    );

    -- Unique constraint on normalized UTR
    CREATE UNIQUE INDEX IF NOT EXISTS idx_utr_normalized 
      ON payment_submissions(utr_normalized) 
      WHERE status != 'REJECTED';

    -- Prevent multiple active submissions on the same registration simultaneously
    CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_submission 
      ON payment_submissions(registration_id) 
      WHERE status IN ('UNDER_REVIEW', 'APPROVED', 'FLAGGED_FOR_REVIEW');

    -- Tickets table
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_number TEXT NOT NULL UNIQUE,
      registration_id TEXT NOT NULL UNIQUE,
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      issued_by INTEGER,
      qr_data TEXT,
      FOREIGN KEY (registration_id) REFERENCES registrations(id),
      FOREIGN KEY (issued_by) REFERENCES admin_users(id)
    );

    -- Admin audit log
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      admin_username TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (admin_id) REFERENCES admin_users(id)
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_reg_phone ON registrations(phone);
    CREATE INDEX IF NOT EXISTS idx_reg_status ON registrations(status);
    CREATE INDEX IF NOT EXISTS idx_reg_created ON registrations(created_at);
    CREATE INDEX IF NOT EXISTS idx_reg_access_token ON registrations(access_token);
    CREATE INDEX IF NOT EXISTS idx_ps_registration ON payment_sessions(registration_id);
    CREATE INDEX IF NOT EXISTS idx_ps_status ON payment_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_psub_registration ON payment_submissions(registration_id);
    CREATE INDEX IF NOT EXISTS idx_psub_utr ON payment_submissions(utr_normalized);
    CREATE INDEX IF NOT EXISTS idx_ticket_number ON tickets(ticket_number);
    CREATE INDEX IF NOT EXISTS idx_ticket_reg ON tickets(registration_id);
    CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_log(admin_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON admin_audit_log(action);
  `);

  // Run schema upgrades safely if columns do not exist
  const safeAddColumn = (table, colDef) => {
    try {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
    } catch (e) {
      // Column already exists or table altered
    }
  };

  safeAddColumn('registrations', 'cancellation_reason TEXT');
  safeAddColumn('registrations', 'cancelled_at TEXT');
  safeAddColumn('registrations', 'cancelled_by INTEGER');
  safeAddColumn('registrations', 'is_flagged_duplicate INTEGER DEFAULT 0');
  safeAddColumn('registrations', 'duplicate_flag_reason TEXT');
  safeAddColumn('tickets', 'is_valid INTEGER NOT NULL DEFAULT 1');
  safeAddColumn('tickets', 'revoked_at TEXT');
  safeAddColumn('tickets', 'revoked_reason TEXT');
  safeAddColumn('payment_submissions', 'is_flagged_duplicate INTEGER DEFAULT 0');


  return database;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, initializeDb, closeDb, getDbPath };
