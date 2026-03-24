// ==========================================================================
// ACADENO LMS — Batch Creation Tests (US-HR-01)
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

jest.mock('../services/emailService', () => ({
  sendEnrollmentSuccessEmail: jest.fn().mockResolvedValue(true),
}));

const batchRoutes = require('../routes/batches');
const app = express();
app.use(express.json());
app.use('/api/batches', batchRoutes);

const FUTURE_DATE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .split('T')[0];

const PAST_DATE = '2020-01-01';

const validPayload = {
  course_id:    'course-uuid-0001',
  batch_name:   'Test Batch Alpha',
  batch_code:   'TB-001',
  start_date:   FUTURE_DATE,
  capacity:     30,
  schedule_type: 'weekday',
};

let mockClient;

beforeEach(() => {
  mockClient = {
    query:   jest.fn(),
    release: jest.fn(),
  };
  pool.connect.mockResolvedValue(mockClient);
});

afterEach(() => {
  jest.clearAllMocks();
});

const TOKEN = 'Bearer test-token';

describe('POST /api/batches — Batch Creation (US-HR-01)', () => {
  test('Happy path: creates batch successfully', async () => {
    const newBatch = { id: 'batch-uuid-0001', ...validPayload, status: 'upcoming' };
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // dup batch_code check
      .mockResolvedValueOnce({ rows: [newBatch] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .post('/api/batches')
      .set('Authorization', TOKEN)
      .send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.batch).toBeDefined();
    expect(res.body.batch.status).toBe('upcoming');
  });

  test('Missing required fields returns 400', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .post('/api/batches')
      .set('Authorization', TOKEN)
      .send({ batch_name: 'Incomplete' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContain('course_id is required');
    expect(res.body.details).toContain('start_date is required');
  });

  test('Start date in past returns 400 (BR-C04)', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .post('/api/batches')
      .set('Authorization', TOKEN)
      .send({ ...validPayload, start_date: PAST_DATE });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/start_date cannot be in the past/);
  });

  test('Duplicate batch_code returns 409', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'existing-batch' }] }); // dup check — found!

    const res = await request(app)
      .post('/api/batches')
      .set('Authorization', TOKEN)
      .send(validPayload);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Batch code already exists/);
  });

  test('Missing Authorization returns 401', async () => {
    const res = await request(app)
      .post('/api/batches')
      .send(validPayload);

    expect(res.status).toBe(401);
  });
});

describe('GET /api/batches — List Batches (US-HR-01)', () => {
  test('Returns list of batches', async () => {
    const batches = [
      { id: 'batch-1', batch_name: 'Alpha', status: 'upcoming', course_name: 'Web Dev', enrolled_count: 5 },
    ];
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: batches });

    const res = await request(app)
      .get('/api/batches')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.batches).toHaveLength(1);
  });
});

describe('GET /api/batches/:id — Get Batch (US-HR-01)', () => {
  test('Returns batch detail', async () => {
    const batch = { id: 'batch-1', batch_name: 'Alpha', enrolled_count: 3 };
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [batch] });

    const res = await request(app)
      .get('/api/batches/batch-1')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.batch.id).toBe('batch-1');
  });

  test('Non-existent batch returns 404', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/batches/no-such-batch')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(404);
  });
});
