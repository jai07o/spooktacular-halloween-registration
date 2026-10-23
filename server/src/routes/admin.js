/**
 * Admin API routes.
 * Supports persistent Supabase PostgreSQL and local SQLite.
 * Uses stateless JWT tokens (cookie / Authorization header) with session fallback.
 */

const express = require('express');
const bcrypt = (() => {
  try { return require('bcryptjs'); } catch (e) { return require('bcrypt'); }
})();
const jwt = require('jsonwebtoken');
const { body, query, validationResult } = require('express-validator');
const { getDb } = require('../db/database');
const { getSupabase, isSupabaseConfigured } = require('../db/supabase');
const { requireAuth, requireAdmin, JWT_SECRET } = require('../middleware/auth');
const registrationService = require('../services/registration');
const paymentService = require('../services/payment');
const excelService = require('../services/excel');
const deduplicationService = require('../services/deduplication');
const { now } = require('../utils/time');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiting for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * POST /api/admin/login - Admin login
 */
router.post('/login', loginLimiter, [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { username, password } = req.body;
    let admin = null;

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('username', username)
        .eq('is_active', true)
        .maybeSingle();

      admin = data;

      // If no admin user exists in Supabase and credentials match configured or fallback admin password
      const expectedAdminUser = process.env.ADMIN_USERNAME || 'admin';
      const expectedAdminPass = process.env.ADMIN_PASSWORD || 'SpookyAdmin2026!';
      if (!admin && username === expectedAdminUser && password === expectedAdminPass) {
        const hash = bcrypt.hashSync(expectedAdminPass, 12);
        const { data: newAdmin } = await supabase
          .from('admin_users')
          .insert({
            username: expectedAdminUser,
            email: process.env.ADMIN_EMAIL || 'admin@spooktacular2026.com',
            password_hash: hash,
            role: 'admin',
            is_active: true
          })
          .select()
          .single();
        admin = newAdmin;
      }
    } else {
      const db = getDb();
      admin = db.prepare('SELECT * FROM admin_users WHERE username = ? AND is_active = 1').get(username);
      const expectedAdminUser = process.env.ADMIN_USERNAME || 'admin';
      const expectedAdminPass = process.env.ADMIN_PASSWORD || 'SpookyAdmin2026!';
      if (!admin && username === expectedAdminUser && password === expectedAdminPass) {
        const hash = bcrypt.hashSync(expectedAdminPass, 10);
        db.prepare('INSERT INTO admin_users (username, email, password_hash, role) VALUES (?, ?, ?, ?)')
          .run(expectedAdminUser, process.env.ADMIN_EMAIL || 'admin@spooktacular2026.com', hash, 'admin');
        admin = db.prepare('SELECT * FROM admin_users WHERE username = ? AND is_active = 1').get(expectedAdminUser);
      }
    }

    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = bcrypt.compareSync(password, admin.password_hash);
    if (!validPassword) {
      if (isSupabaseConfigured()) {
        const supabase = getSupabase();
        await supabase.from('admin_audit_log').insert({
          admin_username: admin.username,
          action: 'LOGIN_FAILED',
          details: 'Invalid password',
          ip_address: req.ip,
          created_at: now().toISOString()
        });
      } else {
        const db = getDb();
        db.prepare(`
          INSERT INTO admin_audit_log (admin_id, admin_username, action, details, ip_address, created_at)
          VALUES (?, ?, 'LOGIN_FAILED', 'Invalid password', ?, ?)
        `).run(admin.id, admin.username, req.ip, now().toISOString());
      }

      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Set Express session (for local tests / stateful clients)
    if (req.session) {
      req.session.adminId = admin.id;
      req.session.username = admin.username;
      req.session.role = admin.role;
    }

    // Generate signed JWT token (for stateless Vercel Serverless Lambdas)
    const token = jwt.sign(
      {
        id: admin.id,
        username: admin.username,
        role: admin.role
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Set HTTP-only secure cookie
    res.cookie('admin_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    // Record login audit log
    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      await supabase.from('admin_audit_log').insert({
        admin_username: admin.username,
        action: 'LOGIN_SUCCESS',
        details: 'Successful login',
        ip_address: req.ip,
        created_at: now().toISOString()
      });
    } else {
      const db = getDb();
      db.prepare(`
        INSERT INTO admin_audit_log (admin_id, admin_username, action, details, ip_address, created_at)
        VALUES (?, ?, 'LOGIN_SUCCESS', 'Successful login', ?, ?)
      `).run(admin.id, admin.username, req.ip, now().toISOString());
    }

    res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/admin/logout - Admin logout
 */
router.post('/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.clearCookie('connect.sid');
  if (req.session) {
    req.session.destroy(() => {});
  }
  res.json({ success: true });
});

/**
 * GET /api/admin/me - Check admin session
 */
router.get('/me', requireAuth, (req, res) => {
  res.json({
    admin: {
      id: req.session.adminId,
      username: req.session.username,
      role: req.session.role
    }
  });
});

/**
 * GET /api/admin/statistics - Dashboard statistics
 */
router.get('/statistics', requireAdmin, async (req, res) => {
  try {
    const stats = await registrationService.getStatistics();
    res.json(stats);
  } catch (error) {
    console.error('Statistics error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

/**
 * GET /api/admin/registrations - List registrations with pagination
 */
router.get('/registrations', requireAdmin, async (req, res) => {
  try {
    const { page, limit, search, status, dateFrom, dateTo, sortBy, sortOrder } = req.query;
    const result = await registrationService.getRegistrations({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      search,
      status,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder
    });
    res.json(result);
  } catch (error) {
    console.error('List registrations error:', error);
    res.status(500).json({ error: 'Failed to get registrations' });
  }
});

/**
 * GET /api/admin/registration/:id - Get single registration details
 */
router.get('/registration/:id', requireAdmin, async (req, res) => {
  try {
    const registration = await registrationService.getRegistrationById(req.params.id);
    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      const [subsRes, sessRes, auditRes] = await Promise.all([
        supabase.from('payment_submissions').select('*').eq('registration_id', req.params.id).order('submitted_at', { ascending: false }),
        supabase.from('payment_sessions').select('*').eq('registration_id', req.params.id).order('created_at', { ascending: false }),
        supabase.from('admin_audit_log').select('*').eq('target_id', req.params.id).order('created_at', { ascending: false })
      ]);

      return res.json({
        registration,
        paymentSubmissions: subsRes.data || [],
        paymentSessions: sessRes.data || [],
        auditLog: auditRes.data || []
      });
    }

    const db = getDb();
    const submissions = db.prepare(`
      SELECT ps.*, au.username as reviewer_username
      FROM payment_submissions ps
      LEFT JOIN admin_users au ON au.id = ps.reviewed_by
      WHERE ps.registration_id = ?
      ORDER BY ps.submitted_at DESC
    `).all(req.params.id);

    const sessions = db.prepare(`
      SELECT * FROM payment_sessions WHERE registration_id = ? ORDER BY created_at DESC
    `).all(req.params.id);

    const auditLog = db.prepare(`
      SELECT * FROM admin_audit_log WHERE target_id = ? ORDER BY created_at DESC
    `).all(req.params.id);

    res.json({
      registration,
      paymentSubmissions: submissions,
      paymentSessions: sessions,
      auditLog
    });
  } catch (error) {
    console.error('Get registration error:', error);
    res.status(500).json({ error: 'Failed to get registration' });
  }
});

/**
 * POST /api/admin/approve/:id - Approve a payment
 */
router.post('/approve/:id', requireAdmin, async (req, res) => {
  try {
    const result = await paymentService.approvePayment(
      req.params.id,
      req.session.adminId,
      req.session.username
    );
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Approve error:', error);
    res.status(400).json({ error: error.message || 'Failed to approve payment' });
  }
});

/**
 * POST /api/admin/reject/:id - Reject a payment
 */
router.post('/reject/:id', requireAdmin, [
  body('reason').trim().notEmpty().withMessage('Rejection reason is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const result = await paymentService.rejectPayment(
      req.params.id,
      req.session.adminId,
      req.session.username,
      req.body.reason
    );
    res.json(result);
  } catch (error) {
    console.error('Reject error:', error);
    res.status(400).json({ error: error.message || 'Failed to reject payment' });
  }
});

/**
 * GET /api/admin/export - Export to Excel
 */
router.get('/export', requireAdmin, async (req, res) => {
  try {
    const { search, status, dateFrom, dateTo } = req.query;
    const buffer = await excelService.generateExport({ search, status, dateFrom, dateTo });

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      await supabase.from('admin_audit_log').insert({
        admin_username: req.session.username || 'admin',
        action: 'EXCEL_EXPORT',
        details: JSON.stringify({ filters: { search, status, dateFrom, dateTo } }),
        ip_address: req.ip,
        created_at: now().toISOString()
      });
    } else {
      const db = getDb();
      db.prepare(`
        INSERT INTO admin_audit_log (admin_id, admin_username, action, details, ip_address, created_at)
        VALUES (?, ?, 'EXCEL_EXPORT', ?, ?, ?)
      `).run(req.session.adminId, req.session.username, 
        JSON.stringify({ filters: { search, status, dateFrom, dateTo } }),
        req.ip, now().toISOString());
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=spooktacular_registrations_${new Date().toISOString().split('T')[0]}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

/**
 * POST /api/admin/remove/:id - Remove / Cancel / Archive a registration
 */
router.post('/remove/:id', requireAdmin, [
  body('reason').trim().notEmpty().withMessage('Reason for removal is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const result = await registrationService.removeRegistration(
      req.params.id,
      req.session.adminId,
      req.session.username,
      req.body.reason
    );
    res.json(result);
  } catch (error) {
    console.error('Removal error:', error);
    res.status(400).json({ error: error.message || 'Failed to remove registration' });
  }
});

/**
 * POST /api/admin/restore/:id - Restore an archived registration
 */
router.post('/restore/:id', requireAdmin, async (req, res) => {
  try {
    const result = await registrationService.restoreRegistration(
      req.params.id,
      req.session.adminId,
      req.session.username
    );
    res.json(result);
  } catch (error) {
    console.error('Restore error:', error);
    res.status(400).json({ error: error.message || 'Failed to restore registration' });
  }
});

/**
 * GET /api/admin/duplicates/scan - Scan for duplicate registrations and payments
 */
router.get('/duplicates/scan', requireAdmin, async (req, res) => {
  try {
    const result = await deduplicationService.scanDuplicates();
    res.json(result);
  } catch (error) {
    console.error('Duplicate scan error:', error);
    res.status(500).json({ error: 'Failed to scan for duplicates' });
  }
});

/**
 * POST /api/admin/duplicates/flag/:id - Flag a registration for review
 */
router.post('/duplicates/flag/:id', requireAdmin, [
  body('reason').trim().notEmpty().withMessage('Reason is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const result = await deduplicationService.flagForReview(
      req.params.id,
      req.body.reason,
      req.session.adminId,
      req.session.username
    );
    res.json(result);
  } catch (error) {
    console.error('Flag error:', error);
    res.status(400).json({ error: error.message || 'Failed to flag registration' });
  }
});

/**
 * POST /api/admin/duplicates/resolve - Resolve a duplicate pair
 */
router.post('/duplicates/resolve', requireAdmin, [
  body('primaryId').trim().notEmpty().withMessage('Primary registration ID is required'),
  body('duplicateId').trim().notEmpty().withMessage('Duplicate registration ID is required'),
  body('reason').trim().notEmpty().withMessage('Reason is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const result = await deduplicationService.resolveDuplicate({
      primaryId: req.body.primaryId,
      duplicateId: req.body.duplicateId,
      adminId: req.session.adminId,
      adminUsername: req.session.username,
      reason: req.body.reason
    });
    res.json(result);
  } catch (error) {
    console.error('Resolve duplicate error:', error);
    res.status(400).json({ error: error.message || 'Failed to resolve duplicate' });
  }
});

/**
 * GET /api/admin/audit-log - View audit logs
 */
router.get('/audit-log', requireAdmin, async (req, res) => {
  try {
    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('admin_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return res.json(data || []);
    }

    const db = getDb();
    const logs = db.prepare('SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT 100').all();
    res.json(logs);
  } catch (error) {
    console.error('Audit log error:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

module.exports = router;
