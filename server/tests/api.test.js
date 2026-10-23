const request = require('supertest');
const app = require('../src/index');
const { getDb, closeDb } = require('../src/db/database');

describe('Spooktacular Halloween Party API Tests', () => {
  let adminCookie = '';
  let registrationId = '';
  let accessToken = '';
  let sessionId = '';
  let ticketNumber = '';
  const testUtr = 'UTR' + Math.floor(1000000000 + Math.random() * 9000000000);

  beforeAll(() => {
    // Ensure database is initialized
    const db = getDb();
  });

  afterAll(() => {
    closeDb();
  });

  describe('1. Public Pricing Endpoint', () => {
    it('should return current pricing with early bird / regular status', async () => {
      const res = await request(app).get('/api/pricing');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('unitPrice');
      expect(res.body).toHaveProperty('category');
      expect([249, 299]).toContain(res.body.unitPrice);
    });
  });

  describe('2. Registration Workflow', () => {
    it('should reject invalid phone format', async () => {
      const res = await request(app)
        .post('/api/register')
        .send({
          fullName: 'Test User',
          phone: '12345',
          participantCount: 1,
          place: 'Vijayawada',
          state: 'Andhra Pradesh',
          district: 'NTR'
        });
      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('should successfully create a registration and payment session', async () => {
      const res = await request(app)
        .post('/api/register')
        .send({
          fullName: 'Subha Sharma',
          phone: '9989354789',
          participantCount: 2,
          place: 'Benz Circle',
          state: 'Andhra Pradesh',
          district: 'NTR'
        });

      expect(res.status).toBe(201);
      expect(res.body.registration).toBeDefined();
      expect(res.body.paymentSession).toBeDefined();

      registrationId = res.body.registration.id;
      accessToken = res.body.registration.access_token || res.body.registration.accessToken;
      sessionId = res.body.paymentSession.sessionId || res.body.paymentSession.id;

      expect(res.body.registration.participant_count || res.body.registration.participantCount).toBe(2);
      expect(res.body.registration.total_amount || res.body.registration.totalAmount).toBe(2 * (res.body.registration.unit_price || res.body.registration.unitPrice));
      expect(res.body.registration.status).toBe('PENDING_PAYMENT');
    });

    it('should retrieve registration details by access token', async () => {
      const res = await request(app).get(`/api/registration/${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.registration.id).toBe(registrationId);
      expect(res.body.paymentSession).toBeDefined();
      expect(res.body.paymentSession.isValid).toBe(true);
    });
  });

  describe('3. Payment Submission Workflow', () => {
    it('should submit a valid 12-digit UTR reference', async () => {
      const res = await request(app)
        .post('/api/payment/submit')
        .send({
          registrationId,
          sessionId,
          utrReference: testUtr
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toMatch(/UNDER_REVIEW/);
    });

    it('should reject duplicate UTR submission', async () => {
      // Create another registration
      const regRes = await request(app)
        .post('/api/register')
        .send({
          fullName: 'Second Person',
          phone: '9876543210',
          participantCount: 1,
          place: 'Vijayawada',
          state: 'Andhra Pradesh',
          district: 'NTR'
        });

      const secondRegId = regRes.body.registration.id;
      const secondSessionId = regRes.body.paymentSession.sessionId || regRes.body.paymentSession.id;

      // Try submitting same UTR
      const dupRes = await request(app)
        .post('/api/payment/submit')
        .send({
          registrationId: secondRegId,
          sessionId: secondSessionId,
          utrReference: testUtr
        });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error).toMatch(/already been submitted/i);
    });
  });

  describe('4. Admin Authentication & Operations', () => {
    it('should fail login with incorrect password', async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({
          username: 'admin',
          password: 'wrongpassword'
        });
      expect(res.status).toBe(401);
    });

    it('should successfully log in with valid admin credentials', async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({
          username: 'admin',
          password: 'SpookyAdmin2026!'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.admin.username).toBe('admin');

      // Save cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      adminCookie = cookies.find(c => c.startsWith('connect.sid=')).split(';')[0];
    });

    it('should get admin statistics with session cookie', async () => {
      const res = await request(app)
        .get('/api/admin/statistics')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.totalRegistrations).toBeGreaterThanOrEqual(1);
      expect(res.body.byStatus).toBeDefined();
    });

    it('should list registrations with search and filter', async () => {
      const res = await request(app)
        .get('/api/admin/registrations?status=UNDER_REVIEW')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.registrations).toBeInstanceOf(Array);
      expect(res.body.registrations.length).toBeGreaterThanOrEqual(1);
    });

    it('should approve payment and generate ticket', async () => {
      const res = await request(app)
        .post(`/api/admin/approve/${registrationId}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.ticketNumber).toBeDefined();
      expect(res.body.ticketNumber).toMatch(/^SPH-2026-/);

      ticketNumber = res.body.ticketNumber;
    });

    it('should export registrations to Excel format', async () => {
      const res = await request(app)
        .get('/api/admin/export')
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
    });

    it('should validate an approved active ticket', async () => {
      const res = await request(app).get(`/api/ticket/validate/${ticketNumber}`);
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.ticketNumber).toBe(ticketNumber);
      expect(['APPROVED', 'PAYMENT_VERIFIED']).toContain(res.body.status);
    });

    it('should reject unauthorized removal attempt without admin session', async () => {
      const res = await request(app)
        .post(`/api/admin/remove/${registrationId}`)
        .send({ reason: 'Unauthorized attempt' });

      expect(res.status).toBe(401);
    });

    it('should allow authenticated admin to remove/archive registration with audit logging', async () => {
      const res = await request(app)
        .post(`/api/admin/remove/${registrationId}`)
        .set('Cookie', adminCookie)
        .send({ reason: 'Duplicate test registration archive' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('CANCELLED');
    });
  });

  describe('5. Public Ticket Validation & Revocation Handling', () => {
    it('should reject a revoked/cancelled ticket during validation', async () => {
      const res = await request(app).get(`/api/ticket/validate/${ticketNumber}`);
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.message).toMatch(/cancelled or revoked/i);
    });

    it('should reject a non-existent ticket', async () => {
      const res = await request(app).get('/api/ticket/validate/SPOOK-FAKE-999');
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
    });
  });
});
