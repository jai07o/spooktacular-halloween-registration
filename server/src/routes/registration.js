/**
 * Registration API routes.
 * Supports both persistent Supabase PostgreSQL and local SQLite.
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const registrationService = require('../services/registration');
const paymentService = require('../services/payment');
const { getCurrentPricing, isRegistrationClosed } = require('../utils/time');
const { validatePhone } = require('../utils/validation');
const { getSupabase, isSupabaseConfigured } = require('../db/supabase');
const { getDb } = require('../db/database');

const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limiter for registration creation (prevents DDoS and bot attacks while supporting 10,000+ real attendees)
const registerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please wait a minute before submitting again.' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * GET /api/pricing - Get current pricing info (edge cached for high concurrency)
 */
router.get('/pricing', (req, res) => {
  try {
    const pricing = getCurrentPricing();
    const closed = isRegistrationClosed();
    // Vercel Edge Cache: serve 10,000+ concurrent requests with zero latency
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    res.json({ ...pricing, registrationClosed: closed });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get pricing' });
  }
});

/**
 * POST /api/register - Create a new registration
 */
router.post('/register', registerLimiter, [
  body('fullName').trim().notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('phone').trim().notEmpty().withMessage('Phone number is required')
    .custom(value => {
      if (!validatePhone(value)) throw new Error('Invalid phone number format');
      return true;
    }),
  body('participantCount').isInt({ min: 1, max: 100 }).withMessage('Participant count must be between 1 and 100'),
  body('place').trim().notEmpty().withMessage('Place is required')
    .isLength({ min: 2, max: 100 }).withMessage('Place must be 2-100 characters'),
  body('state').trim().notEmpty().withMessage('State is required')
    .isLength({ min: 2, max: 100 }).withMessage('State must be 2-100 characters'),
  body('district').trim().notEmpty().withMessage('District is required')
    .isLength({ min: 2, max: 100 }).withMessage('District must be 2-100 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { fullName, phone, participantCount, place, state, district } = req.body;
    
    const registration = await registrationService.createRegistration({
      fullName, phone, 
      participantCount: parseInt(participantCount),
      place, state, district
    });

    // Create payment session
    const session = await paymentService.createPaymentSession(registration.id);

    res.status(201).json({
      registration,
      paymentSession: session
    });
  } catch (error) {
    if (error.message.includes('Registration is closed') || error.message.includes('closed')) {
      return res.status(403).json({ error: error.message });
    }
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message || 'Failed to create registration' });
  }
});

/**
 * GET /api/registration/:token - Get registration status by access token
 */
router.get('/registration/:token', async (req, res) => {
  try {
    const registration = await registrationService.getRegistrationByToken(req.params.token);
    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    // Lazy cleanup for stale session if necessary
    try {
      await paymentService.expireStalePaymentSessions();
    } catch (e) {}

    // Get active payment session if exists
    const session = await paymentService.getActiveSession(registration.id);
    const sessionValid = session ? paymentService.isSessionValid(session) : false;

    // Don't expose sensitive fields
    const { access_token, ...safeRegistration } = registration;

    res.json({
      registration: safeRegistration,
      paymentSession: session ? {
        sessionId: session.id,
        expiresAt: session.expires_at,
        status: session.status,
        isValid: sessionValid
      } : null
    });
  } catch (error) {
    console.error('Get registration error:', error);
    res.status(500).json({ error: 'Failed to get registration' });
  }
});

/**
 * POST /api/registration/:token/new-session - Create new payment session
 */
router.post('/registration/:token/new-session', async (req, res) => {
  try {
    const registration = await registrationService.getRegistrationByToken(req.params.token);
    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    if (registration.status !== 'PENDING_PAYMENT' && registration.status !== 'EXPIRED') {
      return res.status(400).json({ error: 'Cannot create new payment session for this registration' });
    }

    const session = await paymentService.createPaymentSession(registration.id);
    res.json({ paymentSession: session });
  } catch (error) {
    console.error('New session error:', error);
    res.status(500).json({ error: error.message || 'Failed to create payment session' });
  }
});

/**
 * POST /api/payment/submit - Submit payment reference
 */
router.post('/payment/submit', [
  body('registrationId').trim().notEmpty().withMessage('Registration ID is required'),
  body('sessionId').trim().notEmpty().withMessage('Session ID is required'),
  body('utrReference').trim().notEmpty().withMessage('Transaction reference is required')
    .isLength({ min: 6, max: 30 }).withMessage('Transaction reference must be 6-30 characters')
    .matches(/^[a-zA-Z0-9]+$/).withMessage('Transaction reference must be alphanumeric')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { registrationId, sessionId, utrReference } = req.body;
    const result = await paymentService.submitPaymentReference(registrationId, sessionId, utrReference);
    res.json(result);
  } catch (error) {
    console.error('Payment submit error:', error);
    if (error.message.includes('already been submitted') || error.message.includes('duplicate')) {
      return res.status(409).json({ error: error.message });
    }
    if (error.message.includes('expired')) {
      return res.status(410).json({ error: error.message });
    }
    res.status(400).json({ error: error.message || 'Failed to submit payment' });
  }
});

/**
 * GET /api/ticket/validate/:ticketNumber - Validate a ticket
 */
router.get('/ticket/validate/:ticketNumber', async (req, res) => {
  try {
    let ticket = null;

    const queryTerm = (req.params.ticketNumber || '').trim();

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      let { data: ticketData } = await supabase
        .from('tickets')
        .select(`
          *,
          registrations (id, full_name, phone, place, participant_count, status)
        `)
        .eq('ticket_number', queryTerm)
        .maybeSingle();

      if (!ticketData) {
        // Look up by registration_id
        const { data: byReg } = await supabase
          .from('tickets')
          .select(`
            *,
            registrations (id, full_name, phone, place, participant_count, status)
          `)
          .eq('registration_id', queryTerm)
          .maybeSingle();
        ticketData = byReg;
      }

      if (!ticketData) {
        // Look up by phone number
        const { data: byPhone } = await supabase
          .from('tickets')
          .select(`
            *,
            registrations!inner (id, full_name, phone, place, participant_count, status)
          `)
          .eq('registrations.phone', queryTerm)
          .eq('is_valid', true)
          .order('issued_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        ticketData = byPhone;
      }

      if (ticketData) {
        ticket = {
          ...ticketData,
          registration_id: ticketData.registration_id || ticketData.registrations?.id,
          full_name: ticketData.registrations?.full_name,
          phone: ticketData.registrations?.phone,
          place: ticketData.registrations?.place,
          participant_count: ticketData.registrations?.participant_count,
          reg_status: ticketData.registrations?.status
        };
      }
    } else {
      const db = getDb();
      ticket = db.prepare(`
        SELECT t.*, r.id as registration_id, r.full_name, r.phone, r.place, r.participant_count, r.status as reg_status
        FROM tickets t
        JOIN registrations r ON r.id = t.registration_id
        WHERE t.ticket_number = ? OR t.registration_id = ? OR r.phone = ?
        ORDER BY t.issued_at DESC
        LIMIT 1
      `).get(queryTerm, queryTerm, queryTerm);
    }

    if (!ticket) {
      return res.json({ valid: false, message: 'Ticket not found' });
    }

    if (ticket.is_valid === 0 || ticket.is_valid === false || ticket.reg_status === 'CANCELLED') {
      return res.json({
        valid: false,
        message: 'This ticket has been cancelled or revoked by administration.',
        ticketNumber: ticket.ticket_number,
        registrationId: ticket.registration_id,
        status: 'CANCELLED'
      });
    }

    if (ticket.reg_status !== 'PAYMENT_VERIFIED' && ticket.reg_status !== 'APPROVED') {
      return res.json({
        valid: false,
        message: 'Ticket payment has not been confirmed.',
        ticketNumber: ticket.ticket_number,
        registrationId: ticket.registration_id,
        status: ticket.reg_status
      });
    }

    res.json({
      valid: true,
      ticketNumber: ticket.ticket_number,
      registrationId: ticket.registration_id,
      name: ticket.full_name,
      phone: ticket.phone,
      place: ticket.place,
      participants: ticket.participant_count,
      status: ticket.reg_status,
      issuedAt: ticket.issued_at
    });
  } catch (error) {
    res.status(500).json({ error: 'Validation failed' });
  }
});

module.exports = router;
