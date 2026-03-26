// ==========================================================================
// ACADENO LMS — EPIC-06 Student Portal Tests
// ==========================================================================
// Covers: getCourseContent (US-STU-01), getContentItem (US-STU-02)
// ==========================================================================

const request      = require('supertest');
const express      = require('express');
const cookieParser = require('cookie-parser');

// ---------------------------------------------------------------------------
// Mocks — must be declared before any require() of app modules
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
  uploadFile:           jest.fn(() => Promise.resolve({ url: 'http://mock-url', key: 'mock-key' })),
  generateUniqueKey:    jest.fn((prefix, name) => `${prefix}/${name}`),
  generatePresignedUrl: jest.fn((key) => `http://mock-presigned/${key}`),
}));

jest.mock('../utils/mediaconvert', () => ({
  createTranscodeJob: jest.fn(() => Promise.resolve({ jobId: 'mock-job-id' })),
}));

// authenticate: injects req.user from x-user-role / x-user-id headers
jest.mock('../middleware/authenticate', () => (req, res, next) => {
  const strRole = req.get('x-user-role');
  if (!strRole) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = {
    role:    strRole,
    user_id: req.get('x-user-id') || 'user-student-1',
    email:   'student@test.com',
  };
  return next();
});

// checkEnrollment: always passes in unit tests (behaviour tested via controller)
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
});

// Shared fixture rows
const objMockContentRow = {
  module_id:              'mod-1',
  module_title:           'Module 1',
  module_position:        0,
  sub_module_id:          'sm-1',
  sub_module_title:       'Sub 1',
  sm_position:            0,
  content_item_id:        'ci-1',
  ci_title:               'Intro Video',
  content_type:           'video',
  external_url:           null,
  hls_url:                'https://cdn.example.com/video.m3u8',
  duration_seconds:       300,
  is_downloadable:        false,
  ci_position:            0,
  is_completed:           false,
  watch_position_seconds: 0,
  last_accessed_at:       null,
};

const objMockPdfRow = {
  ...objMockContentRow,
  content_item_id: 'ci-pdf-1',
  ci_title:        'Lecture Notes',
  content_type:    'pdf',
  hls_url:         null,
  is_downloadable: true,
};

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe('EPIC-06: Student Portal — Course Content Access', () => {

  // =========================================================================
  describe('GET /api/student/courses/:courseId/content — getCourseContent', () => {

    test('Enrolled student receives full module tree with completion_pct', async () => {
      // 1. SET role
      mockClient.query.mockResolvedValueOnce({});
      // 2. Enrollment check → active enrollment found
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'enroll-1', batch_id: 'batch-1' }] });
      // 3. Course fetch
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'course-1', name: 'Node.js Mastery', description: 'Learn Node', duration_weeks: 8 }],
      });
      // 4. Tree query → one content item (not completed)
      mockClient.query.mockResolvedValueOnce({ rows: [objMockContentRow] });

      const res = await request(app)
        .get('/api/student/courses/course-1/content')
        .set('x-user-role', 'student');

      expect(res.status).toBe(200);
      expect(res.body.course.name).toBe('Node.js Mastery');
      expect(res.body.modules).toHaveLength(1);
      expect(res.body.modules[0].sub_modules).toHaveLength(1);
      expect(res.body.modules[0].sub_modules[0].content_items).toHaveLength(1);
      expect(res.body.completion_pct).toBe(0);
    });

    test('Unenrolled student receives 403 NOT_ENROLLED', async () => {
      // 1. SET role
      mockClient.query.mockResolvedValueOnce({});
      // 2. Enrollment check → empty (not enrolled)
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/student/courses/course-99/content')
        .set('x-user-role', 'student');

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NOT_ENROLLED');
      expect(res.body.error).toBe('Enroll to access this course');
    });

    test('Completion_pct is 100 when all items are completed', async () => {
      mockClient.query.mockResolvedValueOnce({}); // SET role
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'enroll-1' }] }); // enrollment
      mockClient.query.mockResolvedValueOnce({    // course
        rows: [{ id: 'course-1', name: 'Node.js Mastery', description: null, duration_weeks: 4 }],
      });
      // Tree → two completed items in same module/sub-module
      mockClient.query.mockResolvedValueOnce({
        rows: [
          { ...objMockContentRow, is_completed: true },
          { ...objMockContentRow, content_item_id: 'ci-2', ci_title: 'Deep Dive', is_completed: true },
        ],
      });

      const res = await request(app)
        .get('/api/student/courses/course-1/content')
        .set('x-user-role', 'student');

      expect(res.status).toBe(200);
      expect(res.body.completion_pct).toBe(100);
    });

    test('Trainer bypasses enrollment gate and receives 200', async () => {
      mockClient.query.mockResolvedValueOnce({}); // SET role
      // No enrollment check for trainer — skip straight to course fetch
      mockClient.query.mockResolvedValueOnce({
        rows: [{ id: 'course-1', name: 'Node.js Mastery', description: null, duration_weeks: 4 }],
      });
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // tree → empty (no content yet)

      const res = await request(app)
        .get('/api/student/courses/course-1/content')
        .set('x-user-role', 'trainer');

      expect(res.status).toBe(200);
      expect(res.body.modules).toHaveLength(0);
      expect(res.body.completion_pct).toBe(0);
    });

  });

  // =========================================================================
  describe('GET /api/student/content/:contentId — getContentItem', () => {

    test('PDF content item is auto-marked complete and activity recorded', async () => {
      mockClient.query.mockResolvedValueOnce({});  // SET role
      // Content item fetch → pdf type
      mockClient.query.mockResolvedValueOnce({
        rows: [{ ...objMockPdfRow, id: 'ci-pdf-1', course_id: 'course-1' }],
      });
      // Enrollment check for student
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'enroll-1' }] });
      // UPSERT content_progress (auto-complete)
      mockClient.query.mockResolvedValueOnce({});
      // UPSERT student_activity
      mockClient.query.mockResolvedValueOnce({});

      const res = await request(app)
        .get('/api/student/content/ci-pdf-1')
        .set('x-user-role', 'student');

      expect(res.status).toBe(200);
      expect(res.body.content_item.content_type).toBe('pdf');

      // Verify the auto-complete UPSERT was called (4th query call: index 3)
      const arrCalls = mockClient.query.mock.calls;
      const strAutoCompleteSQL = arrCalls[3][0];
      expect(strAutoCompleteSQL).toContain('content_progress');
      expect(strAutoCompleteSQL).toContain('is_completed');

      // Verify the activity UPSERT was called (5th query call: index 4)
      const strActivitySQL = arrCalls[4][0];
      expect(strActivitySQL).toContain('student_activity');
    });

    test('Video content item updates last_accessed_at (NOT auto-completed)', async () => {
      mockClient.query.mockResolvedValueOnce({});  // SET role
      // Content item fetch → video type
      mockClient.query.mockResolvedValueOnce({
        rows: [{ ...objMockContentRow, id: 'ci-1', course_id: 'course-1' }],
      });
      // Enrollment check
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'enroll-1' }] });
      // UPSERT last_accessed_at only (not is_completed = true)
      mockClient.query.mockResolvedValueOnce({});
      // UPSERT student_activity
      mockClient.query.mockResolvedValueOnce({});

      const res = await request(app)
        .get('/api/student/content/ci-1')
        .set('x-user-role', 'student');

      expect(res.status).toBe(200);

      const arrCalls  = mockClient.query.mock.calls;
      const strProgressSQL = arrCalls[3][0];
      // For video: should NOT set is_completed = TRUE in the UPSERT
      expect(strProgressSQL).not.toContain('is_completed     = TRUE');
      expect(strProgressSQL).toContain('last_accessed_at');
    });

    test('Returns 403 NOT_ENROLLED when student not enrolled', async () => {
      mockClient.query.mockResolvedValueOnce({});  // SET role
      // Content item fetch
      mockClient.query.mockResolvedValueOnce({
        rows: [{ ...objMockContentRow, id: 'ci-1', course_id: 'course-1' }],
      });
      // Enrollment check → empty
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get('/api/student/content/ci-1')
        .set('x-user-role', 'student');

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('NOT_ENROLLED');
    });

    test('Returns 404 when content item does not exist or is not published', async () => {
      mockClient.query.mockResolvedValueOnce({});    // SET role
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // content not found

      const res = await request(app)
        .get('/api/student/content/nonexistent')
        .set('x-user-role', 'student');

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

  });

});
