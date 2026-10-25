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
    const rawQuery = (req.params.ticketNumber || '').trim();
    if (!rawQuery) {
      return res.status(400).json({ error: 'Ticket number or identifier is required' });
    }

    const queryTerm = rawQuery;
    const cleanDigits = queryTerm.replace(/\D/g, '');
    const phone10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : null;

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      let { data: ticketData } = await supabase
        .from('tickets')
        .select(`
          *,
          registrations (id, full_name, phone, place, participant_count, status, access_token)
        `)
        .eq('ticket_number', queryTerm)
        .maybeSingle();

      if (!ticketData) {
        // Look up by registration_id
        const { data: byReg } = await supabase
          .from('tickets')
          .select(`
            *,
            registrations (id, full_name, phone, place, participant_count, status, access_token)
          `)
          .eq('registration_id', queryTerm)
          .maybeSingle();
        ticketData = byReg;
      }

      if (!ticketData) {
        // Look up by phone number
        let phoneQuery = supabase
          .from('tickets')
          .select(`
            *,
            registrations!inner (id, full_name, phone, place, participant_count, status, access_token)
          `)
          .eq('is_valid', true);

        if (phone10) {
          phoneQuery = phoneQuery.or(`phone.eq.${queryTerm},phone.eq.${cleanDigits},phone.ilike.%${phone10}%`, { foreignTable: 'registrations' });
        } else {
          phoneQuery = phoneQuery.eq('registrations.phone', queryTerm);
        }

        const { data: byPhone } = await phoneQuery
          .order('issued_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        ticketData = byPhone;
      }

      if (ticketData) {
        const regObj = Array.isArray(ticketData.registrations)
          ? ticketData.registrations[0]
          : (ticketData.registrations || {});

        ticket = {
          ...ticketData,
          registration_id: ticketData.registration_id || regObj?.id,
          full_name: regObj?.full_name,
          phone: regObj?.phone,
          place: regObj?.place,
          participant_count: regObj?.participant_count,
          reg_status: regObj?.status,
          access_token: regObj?.access_token
        };
      }
    } else {
      const db = getDb();
      ticket = db.prepare(`
        SELECT t.*, r.id as registration_id, r.full_name, r.phone, r.place, r.participant_count, r.status as reg_status, r.access_token
        FROM tickets t
        JOIN registrations r ON r.id = t.registration_id
        WHERE t.ticket_number = ? OR t.registration_id = ? OR r.phone = ? OR (r.phone LIKE ?)
        ORDER BY t.issued_at DESC
        LIMIT 1
      `).get(queryTerm, queryTerm, queryTerm, phone10 ? `%${phone10}%` : `%${queryTerm}%`);
    }

    if (!ticket) {
      // Check if registration exists but ticket hasn't been issued yet (e.g. pending admin approval)
      let regData = null;
      if (isSupabaseConfigured()) {
        const supabase = getSupabase();
        let regQuery = supabase
          .from('registrations')
          .select('id, full_name, phone, place, participant_count, status, access_token');

        if (phone10) {
          regQuery = regQuery.or(`id.eq.${queryTerm},phone.eq.${queryTerm},phone.eq.${cleanDigits},phone.ilike.%${phone10}%`);
        } else {
          regQuery = regQuery.or(`id.eq.${queryTerm},phone.eq.${queryTerm}`);
        }

        const { data: reg } = await regQuery
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        regData = reg;
      } else {
        const db = getDb();
        regData = db.prepare(`
          SELECT id, full_name, phone, place, participant_count, status, access_token
          FROM registrations
          WHERE id = ? OR phone = ? OR phone LIKE ?
          ORDER BY created_at DESC
          LIMIT 1
        `).get(queryTerm, queryTerm, phone10 ? `%${phone10}%` : `%${queryTerm}%`);
      }

      if (regData) {
        if (regData.status === 'PAYMENT_UNDER_REVIEW' || regData.status === 'UNDER_REVIEW') {
          return res.json({
            valid: false,
            pendingApproval: true,
            status: 'PAYMENT_UNDER_REVIEW',
            message: 'Payment received — Pending admin verification. Once verified by admin, your official ticket will become active.',
            registrationId: regData.id,
            name: regData.full_name,
            phone: regData.phone,
            place: regData.place,
            participants: regData.participant_count,
            accessToken: regData.access_token
          });
        }

        if (regData.status === 'PAYMENT_VERIFIED' || regData.status === 'APPROVED') {
          let ticketNum = null;
          if (isSupabaseConfigured()) {
            const { data: t } = await getSupabase()
              .from('tickets')
              .select('ticket_number')
              .eq('registration_id', regData.id)
              .maybeSingle();
            if (t) ticketNum = t.ticket_number;
          }
          return res.json({
            valid: true,
            status: regData.status || 'PAYMENT_VERIFIED',
            ticketNumber: ticketNum || `REG-${regData.id.replace('SPH-', '')}`,
            registrationId: regData.id,
            name: regData.full_name,
            phone: regData.phone,
            place: regData.place,
            participants: regData.participant_count,
            accessToken: regData.access_token
          });
        }

        if (regData.status === 'CANCELLED') {
          return res.json({
            valid: false,
            status: 'CANCELLED',
            message: 'This registration has been cancelled or revoked by administration.',
            registrationId: regData.id,
            name: regData.full_name
          });
        }

        if (regData.status === 'PENDING_PAYMENT') {
          return res.json({
            valid: false,
            status: 'PENDING_PAYMENT',
            message: 'Registration created, but payment reference has not been submitted yet.',
            registrationId: regData.id,
            name: regData.full_name,
            accessToken: regData.access_token
          });
        }
      }

      return res.json({ valid: false, message: 'Ticket not found' });
    }

    const isUnderReview = ticket.reg_status === 'PAYMENT_UNDER_REVIEW' || ticket.reg_status === 'UNDER_REVIEW';
    const isApproved = ticket.reg_status === 'PAYMENT_VERIFIED' || ticket.reg_status === 'APPROVED' || ticket.is_valid === true || ticket.is_valid === 1;
    const isCancelled = ticket.reg_status === 'CANCELLED' || (!isUnderReview && !isApproved && (ticket.is_valid === 0 || ticket.is_valid === false));

    if (isCancelled) {
      return res.json({
        valid: false,
        message: 'This ticket has been cancelled or revoked by administration.',
        ticketNumber: ticket.ticket_number,
        registrationId: ticket.registration_id,
        status: 'CANCELLED'
      });
    }

    if (isUnderReview) {
      return res.json({
        valid: false,
        pendingApproval: true,
        message: 'Payment submitted and pending admin approval. Once approved, your ticket will be verified.',
        ticketNumber: ticket.ticket_number,
        registrationId: ticket.registration_id,
        name: ticket.full_name,
        phone: ticket.phone,
        place: ticket.place,
        participants: ticket.participant_count,
        status: 'PAYMENT_UNDER_REVIEW',
        accessToken: ticket.access_token
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
      status: ticket.reg_status || 'PAYMENT_VERIFIED',
      accessToken: ticket.access_token,
      issuedAt: ticket.issued_at
    });
  } catch (error) {
    res.status(500).json({ error: 'Validation failed' });
  }
});

module.exports = router;
