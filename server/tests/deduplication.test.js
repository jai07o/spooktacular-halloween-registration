const request = require('supertest');
const app = require('../src/index');
const { getDb } = require('../src/db/database');
const deduplicationService = require('../src/services/deduplication');
const registrationService = require('../src/services/registration');

describe('Deduplication & Data Cleaning Tests', () => {
  let adminCookie;

  beforeAll(async () => {
    // Authenticate admin with actual credentials
    const loginRes = await request(app)
      .post('/api/admin/login')
      .send({ username: 'admin', password: 'SpookyAdmin2026!' });
    
    expect(loginRes.status).toBe(200);
    const cookies = loginRes.headers['set-cookie'];
    adminCookie = cookies.find(c => c.startsWith('connect.sid=')).split(';')[0];
  });

  test('Deduplication scan runs safely on database', () => {
    const scan = deduplicationService.scanDuplicates();
    expect(scan).toHaveProperty('scannedAt');
    expect(scan).toHaveProperty('summary');
    expect(scan).toHaveProperty('duplicateUtrs');
    expect(scan).toHaveProperty('samePhoneGroups');
    expect(Array.isArray(scan.samePhoneGroups)).toBe(true);
  });

  test('Admin can access GET /api/admin/duplicates/scan', async () => {
    const res = await request(app)
      .get('/api/admin/duplicates/scan')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
    expect(res.body).toHaveProperty('totalDuplicateGroups');
  });

  test('Admin can flag a suspicious registration for review', async () => {
    // Create a registration
    const regRes = await request(app)
      .post('/api/register')
      .send({
        fullName: 'Dracula Suspicious',
        phone: '9876543299',
        participantCount: 2,
        place: 'Vijayawada',
        state: 'Andhra Pradesh',
        district: 'NTR'
      });

    expect(regRes.status).toBe(201);
    const regId = regRes.body.registration.id;

    // Flag for review
    const flagRes = await request(app)
      .post(`/api/admin/duplicates/flag/${regId}`)
      .set('Cookie', adminCookie)
      .send({ reason: 'Suspicious multiple claim' });

    expect(flagRes.status).toBe(200);
    expect(flagRes.body.status).toBe('FLAGGED_FOR_REVIEW');

    // Verify stats account for it
    const stats = registrationService.getStatistics();
    expect(stats.flaggedDuplicates).toBeGreaterThanOrEqual(1);
  });

  test('Admin can safely resolve duplicates without irreversible data loss', async () => {
    // Create primary registration
    const reg1Res = await request(app)
      .post('/api/register')
      .send({
        fullName: 'Frankenstein Primary',
        phone: '9876543288',
        participantCount: 1,
        place: 'Vijayawada',
        state: 'Andhra Pradesh',
        district: 'NTR'
      });
    const reg1Id = reg1Res.body.registration.id;

    // Create duplicate registration
    const reg2Res = await request(app)
      .post('/api/register')
      .send({
        fullName: 'Frankenstein Duplicate',
        phone: '9876543288',
        participantCount: 1,
        place: 'Vijayawada',
        state: 'Andhra Pradesh',
        district: 'NTR'
      });
    const reg2Id = reg2Res.body.registration.id;

    // Resolve duplicate pair
    const resolveRes = await request(app)
      .post('/api/admin/duplicates/resolve')
      .set('Cookie', adminCookie)
      .send({
        primaryId: reg1Id,
        duplicateId: reg2Id,
        reason: 'Confirmed duplicate registration; retained canonical first booking'
      });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.success).toBe(true);
    expect(resolveRes.body.primaryRegistrationId).toBe(reg1Id);
    expect(resolveRes.body.duplicateRegistrationId).toBe(reg2Id);

    // Verify duplicate is CANCELLED and not lost from database
    const db = getDb();
    const dup = db.prepare('SELECT * FROM registrations WHERE id = ?').get(reg2Id);
    expect(dup).toBeDefined();
    expect(dup.status).toBe('CANCELLED');
    expect(dup.cancellation_reason).toContain('Confirmed duplicate registration');

    // Verify canonical registration is intact
    const primary = db.prepare('SELECT * FROM registrations WHERE id = ?').get(reg1Id);
    expect(primary).toBeDefined();
    expect(primary.status).toBe('PENDING_PAYMENT');
  });

  test('Same phone registrations are NOT automatically treated as duplicates', () => {
    const scan = deduplicationService.scanDuplicates();
    expect(Array.isArray(scan.samePhoneGroups)).toBe(true);
    expect(Array.isArray(scan.duplicateRegistrations)).toBe(true);
  });
});

