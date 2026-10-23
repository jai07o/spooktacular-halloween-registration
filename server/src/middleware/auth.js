/**
 * Authentication middleware for admin routes.
 * Supports both express-session and stateless signed JWT tokens (cookies or Bearer header).
 * Designed for serverless environments (Vercel) and standard stateful Express instances.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || process.env.ADMIN_JWT_SECRET || process.env.SESSION_SECRET || 'spooktacular-secret-jwt-key-2026';

function extractToken(req) {
  if (req.cookies && req.cookies.admin_token) {
    return req.cookies.admin_token;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

function verifyAndPopulateAuth(req) {
  // 1. Check existing session if available
  if (req.session && req.session.adminId) {
    return {
      adminId: req.session.adminId,
      username: req.session.username,
      role: req.session.role || 'admin'
    };
  }

  // 2. Check JWT from cookie or Authorization header
  const token = extractToken(req);
  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Populate session compatibility object for downstream handlers
    req.session = req.session || {};
    req.session.adminId = decoded.id;
    req.session.username = decoded.username;
    req.session.role = decoded.role || 'admin';
    req.admin = decoded;
    return decoded;
  } catch (err) {
    return null;
  }
}

function requireAuth(req, res, next) {
  const auth = verifyAndPopulateAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requireAdmin(req, res, next) {
  const auth = verifyAndPopulateAuth(req);
  if (!auth) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const role = auth.role || (req.session && req.session.role);
  if (role !== 'admin' && role !== 'superadmin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  JWT_SECRET
};
