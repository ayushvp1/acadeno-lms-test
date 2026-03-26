// ==========================================================================
// ACADENO LMS — EPIC-06 Student Task View + Submission Tests (US-STU-05)
// ==========================================================================
// Covers:
//   getTasks      — GET /api/student/tasks
//   getTaskDetail — GET /api/student/tasks/:taskId
//   submitTask    — POST /api/student/tasks/:taskId/submit
//
// Test cases:
//   1. getTasks returns task list with submission + is_overdue flag
//   2. getTaskDetail returns full task detail with student_submission
//   3. submitTask: successful first submission (201, status='submitted')
//   4. submitTask: late submission flag set when due_date is in the past
//   5. submitTask: 423 SUBMISSION_LOCKED when existing status != 'reopened'
//   6. submitTask: allowed when existing submission has status='reopened'
//   7. submitTask: 404 when task not found or student not enrolled (BR-C02)
//   8. submitTask: 400 when response_text is missing
// ==========================================================================

const request      = require('supertest');
const express      = require('express');
const cookieParser = require('cookie-parser');

// ---------------------------------------------------------------------------
// Mocks — all module mocks MUST be declared before any app require()
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

// checkEnrollment: always pass in unit tests
jest.mock('../middleware/checkEnrollment', () => (req, res, next) => next());

// ---------------------------------------------------------------------------
// Route + App setup
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
// Shared test data
// ---------------------------------------------------------------------------
const STR_TASK_ID  = 'task-uuid-1';
const STR_USER_ID  = 'user-student-1';
const STR_BATCH_ID = 'batch-uuid-1';

const objPublishedTask = {
  id:       STR_TASK_ID,
  status:   'published',
  due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
  batch_id: STR_BATCH_ID,
};

const objOverdueTask = {
  ...objPublishedTask,
  due_date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
  mockRedis.del.mockReset();
  mockRedis.del.mockResolvedValue(1);
});

// ---------------------------------------------------------------------------
// getTasks
// ---------------------------------------------------------------------------
describe('GET /api/student/tasks — getTasks', () => {

  test('Returns task list with submission info and is_overdue flag', async () => {
    mockClient.query.mockResolvedValueOnce({});              // SET role
    mockClient.query.mockResolvedValueOnce({               // task query
      rows: [
        {
          id:                STR_TASK_ID,
          title:             'Week 1 Assignment',
          description:       'Build a REST API',
          due_date:          objPublishedTask.due_date,
          max_score:         100,
          task_type:         'assignment',
          submission_id:     'sub-uuid-1',
          submission_status: 'submitted',
          score:             85,
          feedback:          'Good work',
          submitted_at:      new Date().toISOString(),
          is_overdue:        false,
        },
        {
          id:                'task-uuid-2',
          title:             'Week 2 Quiz',
          description:       'JS fundamentals',
          due_date:          objOverdueTask.due_date,
          max_score:         50,
          task_type:         'quiz',
          submission_id:     null,
          submission_status: null,
          score:             null,
          feedback:          null,
          submitted_at:      null,
          is_overdue:        true,
        },
      ],
    });

    const res = await request(app)
      .get('/api/student/tasks')
      .set('x-user-role', 'student');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tasks)).toBe(true);
    expect(res.body.tasks).toHaveLength(2);

    // First task — has submission
    const objFirst = res.body.tasks[0];
    expect(objFirst.task.id).toBe(STR_TASK_ID);
    expect(objFirst.task.title).toBe('Week 1 Assignment');
    expect(objFirst.task.is_overdue).toBe(false);
    expect(objFirst.submission).not.toBeNull();
    expect(objFirst.submission.status).toBe('submitted');
    expect(objFirst.submission.score).toBe(85);

    // Second task — overdue, no submission
    const objSecond = res.body.tasks[1];
    expect(objSecond.task.is_overdue).toBe(true);
    expect(objSecond.submission).toBeNull();
  });

  test('Returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/student/tasks');
    expect(res.status).toBe(401);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

});

// ---------------------------------------------------------------------------
// getTaskDetail
// ---------------------------------------------------------------------------
describe('GET /api/student/tasks/:taskId — getTaskDetail', () => {

  test('Returns full task detail with student_submission when it exists', async () => {
    mockClient.query.mockResolvedValueOnce({});   // SET role
    mockClient.query.mockResolvedValueOnce({      // task detail query
      rows: [{
        id:                         STR_TASK_ID,
        title:                      'Final Project',
        description:                'Build a full-stack app',
        rubric:                     'Must include auth, CRUD, tests',
        due_date:                   objPublishedTask.due_date,
        max_score:                  100,
        task_type:                  'project',
        time_remaining_seconds:     604800,        // 7 days in seconds
        submission_id:              'sub-uuid-1',
        submission_status:          'submitted',
        score:                      null,
        feedback:                   null,
        submission_response_text:   'Here is my submission URL...',
        submission_s3_key:          null,
        submitted_at:               new Date().toISOString(),
      }],
    });

    const res = await request(app)
      .get(`/api/student/tasks/${STR_TASK_ID}`)
      .set('x-user-role', 'student');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(STR_TASK_ID);
    expect(res.body.title).toBe('Final Project');
    expect(res.body.rubric).toBe('Must include auth, CRUD, tests');
    expect(res.body.time_remaining_seconds).toBe(604800);
    expect(res.body.student_submission).not.toBeNull();
    expect(res.body.student_submission.status).toBe('submitted');
    expect(res.body.student_submission.response_text).toBe('Here is my submission URL...');
  });

  test('Returns 404 when task is not found or student is not enrolled', async () => {
    mockClient.query.mockResolvedValueOnce({});    // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // task not found

    const res = await request(app)
      .get('/api/student/tasks/non-existent-task')
      .set('x-user-role', 'student');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

});

// ---------------------------------------------------------------------------
// submitTask
// ---------------------------------------------------------------------------
describe('POST /api/student/tasks/:taskId/submit — submitTask', () => {

  // Helper: build mock sequence for a successful submission
  function _mockSuccessSequence(objTaskRow = objPublishedTask) {
    mockClient.query.mockResolvedValueOnce({});                     // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [objTaskRow] }); // task + enrollment check
    mockClient.query.mockResolvedValueOnce({ rows: [] });            // no existing submission
    mockClient.query.mockResolvedValueOnce({                         // INSERT submission
      rows: [{
        id:            'new-sub-uuid',
        task_id:       objTaskRow.id,
        student_id:    STR_USER_ID,
        response_text: 'My answer',
        status:        'submitted',
        is_late:       false,
        s3_key:        null,
        submitted_at:  new Date().toISOString(),
      }],
    });
    mockClient.query.mockResolvedValueOnce({});                     // student_activity upsert
  }

  test('Creates submission with status=submitted (201) on first submit', async () => {
    _mockSuccessSequence();

    const res = await request(app)
      .post(`/api/student/tasks/${STR_TASK_ID}/submit`)
      .set('x-user-role', 'student')
      .set('x-user-id', STR_USER_ID)
      .send({ response_text: 'My answer' });

    expect(res.status).toBe(201);
    expect(res.body.submission).toBeDefined();
    expect(res.body.submission.status).toBe('submitted');
    expect(res.body.submission.is_late).toBe(false);

    // Redis cache invalidation must be called
    expect(mockRedis.del).toHaveBeenCalledWith(`student_dashboard:${STR_USER_ID}`);
  });

  test('Sets is_late=true when due_date is in the past (US-STU-05)', async () => {
    // Task with due_date 2 days ago
    _mockSuccessSequence(objOverdueTask);

    // Patch the INSERT mock to return is_late=true
    // The fourth query (index 3) is the INSERT — reset and rebuild just that one
    // (already set up by _mockSuccessSequence; we need to override the INSERT return)
    mockClient.query.mockReset();
    mockClient.query.mockResolvedValueOnce({});                        // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [objOverdueTask] }); // task check
    mockClient.query.mockResolvedValueOnce({ rows: [] });               // no prior submission
    mockClient.query.mockResolvedValueOnce({                            // INSERT
      rows: [{
        id:            'late-sub-uuid',
        task_id:       objOverdueTask.id,
        student_id:    STR_USER_ID,
        response_text: 'Late answer',
        status:        'submitted',
        is_late:       true,                // ← late flag
        s3_key:        null,
        submitted_at:  new Date().toISOString(),
      }],
    });
    mockClient.query.mockResolvedValueOnce({});                         // activity

    const res = await request(app)
      .post(`/api/student/tasks/${STR_TASK_ID}/submit`)
      .set('x-user-role', 'student')
      .set('x-user-id', STR_USER_ID)
      .send({ response_text: 'Late answer' });

    expect(res.status).toBe(201);
    expect(res.body.submission.is_late).toBe(true);

    // Verify the INSERT was called with is_late=true ($5 param = true)
    // The INSERT is the 4th query call (index 3, after SET+taskCheck+existCheck)
    const arrInsertCall = mockClient.query.mock.calls[3];
    expect(arrInsertCall[1][4]).toBe(true); // $5 = boolIsLate
  });

  test('Returns 423 SUBMISSION_LOCKED when existing submission status is not reopened', async () => {
    mockClient.query.mockResolvedValueOnce({});                          // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [objPublishedTask] }); // task check
    mockClient.query.mockResolvedValueOnce({                              // existing submission
      rows: [{ id: 'existing-sub', status: 'submitted' }],
    });

    const res = await request(app)
      .post(`/api/student/tasks/${STR_TASK_ID}/submit`)
      .set('x-user-role', 'student')
      .send({ response_text: 'Trying to resubmit' });

    expect(res.status).toBe(423);
    expect(res.body.code).toBe('SUBMISSION_LOCKED');
    expect(res.body.error).toContain('locked');

    // INSERT must NOT have been called
    const arrInsertCalls = mockClient.query.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('INSERT INTO task_submissions')
    );
    expect(arrInsertCalls).toHaveLength(0);
  });

  test('Allows resubmission when existing submission status is reopened', async () => {
    mockClient.query.mockResolvedValueOnce({});                          // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [objPublishedTask] }); // task check
    mockClient.query.mockResolvedValueOnce({                              // existing submission (reopened)
      rows: [{ id: 'existing-sub', status: 'reopened' }],
    });
    mockClient.query.mockResolvedValueOnce({                              // UPSERT submission
      rows: [{
        id:            'existing-sub',
        task_id:       STR_TASK_ID,
        student_id:    STR_USER_ID,
        response_text: 'Updated answer',
        status:        'submitted',
        is_late:       false,
        s3_key:        null,
        submitted_at:  new Date().toISOString(),
      }],
    });
    mockClient.query.mockResolvedValueOnce({});                           // activity

    const res = await request(app)
      .post(`/api/student/tasks/${STR_TASK_ID}/submit`)
      .set('x-user-role', 'student')
      .send({ response_text: 'Updated answer' });

    expect(res.status).toBe(201);
    expect(res.body.submission.status).toBe('submitted');
  });

  test('Returns 404 when task not found / student not enrolled (BR-C02)', async () => {
    mockClient.query.mockResolvedValueOnce({});          // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // task + enrollment check fails

    const res = await request(app)
      .post(`/api/student/tasks/${STR_TASK_ID}/submit`)
      .set('x-user-role', 'student')
      .send({ response_text: 'My answer' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');

    // Submission INSERT must NOT have been called
    const arrInsertCalls = mockClient.query.mock.calls.filter(
      call => typeof call[0] === 'string' && call[0].includes('INSERT INTO task_submissions')
    );
    expect(arrInsertCalls).toHaveLength(0);
  });

  test('Returns 400 when response_text is missing from body', async () => {
    const res = await request(app)
      .post(`/api/student/tasks/${STR_TASK_ID}/submit`)
      .set('x-user-role', 'student')
      .send({});  // no response_text

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_PARAM');
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  test('Returns 401 when not authenticated', async () => {
    const res = await request(app)
      .post(`/api/student/tasks/${STR_TASK_ID}/submit`)
      .send({ response_text: 'test' });

    expect(res.status).toBe(401);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

});
