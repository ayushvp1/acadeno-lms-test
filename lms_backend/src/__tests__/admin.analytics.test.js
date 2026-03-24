// ==========================================================================
// ACADENO LMS — Admin Analytics Tests (US-HR-07)
// ==========================================================================

const request = require('supertest');
const express = require('express');
const { pool } = require('../db/index');

jest.mock('../db/index', () => ({
  pool: { connect: jest.fn() },
}));

jest.mock('../utils/jwt', () => ({
  verifyAccessToken: jest.fn(() => ({
    user_id: 'admin-user-uuid-0001',
    role:    'super_admin',
    email:   'admin@acadeno.com',
  })),
}));

const adminRoutes = require('../routes/admin');
const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

let mockClient;
const TOKEN = 'Bearer test-token';

beforeEach(() => {
  mockClient = { query: jest.fn(), release: jest.fn() };
  pool.connect.mockResolvedValue(mockClient);
  jest.clearAllMocks();
});

describe('GET /api/admin/analytics — Admin Analytics (US-HR-07)', () => {
  test('Returns all 5 analytics fields', async () => {
    // getAnalytics calls set_config once, then Promise.all with 5 queries in parallel.
    // Jest processes all mock.query calls sequentially in order of registration.
    let callIndex = 0;
    const mockResponses = [
      { rows: [] },                                                          // 0: set_config
      { rows: [{ total: 42 }] },                                            // 1: active students
      { rows: [{ revenue: '125000.00' }] },                                 // 2: monthly revenue
      { rows: [{ total: 7 }] },                                             // 3: active batches
      { rows: [{ course_name: 'Web Dev', enrollment_count: 30 }] },        // 4: enrollments by course
      { rows: [{ month: '2025-01', registrations: 12 }] },                 // 5: monthly trend
    ];

    mockClient.query.mockImplementation((_sql, _params) => {
      const response = mockResponses[callIndex] || { rows: [] };
      callIndex++;
      return Promise.resolve(response);
    });

    const res = await request(app)
      .get('/api/admin/analytics')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total_active_students', 42);
    expect(res.body).toHaveProperty('monthly_revenue', '125000.00');
    expect(res.body).toHaveProperty('active_batch_count', 7);
    expect(res.body).toHaveProperty('enrollments_by_course');
    expect(res.body).toHaveProperty('monthly_trend');
    expect(res.body.enrollments_by_course).toHaveLength(1);
    expect(res.body.monthly_trend).toHaveLength(1);
  });

  test('Returns 401 without auth token', async () => {
    const res = await request(app).get('/api/admin/analytics');
    expect(res.status).toBe(401);
  });
});
