// ==========================================================================
// ACADENO LMS — EPIC-06 Student Progress Dashboard Tests (US-STU-06)
// ==========================================================================
// Covers: getStudentProgress — GET /api/student/progress
//
// Test cases:
//   1. Returns all four required fields on cache miss
//   2. weekly_activity always contains exactly 364 entries (52 weeks)
//   3. Missing activity dates are filled with count: 0
//   4. 'Pending evaluation' shown for tasks without a score
//   5. module_completion calculates completion_pct correctly
//   6. task_list derives correct display statuses
//   7. Redis cache hit returns cached payload (no DB queries)
//   8. Returns 401 when unauthenticated
// ==========================================================================

const request      = require('supertest');
const express      = require('express');
const cookieParser = require('cookie-parser');

// ---------------------------------------------------------------------------
// Mocks — must be declared before any app require()
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
const STR_USER_ID  = 'user-student-1';
const INT_DAYS     = 364;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
  mockRedis.get.mockReset();
  mockRedis.set.mockReset();
  mockRedis.get.mockResolvedValue(null); // default: cache miss
  mockRedis.set.mockResolvedValue('OK');
});

// Build a compact mock sequence for the 3 DB queries (after SET role)
function _mockProgressSequence({
  arrModules       = [],
  arrActivityRows  = [],
  arrTasks         = [],
} = {}) {
  mockClient.query.mockResolvedValueOnce({});                          // SET role
  mockClient.query.mockResolvedValueOnce({ rows: arrModules });        // module_completion
  mockClient.query.mockResolvedValueOnce({ rows: arrActivityRows });   // weekly_activity
  mockClient.query.mockResolvedValueOnce({ rows: arrTasks });          // task data
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('GET /api/student/progress — getStudentProgress', () => {

  // ── 1. All four fields returned ─────────────────────────────────────────
  test('Returns all four required fields on cache miss', async () => {
    _mockProgressSequence({
      arrModules: [{
        module_id:       'm-1',
        module_title:    'Module 1',
        total_items:     '5',
        completed_items: '3',
      }],
      arrActivityRows: [
        { date: new Date().toISOString().slice(0, 10), count: 2 },
      ],
      arrTasks: [{
        id:                  't-1',
        task_title:          'Assignment 1',
        due_date:            new Date(Date.now() + 7 * 86400000).toISOString(),
        max_score:           100,
        submission_id:       null,
        submission_status:   null,
        score:               null,
        is_late:             false,
        submitted_at:        null,
        feedback:            null,
      }],
    });

    const res = await request(app)
      .get('/api/student/progress')
      .set('x-user-role', 'student')
      .set('x-user-id', STR_USER_ID);

    expect(res.status).toBe(200);

    // All four top-level fields must exist
    expect(Array.isArray(res.body.module_completion)).toBe(true);
    expect(Array.isArray(res.body.weekly_activity)).toBe(true);
    expect(Array.isArray(res.body.task_scores)).toBe(true);
    expect(Array.isArray(res.body.task_list)).toBe(true);

    // Redis SET should cache the result with TTL = 300
    expect(mockRedis.set).toHaveBeenCalledWith(
      `student_progress:${STR_USER_ID}`,
      expect.any(String),
      'EX',
      300
    );
  });

  // ── 2. Exactly 364 entries in weekly_activity ────────────────────────────
  test('weekly_activity always contains exactly 364 entries (52 weeks)', async () => {
    // Only supply 3 activity rows — the rest must be zero-padded
    const strToday = new Date().toISOString().slice(0, 10);
    _mockProgressSequence({
      arrActivityRows: [
        { date: strToday, count: 5 },
        { date: new Date(Date.now() - 86400000).toISOString().slice(0, 10), count: 3 },
        { date: new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10), count: 1 },
      ],
    });

    const res = await request(app)
      .get('/api/student/progress')
      .set('x-user-role', 'student');

    expect(res.status).toBe(200);
    expect(res.body.weekly_activity).toHaveLength(INT_DAYS);
  });

  // ── 3. Missing dates filled with count: 0 ───────────────────────────────
  test('Dates absent from student_activity are padded with count: 0', async () => {
    const strToday = new Date().toISOString().slice(0, 10);
    _mockProgressSequence({
      arrActivityRows: [{ date: strToday, count: 7 }],
    });

    const res = await request(app)
      .get('/api/student/progress')
      .set('x-user-role', 'student');

    expect(res.status).toBe(200);

    const arrActivity = res.body.weekly_activity;
    expect(arrActivity).toHaveLength(INT_DAYS);

    // Last entry is today — should have count 7
    const objToday = arrActivity[arrActivity.length - 1];
    expect(objToday.date).toBe(strToday);
    expect(objToday.count).toBe(7);

    // All other entries must have count: 0
    const arrNonZero = arrActivity.slice(0, -1).filter(e => e.count !== 0);
    expect(arrNonZero).toHaveLength(0);
  });

  // ── 4. 'Pending evaluation' for tasks without a score ───────────────────
  test("task_scores shows 'Pending evaluation' for ungraded tasks", async () => {
    _mockProgressSequence({
      arrTasks: [
        // submitted but not yet graded
        {
          id:                't-1',
          task_title:        'Quiz 1',
          due_date:          new Date(Date.now() - 86400000).toISOString(),
          max_score:         50,
          submission_id:     'sub-1',
          submission_status: 'submitted',
          score:             null,           // ← no grade yet
          is_late:           false,
          submitted_at:      new Date().toISOString(),
          feedback:          null,
        },
        // evaluated with a real score
        {
          id:                't-2',
          task_title:        'Quiz 2',
          due_date:          new Date(Date.now() - 86400000 * 3).toISOString(),
          max_score:         100,
          submission_id:     'sub-2',
          submission_status: 'evaluated',
          score:             88,             // ← graded
          is_late:           false,
          submitted_at:      new Date().toISOString(),
          feedback:          'Good work',
        },
      ],
    });

    const res = await request(app)
      .get('/api/student/progress')
      .set('x-user-role', 'student');

    expect(res.status).toBe(200);

    const arrScores = res.body.task_scores;
    expect(arrScores).toHaveLength(2);

    // Ungraded task → Pending evaluation
    expect(arrScores[0].status).toBe('Pending evaluation');
    expect(arrScores[0].score).toBeNull();

    // Evaluated task → real values
    expect(arrScores[1].status).toBe('evaluated');
    expect(arrScores[1].score).toBe(88);
  });

  // ── 5. module_completion calculates completion_pct correctly ─────────────
  test('module_completion computes correct completion_pct', async () => {
    _mockProgressSequence({
      arrModules: [
        { module_id: 'm-1', module_title: 'Intro',    total_items: '10', completed_items: '7' },
        { module_id: 'm-2', module_title: 'Advanced', total_items: '4',  completed_items: '4' },
        { module_id: 'm-3', module_title: 'Empty',    total_items: '0',  completed_items: '0' },
      ],
    });

    const res = await request(app)
      .get('/api/student/progress')
      .set('x-user-role', 'student');

    expect(res.status).toBe(200);

    const arrMod = res.body.module_completion;
    expect(arrMod).toHaveLength(3);
    expect(arrMod[0].completion_pct).toBe(70);   // 7/10 = 70%
    expect(arrMod[1].completion_pct).toBe(100);  // 4/4  = 100%
    expect(arrMod[2].completion_pct).toBe(0);    // 0/0  = 0 (guard)
  });

  // ── 6. task_list derives correct display statuses ────────────────────────
  test('task_list assigns correct display statuses', async () => {
    const strFuture = new Date(Date.now() + 7 * 86400000).toISOString();
    const strPast   = new Date(Date.now() - 2 * 86400000).toISOString();

    _mockProgressSequence({
      arrTasks: [
        // not_submitted (future due_date, no submission)
        { id: 't-1', task_title: 'T1', due_date: strFuture, max_score: 100,
          submission_id: null, submission_status: null, score: null,
          is_late: false, submitted_at: null, feedback: null },
        // overdue (past due_date, no submission)
        { id: 't-2', task_title: 'T2', due_date: strPast, max_score: 100,
          submission_id: null, submission_status: null, score: null,
          is_late: false, submitted_at: null, feedback: null },
        // submitted
        { id: 't-3', task_title: 'T3', due_date: strPast, max_score: 100,
          submission_id: 'sub-3', submission_status: 'submitted', score: null,
          is_late: true, submitted_at: new Date().toISOString(), feedback: null },
        // evaluated
        { id: 't-4', task_title: 'T4', due_date: strPast, max_score: 100,
          submission_id: 'sub-4', submission_status: 'evaluated', score: 90,
          is_late: false, submitted_at: new Date().toISOString(), feedback: 'Great' },
      ],
    });

    const res = await request(app)
      .get('/api/student/progress')
      .set('x-user-role', 'student');

    expect(res.status).toBe(200);
    const arrList = res.body.task_list;
    expect(arrList).toHaveLength(4);
    expect(arrList[0].status).toBe('not_submitted');
    expect(arrList[1].status).toBe('overdue');
    expect(arrList[2].status).toBe('submitted');
    expect(arrList[3].status).toBe('evaluated');
    expect(arrList[3].score).toBe(90);
    expect(arrList[2].is_late).toBe(true);
  });

  // ── 7. Redis cache hit ───────────────────────────────────────────────────
  test('Returns cached response on Redis cache hit (no DB calls)', async () => {
    const objCached = {
      module_completion: [{ module_id: 'm-1', module_title: 'Cached', total_items: 5, completed_items: 5, completion_pct: 100 }],
      weekly_activity:   Array.from({ length: INT_DAYS }, (_, i) => ({
        date:  new Date(Date.now() - (INT_DAYS - 1 - i) * 86400000).toISOString().slice(0, 10),
        count: 0,
      })),
      task_scores: [],
      task_list:   [],
    };
    mockRedis.get.mockResolvedValue(JSON.stringify(objCached));

    const res = await request(app)
      .get('/api/student/progress')
      .set('x-user-role', 'student');

    expect(res.status).toBe(200);
    expect(res.body.module_completion[0].module_title).toBe('Cached');
    expect(res.body.weekly_activity).toHaveLength(INT_DAYS);
    // No DB calls
    expect(mockClient.query).not.toHaveBeenCalled();
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  // ── 8. Unauthenticated request ───────────────────────────────────────────
  test('Returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/student/progress');
    expect(res.status).toBe(401);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

});
