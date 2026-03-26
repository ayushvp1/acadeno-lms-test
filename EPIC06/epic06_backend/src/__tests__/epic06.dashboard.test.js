// ==========================================================================
// ACADENO LMS — EPIC-06 Student Portal Dashboard Tests (US-STU-04, FR-STU-01)
// ==========================================================================
// Covers: getStudentPortalDashboard (GET /api/student/dashboard)
//   - All five response fields returned on cache miss
//   - Redis cache hit returns cached payload without DB calls
//   - Streak calculation: consecutive days including today
//   - Streak calculation: grace period (no activity today, has yesterday)
//   - certificate_available = true when pct=100 AND cert exists
//   - certificate_available = false when pct=100 BUT cert not yet issued
//   - Returns 401 when not authenticated
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

// Store a reference so individual tests can configure get/set return values
const mockRedis = {
  ping: jest.fn(() => Promise.resolve('PONG')),
  get:  jest.fn(),
  set:  jest.fn(),
  del:  jest.fn(),
};
jest.mock('../utils/redis', () => mockRedis);

jest.mock('../utils/s3', () => ({
  uploadFile:           jest.fn(),
  generateUniqueKey:    jest.fn(),
  generatePresignedUrl: jest.fn(),
}));

jest.mock('../utils/mediaconvert', () => ({
  createTranscodeJob: jest.fn(),
}));

jest.mock('../jobs/certificateJob', () => ({
  generateCertificate: jest.fn(() => Promise.resolve()),
}));

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
  mockRedis.get.mockReset();
  mockRedis.set.mockReset();
  // Default: cache miss + successful cache write
  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue('OK');
});

// ---------------------------------------------------------------------------
// Shared mock sequence builder
// ---------------------------------------------------------------------------
// Sets up the 6 sequential mockClient.query calls for a full dashboard response:
//   Call 0: SET role
//   Call 1: enrolled_course aggregate query
//   Call 2: upcoming_tasks query
//   Call 3: activity dates query
//   Call 4: last_accessed_content query
//   Call 5: certificate_available EXISTS query

function _mockDashboardSequence({
  intTotal         = 10,
  intDone          = 8,
  arrTasks         = [{
    id:             'task-1',
    title:          'Assignment 1',
    due_date:       '2026-03-28T00:00:00.000Z',
    days_remaining: 3,
  }],
  arrActivityDates = [
    { activity_date: '2026-03-25' },
    { activity_date: '2026-03-24' },
    { activity_date: '2026-03-23' },
  ],
  objLastContent   = {
    id:              'ci-video-1',
    title:           'Intro to JavaScript',
    content_type:    'video',
    last_accessed_at: '2026-03-25T09:00:00.000Z',
  },
  boolCertExists   = false,
} = {}) {
  // 0. SET role
  mockClient.query.mockResolvedValueOnce({});

  // 1. enrolled_course
  mockClient.query.mockResolvedValueOnce({
    rows: [{
      course_id:           'course-1',
      title:               'Full Stack Web Dev',
      batch_name:          'Batch A',
      trainer_name:        'trainer@acadeno.com',
      total_content_items: String(intTotal),
      completed_items:     String(intDone),
    }],
  });

  // 2. upcoming_tasks
  mockClient.query.mockResolvedValueOnce({ rows: arrTasks });

  // 3. activity dates
  mockClient.query.mockResolvedValueOnce({ rows: arrActivityDates });

  // 4. last_accessed_content
  mockClient.query.mockResolvedValueOnce({
    rows: objLastContent ? [objLastContent] : [],
  });

  // 5. certificate_available
  mockClient.query.mockResolvedValueOnce({
    rows: [{ cert_exists: boolCertExists }],
  });
}

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe('EPIC-06: Student Portal Dashboard', () => {

  // =========================================================================
  describe('GET /api/student/dashboard — getStudentPortalDashboard', () => {

    test('Returns all five fields with correct values on cache miss', async () => {
      _mockDashboardSequence({ intTotal: 10, intDone: 8, boolCertExists: false });

      const res = await request(app)
        .get('/api/student/dashboard')
        .set('x-user-role', 'student');

      expect(res.status).toBe(200);

      // ---- enrolled_course ----
      expect(res.body.enrolled_course).toBeDefined();
      expect(res.body.enrolled_course.title).toBe('Full Stack Web Dev');
      expect(res.body.enrolled_course.batch_name).toBe('Batch A');
      expect(res.body.enrolled_course.trainer_name).toBe('trainer@acadeno.com');
      expect(res.body.enrolled_course.completion_pct).toBe(80);       // 8/10 * 100
      expect(res.body.enrolled_course.total_content_items).toBe(10);
      expect(res.body.enrolled_course.completed_items).toBe(8);

      // ---- upcoming_tasks ----
      expect(Array.isArray(res.body.upcoming_tasks)).toBe(true);
      expect(res.body.upcoming_tasks).toHaveLength(1);
      expect(res.body.upcoming_tasks[0].id).toBe('task-1');
      expect(res.body.upcoming_tasks[0].days_remaining).toBe(3);

      // ---- streak ----
      expect(res.body.streak).toBeDefined();
      expect(typeof res.body.streak.current_streak_days).toBe('number');
      expect(typeof res.body.streak.longest_streak_days).toBe('number');

      // ---- last_accessed_content ----
      expect(res.body.last_accessed_content).toBeDefined();
      expect(res.body.last_accessed_content.title).toBe('Intro to JavaScript');
      expect(res.body.last_accessed_content.content_type).toBe('video');

      // ---- certificate_available ----
      expect(res.body.certificate_available).toBe(false);

      // Redis SET should have cached the response with TTL=180
      expect(mockRedis.set).toHaveBeenCalledWith(
        'student_dashboard:user-student-1',
        expect.any(String),
        'EX',
        180
      );
    });

    test('Returns cached response on Redis cache hit (no DB queries fired)', async () => {
      const objCachedPayload = {
        enrolled_course:       { title: 'Cached Course', completion_pct: 50, batch_name: 'B2', trainer_name: 't@t.com', total_content_items: 20, completed_items: 10 },
        upcoming_tasks:        [],
        streak:                { current_streak_days: 5, longest_streak_days: 12 },
        last_accessed_content: null,
        certificate_available: false,
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(objCachedPayload));

      const res = await request(app)
        .get('/api/student/dashboard')
        .set('x-user-role', 'student');

      expect(res.status).toBe(200);
      expect(res.body.enrolled_course.title).toBe('Cached Course');
      expect(res.body.streak.current_streak_days).toBe(5);
      expect(res.body.streak.longest_streak_days).toBe(12);
      expect(res.body.last_accessed_content).toBeNull();

      // No DB queries: pool.connect should NOT have been called
      expect(mockClient.query).not.toHaveBeenCalled();
      // Redis SET should NOT have been called on a cache hit
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    test('Streak: 3 consecutive days including today → current=3, longest=3', async () => {
      // Build date strings relative to "right now" (UTC)
      const strToday     = new Date().toISOString().slice(0, 10);
      const strYesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const strDayBefore = new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10);

      _mockDashboardSequence({
        arrActivityDates: [
          { activity_date: strToday },
          { activity_date: strYesterday },
          { activity_date: strDayBefore },
        ],
      });

      const res = await request(app)
        .get('/api/student/dashboard')
        .set('x-user-role', 'student');

      expect(res.status).toBe(200);
      expect(res.body.streak.current_streak_days).toBe(3);
      expect(res.body.streak.longest_streak_days).toBe(3);
    });

    test('Streak: grace period — no activity today, 2 consecutive days ending yesterday → current=2', async () => {
      const strYesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const strDayBefore = new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10);

      _mockDashboardSequence({
        arrActivityDates: [
          { activity_date: strYesterday },
          { activity_date: strDayBefore },
        ],
      });

      const res = await request(app)
        .get('/api/student/dashboard')
        .set('x-user-role', 'student');

      expect(res.status).toBe(200);
      expect(res.body.streak.current_streak_days).toBe(2);  // grace period applied
      expect(res.body.streak.longest_streak_days).toBe(2);
    });

    test('certificate_available = true when completion_pct=100 AND cert record exists', async () => {
      _mockDashboardSequence({ intTotal: 5, intDone: 5, boolCertExists: true });

      const res = await request(app)
        .get('/api/student/dashboard')
        .set('x-user-role', 'student');

      expect(res.status).toBe(200);
      expect(res.body.enrolled_course.completion_pct).toBe(100);
      expect(res.body.certificate_available).toBe(true);
    });

    test('certificate_available = false when completion_pct=100 BUT cert not yet issued', async () => {
      _mockDashboardSequence({ intTotal: 5, intDone: 5, boolCertExists: false });

      const res = await request(app)
        .get('/api/student/dashboard')
        .set('x-user-role', 'student');

      expect(res.status).toBe(200);
      expect(res.body.enrolled_course.completion_pct).toBe(100);
      expect(res.body.certificate_available).toBe(false);
    });

    test('Returns 401 when request has no authentication header', async () => {
      const res = await request(app)
        .get('/api/student/dashboard');

      expect(res.status).toBe(401);
      expect(mockClient.query).not.toHaveBeenCalled();
    });

  });

});
