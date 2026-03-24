// ==========================================================================
// ACADENO LMS — HR Enrollment Tests (US-HR-03)
// ==========================================================================

const request = require('supertest');
const express = require('express');
const { pool } = require('../db/index');

jest.mock('../db/index', () => ({
  pool: { connect: jest.fn() },
}));

jest.mock('../utils/jwt', () => ({
  verifyAccessToken: jest.fn(() => ({
    user_id: 'hr-user-uuid-0001',
    role:    'hr',
    email:   'hr@acadeno.com',
  })),
}));

const hrRoutes = require('../routes/hr');
const app = express();
app.use(express.json());
app.use('/api/hr', hrRoutes);

let mockClient;
const TOKEN = 'Bearer test-token';

const fakeEnrollments = [
  {
    enrollment_id:      'enr-uuid-0001',
    registration_number: 'REG-001',
    student_name:       'Alice Student',
    email:              'alice@example.com',
    course_name:        'Web Development',
    batch_name:         'Batch Alpha',
    enrollment_status:  'active',
    payment_status:     'paid',
    completion_pct:     42.5,
  },
];

beforeEach(() => {
  mockClient = { query: jest.fn(), release: jest.fn() };
  pool.connect.mockResolvedValue(mockClient);
});

afterEach(() => jest.clearAllMocks());

describe('GET /api/hr/enrollments — List Enrollments (US-HR-03)', () => {
  test('Returns enrollments list', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: fakeEnrollments });

    const res = await request(app)
      .get('/api/hr/enrollments')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.enrollments).toHaveLength(1);
    expect(res.body.enrollments[0].completion_pct).toBe(42.5);
  });

  test('Filter by payment_status works', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: fakeEnrollments });

    const res = await request(app)
      .get('/api/hr/enrollments?payment_status=paid')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    // The query was called with the payment_status filter
    const queryCall = mockClient.query.mock.calls[1];
    expect(queryCall[0]).toContain('payment_status');
  });

  test('Returns 401 without Authorization header', async () => {
    const res = await request(app).get('/api/hr/enrollments');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/hr/enrollments/:studentId — Enrollment Detail (US-HR-03)', () => {
  test('Returns student enrollment detail', async () => {
    const studentDetail = {
      id: 'student-uuid-0001',
      registration_number: 'REG-001',
      full_name: 'Alice Student',
      enrollments: [{ course_name: 'Web Development', status: 'active' }],
    };
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [studentDetail] });

    const res = await request(app)
      .get('/api/hr/enrollments/student-uuid-0001')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.student.full_name).toBe('Alice Student');
  });

  test('Non-existent student returns 404', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/hr/enrollments/no-such-student')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(404);
  });
});
