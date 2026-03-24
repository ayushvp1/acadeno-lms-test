// ==========================================================================
// ACADENO LMS — Trainer Assignment Tests (US-HR-02)
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

let mockClient;
const TOKEN = 'Bearer test-token';
const BATCH_ID = 'batch-uuid-0001';
const TRAINER_ID = 'trainer-uuid-0001';

const fakeBatch = {
  id: BATCH_ID, course_id: 'course-uuid-0001', batch_name: 'Alpha', course_name: 'Web Dev',
};
const fakeTrainer = { full_name: 'Jane Trainer', email: 'jane@acadeno.com' };

beforeEach(() => {
  mockClient = { query: jest.fn(), release: jest.fn() };
  pool.connect.mockResolvedValue(mockClient);
});

afterEach(() => jest.clearAllMocks());

describe('PATCH /api/batches/:id/trainer — Assign Trainer (US-HR-02)', () => {
  test('Assigns trainer successfully', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [fakeBatch] }) // fetch batch
      .mockResolvedValueOnce({ rows: [{ id: 'pool-entry' }] }) // pool check — found
      .mockResolvedValueOnce({ rows: [fakeTrainer] }) // fetch trainer
      .mockResolvedValueOnce({ rows: [{ ...fakeBatch, trainer_id: TRAINER_ID }] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .patch(`/api/batches/${BATCH_ID}/trainer`)
      .set('Authorization', TOKEN)
      .send({ trainer_id: TRAINER_ID });

    expect(res.status).toBe(200);
    expect(res.body.batch.trainer_id).toBe(TRAINER_ID);
  });

  test('Trainer not in pool returns 400', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [fakeBatch] }) // fetch batch
      .mockResolvedValueOnce({ rows: [] }); // pool check — NOT found

    const res = await request(app)
      .patch(`/api/batches/${BATCH_ID}/trainer`)
      .set('Authorization', TOKEN)
      .send({ trainer_id: TRAINER_ID });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not in the approved pool/);
  });

  test('Missing trainer_id returns 400', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .patch(`/api/batches/${BATCH_ID}/trainer`)
      .set('Authorization', TOKEN)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/trainer_id is required/);
  });

  test('Batch not found returns 404', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // fetch batch — not found

    const res = await request(app)
      .patch(`/api/batches/${BATCH_ID}/trainer`)
      .set('Authorization', TOKEN)
      .send({ trainer_id: TRAINER_ID });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/batches/:id/auto-assign — Auto Assign Trainer (US-HR-02)', () => {
  test('Auto-assigns trainer with lowest active batch count', async () => {
    const candidate = {
      trainer_id: TRAINER_ID,
      full_name: 'Jane Trainer',
      email: 'jane@acadeno.com',
      active_batch_count: '0',
    };
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [fakeBatch] }) // fetch batch
      .mockResolvedValueOnce({ rows: [candidate] }) // candidate query
      .mockResolvedValueOnce({ rows: [{ ...fakeBatch, trainer_id: TRAINER_ID }] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .post(`/api/batches/${BATCH_ID}/auto-assign`)
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.trainer.trainer_id).toBe(TRAINER_ID);
  });

  test('No trainers in pool returns 400', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [fakeBatch] }) // fetch batch
      .mockResolvedValueOnce({ rows: [] }); // no candidates

    const res = await request(app)
      .post(`/api/batches/${BATCH_ID}/auto-assign`)
      .set('Authorization', TOKEN);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No trainers available/);
  });
});
