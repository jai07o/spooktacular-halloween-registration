const request = require('supertest');
// Import the Express app directly from the server module.
// In Vercel Services mode the server service is a first-class Express service;
// the old api/index.js serverless wrapper has been removed.
const app = require('../src/index');

describe('Express Server & Stateless Auth Tests', () => {
  let adminJwtToken = '';

  test('GET /api/pricing returns pricing data', async () => {
    const res = await request(app).get('/api/pricing');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('unitPrice');
    expect([249, 299]).toContain(res.body.unitPrice);
  });

  test('Admin login issues signed JWT token alongside cookie', async () => {
    const loginRes = await request(app)
      .post('/api/admin/login')
      .send({ username: 'admin', password: 'SpookyAdmin2026!' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body).toHaveProperty('token');
    expect(typeof loginRes.body.token).toBe('string');
    adminJwtToken = loginRes.body.token;

    // Verify admin_token cookie was set
    const cookies = loginRes.headers['set-cookie'];
    const adminTokenCookie = cookies.find(c => c.startsWith('admin_token='));
    expect(adminTokenCookie).toBeDefined();
    expect(adminTokenCookie).toContain('HttpOnly');
  });

  test('Admin can access protected routes using Authorization Bearer header (Stateless)', async () => {
    expect(adminJwtToken).toBeTruthy();

    const statsRes = await request(app)
      .get('/api/admin/statistics')
      .set('Authorization', `Bearer ${adminJwtToken}`);

    expect(statsRes.status).toBe(200);
    expect(statsRes.body).toHaveProperty('totalRegistrations');
    expect(statsRes.body).toHaveProperty('totalRevenue');
  });

  test('Admin can access protected routes using admin_token cookie', async () => {
    expect(adminJwtToken).toBeTruthy();

    const statsRes = await request(app)
      .get('/api/admin/statistics')
      .set('Cookie', `admin_token=${adminJwtToken}`);

    expect(statsRes.status).toBe(200);
    expect(statsRes.body).toHaveProperty('totalRegistrations');
  });

  test('Protected admin routes reject unauthorized requests without token or session', async () => {
    const unauthRes = await request(app).get('/api/admin/statistics');
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.body.error).toContain('Authentication required');
  });

  test('Protected admin routes reject invalid or forged JWT tokens', async () => {
    const forgedRes = await request(app)
      .get('/api/admin/statistics')
      .set('Authorization', 'Bearer forged.invalid.token');

    expect(forgedRes.status).toBe(401);
  });
});
