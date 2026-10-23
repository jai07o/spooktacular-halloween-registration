/**
 * Express server entry point for Spooktacular Halloween Party.
 * Configured for both local Express development and Vercel Serverless Function deployment.
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initializeDb, getDb } = require('./db/database');
const { isSupabaseConfigured } = require('./db/supabase');
const registrationRoutes = require('./routes/registration');
const adminRoutes = require('./routes/admin');
const paymentService = require('./services/payment');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());

// CORS configuration
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CORS_ORIGIN,
  'http://localhost:5173'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or same-origin)
    if (!origin) return callback(null, true);
    if (process.env.CORS_ORIGIN === '*' || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Automatically allow any Vercel deployment domain (*.vercel.app) and local dev
    if (origin.endsWith('.vercel.app') || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Session configuration (with fallback for stateful environments)
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
}));

// Initialize database (SQLite for local/test, Supabase handled through migrations)
initializeDb();

// Auto-setup admin if SQLite and no admin exists
if (!isSupabaseConfigured()) {
  try {
    const db = getDb();
    if (db) {
      const adminCount = db.prepare('SELECT COUNT(*) as count FROM admin_users').get();
      const adminPass = process.env.ADMIN_PASSWORD || 'SpookyAdmin2026!';
      const adminUser = process.env.ADMIN_USERNAME || 'admin';
      if (adminCount && adminCount.count === 0) {
        const bcrypt = (() => {
          try { return require('bcryptjs'); } catch (e) { return require('bcrypt'); }
        })();
        const hash = bcrypt.hashSync(adminPass, 10);
        db.prepare('INSERT INTO admin_users (username, email, password_hash, role) VALUES (?, ?, ?, ?)')
          .run(
            adminUser,
            process.env.ADMIN_EMAIL || 'admin@spooktacular2026.com',
            hash,
            'admin'
          );
        console.log(`Initial admin account created (${adminUser}).`);
      }
    }
  } catch (e) {
    console.error('Auto admin setup error:', e.message);
  }
}

// API routes — Mount both /api/admin & /admin, and /api & / to guarantee compatibility with all Vercel/proxy rewrites
app.use('/api/admin', adminRoutes);
app.use('/admin', adminRoutes);
app.use('/api', registrationRoutes);
app.use('/', registrationRoutes);

 // Serve frontend only when explicitly enabled.
// Render hosts the API; Vercel hosts the frontend.
if (
  process.env.NODE_ENV === 'production' &&
  process.env.SERVE_FRONTEND === 'true' &&
  !process.env.VERCEL
) {
  const clientBuildPath = path.join(__dirname, '../../client/dist');
  const fs = require('fs');

  if (fs.existsSync(path.join(clientBuildPath, 'index.html'))) {
    app.use(express.static(clientBuildPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(clientBuildPath, 'index.html'));
    });
  } else {
    console.warn('Frontend build not found; running API-only mode.');
  }
}

// Session cleanup interval (only in standalone persistent servers, not in Vercel serverless or tests)
let cleanupInterval = null;
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  cleanupInterval = setInterval(() => {
    try {
      paymentService.expireStalePaymentSessions();
    } catch (e) {
      // Silently handle cleanup errors
    }
  }, 30000);
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

let server = null;
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  server = app.listen(PORT, () => {
    console.log(`🎃 Spooktacular Halloween Server running on port ${PORT}`);
    console.log(`📊 API available at http://localhost:${PORT}/api`);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  if (cleanupInterval) clearInterval(cleanupInterval);
  if (server) {
    server.close(() => {
      const { closeDb } = require('./db/database');
      closeDb();
      process.exit(0);
    });
  }
});



module.exports = app;
