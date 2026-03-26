const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockClient = {
  query:   jest.fn(),
  release: jest.fn(),
};

jest.mock('../db/index', () => ({
  pool: {
    connect: jest.fn(() => Promise.resolve(mockClient)),
    query:   jest.fn(),
  },
}));

jest.mock('../utils/s3', () => ({
  uploadFile: jest.fn(() => Promise.resolve({ url: 'http://mock-url', key: 'mock-key' })),
  generateUniqueKey: jest.fn((prefix, name) => `${prefix}/${name}`),
  generatePresignedUrl: jest.fn((key) => `http://mock-presigned/${key}`),
}));

jest.mock('../utils/redis', () => ({
  ping: jest.fn(() => Promise.resolve('PONG')),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
}));

jest.mock('../utils/mediaconvert', () => ({
  createTranscodeJob: jest.fn(() => Promise.resolve({ jobId: 'mock-job-id' })),
}));

jest.mock('../services/emailService', () => ({
  sendTaskEvaluationEmail: jest.fn(() => Promise.resolve()),
  sendLiveSessionReminderEmail: jest.fn(() => Promise.resolve()),
}));

// Mock middlewares
jest.mock('../middleware/authenticate', () => (req, res, next) => {
  if (req.get('x-user-role')) {
    req.user = { role: req.get('x-user-role'), user_id: 'user-123' };
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
});

jest.mock('../middleware/rbac', () => (...allowedRoles) => (req, res, next) => {
  if (req.user && allowedRoles.includes(req.user.role)) {
    return next();
  }
  return res.status(403).json({ error: 'Forbidden' });
});

// Route setup
const coursesRoutes = require('../routes/courses');
const taskRoutes = require('../routes/tasks');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  
  app.use('/api/courses', coursesRoutes);
  app.use('/api/tasks', taskRoutes);
  return app;
}

const app = createApp();

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
});

describe('EPIC-05: Course & Content Management', () => {

  describe('Course CRUD (HR / Admin)', () => {
    test('POST /api/courses — HR can create a course', async () => {
      mockClient.query.mockResolvedValueOnce({}); // SET role
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'course-123', title: 'New Course' }] });

      const res = await request(app)
        .post('/api/courses')
        .set('x-user-role', 'hr')
        .send({ title: 'New Course', description: 'Test', base_fee: 1000, duration_weeks: 4 });

      expect(res.status).toBe(201);
      expect(res.body.course.title).toBe('New Course');
    });

    test('POST /api/courses — Student cannot create a course', async () => {
      const res = await request(app)
        .post('/api/courses')
        .set('x-user-role', 'student')
        .send({ title: 'Illegal Course', base_fee: 500 });

      expect(res.status).toBe(403);
    });
  });

  describe('Module & Content Management', () => {
    test('POST /api/courses/:id/modules — Trainer can create a module', async () => {
      mockClient.query.mockResolvedValueOnce({}); // SET role
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'trainer-1' }] }); // isTrainerAssigned
      mockClient.query.mockResolvedValueOnce({ rows: [{ next_pos: 1 }] }); // MAX(position)
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'mod-1', title: 'Mod 1' }] }); // INSERT

      const res = await request(app)
        .post('/api/courses/course-123/modules')
        .set('x-user-role', 'trainer')
        .send({ title: 'Mod 1' });

      expect(res.status).toBe(201);
    });
  });

  describe('Task Lifecycle', () => {
    test('POST /api/tasks — Trainer can create a task', async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      mockClient.query.mockResolvedValueOnce({}); // SET role
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // _isTrainerAssigned
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Batch check
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'task-1', title: 'Task 1' }] });

      const res = await request(app)
        .post('/api/tasks')
        .set('x-user-role', 'trainer')
        .send({
          title: 'Task 1',
          course_id: 'course-123',
          batch_id: 'batch-456',
          due_date: futureDate,
          max_score: 100
        });

      expect(res.status).toBe(201);
    });

    test('POST /api/tasks/:id/submit — Student can submit a task', async () => {
      mockClient.query.mockResolvedValueOnce({}); // SET role
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'task-1', status: 'published', due_date: '2099-01-01' }] }); // Verify task
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // Check duplicate
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'sub-1' }] }); // Insert

      const res = await request(app)
        .post('/api/tasks/task-1/submit')
        .set('x-user-role', 'student')
        .send({ notes: 'My work' });

      expect(res.status).toBe(201);
      expect(res.body.submission.id).toBe('sub-1');
    });

    test('PATCH /api/tasks/:taskId/submissions/:submissionId/evaluate — Trainer can evaluate', async () => {
      mockClient.query.mockResolvedValueOnce({}); // SET role
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'sub-1', course_id: 'course-123' }] }); // Fetch sub
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'trainer-1' }] }); // assignment check
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'sub-1', grade: 'pass' }] }); // update

      const res = await request(app)
        .patch('/api/tasks/task-1/submissions/sub-1/evaluate')
        .set('x-user-role', 'trainer')
        .send({ grade: 'pass', score: 90, feedback: 'Good job' });

      expect(res.status).toBe(200);
      expect(res.body.submission.grade).toBe('pass');
    });
  });

  describe('Live Sessions', () => {
    test('POST /api/courses/batches/:batchId/live-sessions — Trainer can create session', async () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();
      mockClient.query.mockResolvedValueOnce({}); // SET role
      mockClient.query.mockResolvedValueOnce({ rows: [{ course_id: 'course-1' }] }); // assignment check
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'ls-1' }] }); // insert

      const res = await request(app)
        .post('/api/courses/batches/batch-1/live-sessions')
        .set('x-user-role', 'trainer')
        .send({
          title: 'Live Q&A',
          scheduled_at: futureDate,
          meeting_url: 'https://zoom.us/j/123'
        });

      expect(res.status).toBe(201);
    });
  });
});
