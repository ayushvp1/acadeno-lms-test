// ==========================================================================
// ACADENO LMS — Trainer Course Pool Tests (US-HR-04)
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

const coursesRoutes = require('../routes/courses');
const app = express();
app.use(express.json());
app.use('/api/courses', coursesRoutes);

let mockClient;
const TOKEN = 'Bearer test-token';
const COURSE_ID = 'course-uuid-0001';
const TRAINER_ID = 'trainer-uuid-0001';

beforeEach(() => {
  mockClient = { query: jest.fn(), release: jest.fn() };
  pool.connect.mockResolvedValue(mockClient);
});

afterEach(() => jest.clearAllMocks());

describe('POST /api/courses/:courseId/trainer-pool — Add Trainer (US-HR-04)', () => {
  test('Adds trainer to pool successfully', async () => {
    const entry = { id: 'pool-uuid-1', course_id: COURSE_ID, trainer_id: TRAINER_ID };
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [entry] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .post(`/api/courses/${COURSE_ID}/trainer-pool`)
      .set('Authorization', TOKEN)
      .send({ trainer_id: TRAINER_ID });

    expect(res.status).toBe(201);
    expect(res.body.pool_entry.trainer_id).toBe(TRAINER_ID);
  });

  test('Duplicate add returns 409', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockRejectedValueOnce({ code: '23505', message: 'unique_violation' });

    const res = await request(app)
      .post(`/api/courses/${COURSE_ID}/trainer-pool`)
      .set('Authorization', TOKEN)
      .send({ trainer_id: TRAINER_ID });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already in the pool/);
  });

  test('Missing trainer_id returns 400', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .post(`/api/courses/${COURSE_ID}/trainer-pool`)
      .set('Authorization', TOKEN)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/trainer_id is required/);
  });
});

describe('DELETE /api/courses/:courseId/trainer-pool/:trainerId — Remove Trainer (US-HR-04)', () => {
  test('Removes trainer from pool successfully', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // active batch check — none
      .mockResolvedValueOnce({ rows: [{ id: 'pool-uuid-1' }] }) // DELETE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .delete(`/api/courses/${COURSE_ID}/trainer-pool/${TRAINER_ID}`)
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/removed from pool/);
  });

  test('Blocked if trainer on active batch for this course', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'active-batch' }] }); // active batch check — found!

    const res = await request(app)
      .delete(`/api/courses/${COURSE_ID}/trainer-pool/${TRAINER_ID}`)
      .set('Authorization', TOKEN);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/assigned to an active batch/);
  });
});

describe('GET /api/courses/:courseId/trainer-pool — List Pool (US-HR-04)', () => {
  test('Returns trainer pool for a course', async () => {
    const trainers = [
      { trainer_id: TRAINER_ID, full_name: 'Alice', active_batch_count: '1' },
    ];
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: trainers });

    const res = await request(app)
      .get(`/api/courses/${COURSE_ID}/trainer-pool`)
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.trainers).toHaveLength(1);
  });
});
