// ==========================================================================
// ACADENO LMS — EPIC-06 Video Progress Tracking Tests (US-STU-02, FR-STU-04)
// ==========================================================================
// Covers: saveVideoProgress (POST), getVideoProgress (GET)
// ==========================================================================

const request      = require('supertest');
const express      = require('express');
const cookieParser = require('cookie-parser');

// ---------------------------------------------------------------------------
// Mocks — all module mocks must be declared before any app require()
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

jest.mock('../utils/redis', () => ({
  ping: jest.fn(() => Promise.resolve('PONG')),
  get:  jest.fn(),
  set:  jest.fn(),
  del:  jest.fn(),
}));

jest.mock('../utils/s3', () => ({
  uploadFile:           jest.fn(),
  generateUniqueKey:    jest.fn(),
  generatePresignedUrl: jest.fn(),
}));

jest.mock('../utils/mediaconvert', () => ({
  createTranscodeJob: jest.fn(),
}));

// Certificate job mock — lets us assert it was/wasn't called
const mockCertJob = { generateCertificate: jest.fn(() => Promise.resolve()) };
jest.mock('../jobs/certificateJob', () => mockCertJob);

// authenticate: inject user from x-user-role header
jest.mock('../middleware/authenticate', () => (req, res, next) => {
  const strRole = req.get('x-user-role');
  if (!strRole) return res.status(401).json({ error: 'Unauthorized' });
  req.user = {
    role:    strRole,
    user_id: req.get('x-user-id') || 'user-student-1',
    email:   'student@test.com',
  };
  return next();
});

// checkEnrollment: always pass in unit tests
jest.mock('../middleware/checkEnrollment', () => (req, res, next) => next());

// ---------------------------------------------------------------------------
// Route setup
// ---------------------------------------------------------------------------
const studentRoutes = require('../routes/student');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/student', studentRoutes);
  return app;
}

const app = createApp();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
  mockCertJob.generateCertificate.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Shared query-mock sequences
// ---------------------------------------------------------------------------

// Builds the mock sequence for saveVideoProgress when enrollment IS found.
// @param {boolean} boolComplete   - whether to mock the "is_completed=TRUE" UPSERT
// @param {number}  intTotal       - total published items in course
// @param {number}  intDone        - completed items for the student
function _mockSaveProgressSequence(intTotal, intDone) {
  mockClient.query.mockResolvedValueOnce({});   // 1. SET role
  mockClient.query.mockResolvedValueOnce({});   // 2. UPSERT content_progress
  mockClient.query.mockResolvedValueOnce({});   // 3. UPSERT student_activity
  // 4. Resolve enrollment + course_id
  mockClient.query.mockResolvedValueOnce({
    rows: [{ enrollment_id: 'enroll-1', course_id: 'course-1' }],
  });
  // 5. Count total + completed items
  mockClient.query.mockResolvedValueOnce({
    rows: [{ total_items: String(intTotal), completed_items: String(intDone) }],
  });
}

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe('EPIC-06: Video Progress Tracking', () => {

  // =========================================================================
  describe('POST /api/student/content/:contentId/progress — saveVideoProgress', () => {

    test('Progress saved correctly — watch position persisted, not yet complete', async () => {
      // Student has watched 60% of a 300-second video → not completed
      _mockSaveProgressSequence(10, 5); // 5/10 = 50% course done

      const res = await request(app)
        .post('/api/student/content/ci-video-1/progress')
        .set('x-user-role', 'student')
        .send({ watch_position_seconds: 180, total_duration_seconds: 300 });

      expect(res.status).toBe(200);
      expect(res.body.is_completed).toBe(false);
      expect(res.body.watch_position_seconds).toBe(180);
      expect(res.body.completion_pct).toBe(50);

      // Verify the non-completion UPSERT was used (should NOT set is_completed=TRUE)
      const strProgressSQL = mockClient.query.mock.calls[1][0];
      expect(strProgressSQL).not.toContain('is_completed           = TRUE');
      expect(strProgressSQL).toContain('watch_position_seconds');

      // Certificate should NOT be triggered
      expect(mockCertJob.generateCertificate).not.toHaveBeenCalled();
    });

    test('90% threshold triggers is_completed = true and recalculates pct', async () => {
      // Student has watched 90% of a 300-second video → threshold reached
      _mockSaveProgressSequence(10, 9); // 9/10 = 90% course done

      const res = await request(app)
        .post('/api/student/content/ci-video-1/progress')
        .set('x-user-role', 'student')
        .send({ watch_position_seconds: 270, total_duration_seconds: 300 });

      expect(res.status).toBe(200);
      expect(res.body.is_completed).toBe(true);
      expect(res.body.watch_position_seconds).toBe(270);
      expect(res.body.completion_pct).toBe(90);

      // Verify the completion UPSERT was used
      const strProgressSQL = mockClient.query.mock.calls[1][0];
      expect(strProgressSQL).toContain('is_completed           = TRUE');
      expect(strProgressSQL).toContain('completed_at');

      // Verify student_activity UPSERT was called
      const strActivitySQL = mockClient.query.mock.calls[2][0];
      expect(strActivitySQL).toContain('student_activity');

      // 90% < 100% → certificate NOT triggered
      expect(mockCertJob.generateCertificate).not.toHaveBeenCalled();
    });

    test('100% completion_pct triggers certificate generation', async () => {
      // Last item in the course: after this UPSERT all 5/5 items are done
      _mockSaveProgressSequence(5, 5); // 5/5 = 100% course done

      const res = await request(app)
        .post('/api/student/content/ci-last-item/progress')
        .set('x-user-role', 'student')
        .send({ watch_position_seconds: 300, total_duration_seconds: 300 });

      expect(res.status).toBe(200);
      expect(res.body.is_completed).toBe(true);
      expect(res.body.completion_pct).toBe(100);

      // Certificate job MUST have been called with correct args
      expect(mockCertJob.generateCertificate).toHaveBeenCalledTimes(1);
      expect(mockCertJob.generateCertificate).toHaveBeenCalledWith({
        studentId:    'user-student-1',
        enrollmentId: 'enroll-1',
        courseId:     'course-1',
      });
    });

    test('Returns 400 when watch_position_seconds is missing', async () => {
      const res = await request(app)
        .post('/api/student/content/ci-1/progress')
        .set('x-user-role', 'student')
        .send({ total_duration_seconds: 300 }); // missing watch_position_seconds

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_PARAM');
    });

    test('Returns 400 when total_duration_seconds is zero or missing', async () => {
      const res = await request(app)
        .post('/api/student/content/ci-1/progress')
        .set('x-user-role', 'student')
        .send({ watch_position_seconds: 120, total_duration_seconds: 0 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_PARAM');
    });

  });

  // =========================================================================
  describe('GET /api/student/content/:contentId/progress — getVideoProgress', () => {

    test('Resume position returned correctly when progress record exists', async () => {
      mockClient.query.mockResolvedValueOnce({});  // SET role
      mockClient.query.mockResolvedValueOnce({
        rows: [{
          watch_position_seconds: 120,
          is_completed:           false,
          last_accessed_at:       '2026-03-25T10:00:00.000Z',
        }],
      });

      const res = await request(app)
        .get('/api/student/content/ci-video-1/progress')
        .set('x-user-role', 'student');

      expect(res.status).toBe(200);
      expect(res.body.watch_position_seconds).toBe(120);
      expect(res.body.is_completed).toBe(false);
      expect(res.body.last_accessed_at).toBe('2026-03-25T10:00:00.000Z');
    });

    test('Returns safe defaults when no progress record exists (first visit)', async () => {
      mockClient.query.mockResolvedValueOnce({});          // SET role
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // no record found

      const res = await request(app)
        .get('/api/student/content/ci-new-item/progress')
        .set('x-user-role', 'student');

      expect(res.status).toBe(200);
      expect(res.body.watch_position_seconds).toBe(0);
      expect(res.body.is_completed).toBe(false);
      expect(res.body.last_accessed_at).toBeNull();
    });

  });

});
