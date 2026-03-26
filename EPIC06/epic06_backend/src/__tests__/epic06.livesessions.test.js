// ==========================================================================
// ACADENO LMS — EPIC-06 Live Session Tests (Prompt J, US-STU-08)
// ==========================================================================
// Covers: getLiveSessions (GET /api/student/courses/:courseId/live-sessions)
//
// Test cases (8 total):
//   1. Returns sessions list ordered ASC with all required fields
//   2. is_upcoming = true for session scheduled in the future
//   3. is_joinable = true when scheduled_at is within 15 minutes from now
//   4. is_joinable = false when session is more than 15 min in the future
//   5. is_joinable = false when session is already over (past duration window)
//   6. minutes_until_start is negative when session has already started
//   7. Returns 403 when student has no active enrollment for the course
//   8. Returns 401 when not authenticated
// ==========================================================================

const request      = require('supertest');
const express      = require('express');
const cookieParser = require('cookie-parser');

// ---------------------------------------------------------------------------
// Mocks — declared before any app require()
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
  get:  jest.fn(() => Promise.resolve(null)),
  set:  jest.fn(() => Promise.resolve('OK')),
  del:  jest.fn(() => Promise.resolve(1)),
}));

jest.mock('../utils/s3', () => ({
  uploadFile:           jest.fn(),
  generateUniqueKey:    jest.fn(),
  generatePresignedUrl: jest.fn(),
}));

jest.mock('../utils/mediaconvert', () => ({
  createTranscodeJob: jest.fn(),
}));

jest.mock('../jobs/certificateJob', () => ({
  generateCertificate:         jest.fn(() => Promise.resolve()),
  checkAndGenerateCertificate: jest.fn(() => Promise.resolve({ generated: false })),
}));

jest.mock('../utils/certificateGenerator', () => ({
  generateCertificate: jest.fn(() => Promise.resolve('/certificates/test.txt')),
}));

jest.mock('../services/emailService', () => ({
  sendDiscussionReplyEmail: jest.fn(() => Promise.resolve()),
  sendCertificateEmail:     jest.fn(() => Promise.resolve()),
}));

jest.mock('../utils/notificationHelper', () => ({
  createNotification: jest.fn(() => Promise.resolve({ id: 'notif-1' })),
  NOTIFICATION_TYPES: {
    DISCUSSION_REPLY:  'discussion_reply',
    TASK_EVALUATED:    'task_evaluated',
    CERTIFICATE_READY: 'certificate_ready',
  },
}));

// authenticate: inject user from x-user-role / x-user-id headers
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

// checkEnrollment: always pass in unit tests (inline enrollment check in controller)
jest.mock('../middleware/checkEnrollment', () => (req, res, next) => next());

// ---------------------------------------------------------------------------
// App setup
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
// Shared constants
// ---------------------------------------------------------------------------
const STR_COURSE_ID  = 'course-uuid-1';
const STR_BATCH_ID   = 'batch-uuid-1';
const STR_STUDENT_ID = 'user-student-1';

// Time helpers — all relative to test execution time
const INT_MS_PER_MIN    = 60 * 1000;
const INT_MS_PER_HOUR   = 60 * INT_MS_PER_MIN;

function dtFuture(intMinutes) {
  return new Date(Date.now() + intMinutes * INT_MS_PER_MIN).toISOString();
}

function dtPast(intMinutes) {
  return new Date(Date.now() - intMinutes * INT_MS_PER_MIN).toISOString();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
});

// ---------------------------------------------------------------------------
// Mock setup helpers
// ---------------------------------------------------------------------------
function _mockEnrollmentFound() {
  mockClient.query.mockResolvedValueOnce({});                                // SET role
  mockClient.query.mockResolvedValueOnce({ rows: [{ batch_id: STR_BATCH_ID }] }); // enrollment
}

function _mockEnrollmentNotFound() {
  mockClient.query.mockResolvedValueOnce({});           // SET role
  mockClient.query.mockResolvedValueOnce({ rows: [] }); // no enrollment
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GET /api/student/courses/:courseId/live-sessions — getLiveSessions', () => {

  // ── 1. Returns sessions list with all required fields, ordered ASC ────────
  test('Returns sessions list with all required fields ordered by scheduled_at ASC', async () => {
    const strSession1At = dtFuture(120); // 2 hours away
    const strSession2At = dtFuture(240); // 4 hours away

    _mockEnrollmentFound();
    mockClient.query.mockResolvedValueOnce({                                   // sessions SELECT
      rows: [
        {
          id:               'session-1',
          title:            'Introduction to React',
          scheduled_at:     strSession1At,
          duration_minutes: 60,
          meeting_url:      'https://zoom.us/j/111',
        },
        {
          id:               'session-2',
          title:            'Advanced Node.js',
          scheduled_at:     strSession2At,
          duration_minutes: 90,
          meeting_url:      'https://zoom.us/j/222',
        },
      ],
    });

    const res = await request(app)
      .get(`/api/student/courses/${STR_COURSE_ID}/live-sessions`)
      .set('x-user-role', 'student')
      .set('x-user-id', STR_STUDENT_ID);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
    expect(res.body.sessions).toHaveLength(2);

    // Verify required fields present on first session
    const objFirst = res.body.sessions[0];
    expect(objFirst.id).toBe('session-1');
    expect(objFirst.title).toBe('Introduction to React');
    expect(objFirst.scheduled_at).toBeDefined();
    expect(objFirst.duration_minutes).toBe(60);
    expect(objFirst.meeting_url).toBe('https://zoom.us/j/111');
    expect(typeof objFirst.is_upcoming).toBe('boolean');
    expect(typeof objFirst.is_joinable).toBe('boolean');
    expect(typeof objFirst.minutes_until_start).toBe('number');
  });

  // ── 2. is_upcoming = true for future session ──────────────────────────────
  test('is_upcoming = true when scheduled_at is in the future', async () => {
    _mockEnrollmentFound();
    mockClient.query.mockResolvedValueOnce({
      rows: [{
        id: 'session-future', title: 'Future Session',
        scheduled_at: dtFuture(60), duration_minutes: 60,
        meeting_url: 'https://zoom.us/j/1',
      }],
    });

    const res = await request(app)
      .get(`/api/student/courses/${STR_COURSE_ID}/live-sessions`)
      .set('x-user-role', 'student');

    expect(res.status).toBe(200);
    expect(res.body.sessions[0].is_upcoming).toBe(true);
    expect(res.body.sessions[0].minutes_until_start).toBeGreaterThan(0);
  });

  // ── 3. is_joinable = true within 15 minutes ──────────────────────────────
  test('is_joinable = true when scheduled_at is within 15 minutes from now', async () => {
    _mockEnrollmentFound();
    mockClient.query.mockResolvedValueOnce({
      rows: [{
        id: 'session-soon', title: 'Starting Soon',
        scheduled_at: dtFuture(10),  // 10 minutes away — within the 15-min window
        duration_minutes: 60,
        meeting_url: 'https://zoom.us/j/2',
      }],
    });

    const res = await request(app)
      .get(`/api/student/courses/${STR_COURSE_ID}/live-sessions`)
      .set('x-user-role', 'student');

    expect(res.status).toBe(200);
    const objSession = res.body.sessions[0];
    expect(objSession.is_joinable).toBe(true);
    // minutes_until_start should be ~10 (allow ±1 for test execution time)
    expect(objSession.minutes_until_start).toBeGreaterThanOrEqual(9);
    expect(objSession.minutes_until_start).toBeLessThanOrEqual(11);
  });

  // ── 4. is_joinable = false when more than 15 min away ────────────────────
  test('is_joinable = false when session is more than 15 minutes in the future', async () => {
    _mockEnrollmentFound();
    mockClient.query.mockResolvedValueOnce({
      rows: [{
        id: 'session-far', title: 'Far Away Session',
        scheduled_at: dtFuture(60),  // 60 minutes away — outside the 15-min window
        duration_minutes: 60,
        meeting_url: 'https://zoom.us/j/3',
      }],
    });

    const res = await request(app)
      .get(`/api/student/courses/${STR_COURSE_ID}/live-sessions`)
      .set('x-user-role', 'student');

    expect(res.status).toBe(200);
    expect(res.body.sessions[0].is_joinable).toBe(false);
    expect(res.body.sessions[0].is_upcoming).toBe(true);
  });

  // ── 5. is_joinable = false when session has ended (past duration window) ──
  test('is_joinable = false when session ended (started > duration_minutes ago)', async () => {
    _mockEnrollmentFound();
    mockClient.query.mockResolvedValueOnce({
      rows: [{
        id: 'session-done', title: 'Finished Session',
        scheduled_at: dtPast(90),   // started 90 min ago
        duration_minutes: 60,       // duration was 60 min → well over
        meeting_url: 'https://zoom.us/j/4',
      }],
    });

    const res = await request(app)
      .get(`/api/student/courses/${STR_COURSE_ID}/live-sessions`)
      .set('x-user-role', 'student');

    expect(res.status).toBe(200);
    const objSession = res.body.sessions[0];
    expect(objSession.is_joinable).toBe(false);
    expect(objSession.is_upcoming).toBe(false);
  });

  // ── 6. minutes_until_start is negative for already-started sessions ───────
  test('minutes_until_start is negative when session has already started', async () => {
    _mockEnrollmentFound();
    mockClient.query.mockResolvedValueOnce({
      rows: [{
        id: 'session-live', title: 'Live Right Now',
        scheduled_at: dtPast(5),   // started 5 minutes ago
        duration_minutes: 90,      // still within duration → joinable
        meeting_url: 'https://zoom.us/j/5',
      }],
    });

    const res = await request(app)
      .get(`/api/student/courses/${STR_COURSE_ID}/live-sessions`)
      .set('x-user-role', 'student');

    expect(res.status).toBe(200);
    const objSession = res.body.sessions[0];
    expect(objSession.is_upcoming).toBe(false);
    expect(objSession.minutes_until_start).toBeLessThan(0); // negative = started
    expect(objSession.is_joinable).toBe(true);              // still within duration
  });

  // ── 7. 403 when student has no active enrollment for course ──────────────
  test('Returns 403 when student has no active enrollment for this course', async () => {
    _mockEnrollmentNotFound();

    const res = await request(app)
      .get(`/api/student/courses/${STR_COURSE_ID}/live-sessions`)
      .set('x-user-role', 'student');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_ENROLLED');
    // Sessions SELECT must NOT have been called
    const arrSessionCalls = mockClient.query.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('live_sessions')
    );
    expect(arrSessionCalls).toHaveLength(0);
  });

  // ── 8. 401 when not authenticated ─────────────────────────────────────────
  test('Returns 401 when not authenticated', async () => {
    const res = await request(app)
      .get(`/api/student/courses/${STR_COURSE_ID}/live-sessions`);

    expect(res.status).toBe(401);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

});
