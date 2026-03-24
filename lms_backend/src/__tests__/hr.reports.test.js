// ==========================================================================
// ACADENO LMS — HR Reports Tests (US-HR-05)
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

const fakeReportRows = [
  {
    registration_number: 'REG-001',
    student_name:        'Alice Student',
    email:               'alice@example.com',
    course_name:         'Web Dev',
    batch_name:          'Batch A',
    registration_status: 'active',
    payment_status:      'paid',
    registered_at:       '2025-01-15T00:00:00.000Z',
  },
];

beforeEach(() => {
  mockClient = { query: jest.fn(), release: jest.fn() };
  pool.connect.mockResolvedValue(mockClient);
});

afterEach(() => jest.clearAllMocks());

describe('GET /api/hr/reports/registrations — Registration Report (US-HR-05)', () => {
  test('Returns filtered report data', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: fakeReportRows });

    const res = await request(app)
      .get('/api/hr/reports/registrations?course_id=course-uuid-0001')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.report).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  test('Empty results return empty array', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/hr/reports/registrations')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.report).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });
});

describe('GET /api/hr/reports/registrations/export — CSV Export (US-HR-05)', () => {
  test('Returns CSV with correct Content-Disposition header', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: fakeReportRows });

    const res = await request(app)
      .get('/api/hr/reports/registrations/export')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
  });

  test('CSV contains column headers row', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: fakeReportRows });

    const res = await request(app)
      .get('/api/hr/reports/registrations/export')
      .set('Authorization', TOKEN);

    const csv = res.text;
    expect(csv).toContain('registration_number');
    expect(csv).toContain('student_name');
    expect(csv).toContain('payment_status');
  });

  test('Empty export returns only header row', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/hr/reports/registrations/export')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    const lines = res.text.trim().split('\n');
    expect(lines).toHaveLength(1); // only header
  });
});
