// ==========================================================================
// ACADENO LMS — EPIC-06 Discussion Forum Tests (US-STU-09)
// ==========================================================================
// Covers:
//   1. GET  /api/discussions?module_id=xxx — getPosts (batch isolation)
//   2. POST /api/discussions               — createPost
//   3. GET  /api/discussions/:postId/replies — getReplies
//   4. POST /api/discussions/:postId/replies — createReply (trainer notification)
//
// Critical test cases:
//   1.  Returns posts filtered by student's batch_id (batch isolation)
//   2.  Student from different batch CANNOT see another batch's posts
//   3.  Returns 400 when module_id is missing
//   4.  Returns 403 when student has no active enrollment
//   5.  createPost: inserts post with batch_id from enrollment (201)
//   6.  createPost: 400 when required fields are missing
//   7.  getReplies: returns replies ordered ASC with author names
//   8.  getReplies: 404 when post not found
//   9.  createReply: inserts reply (201); trainer reply triggers notification + email
//   10. createReply: student reply does NOT trigger notification or email
//   11. Returns 401 when not authenticated on all protected endpoints
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
  checkAndGenerateCertificate: jest.fn(() => Promise.resolve({ generated: false, certificateUrl: null })),
}));

jest.mock('../utils/certificateGenerator', () => ({
  generateCertificate: jest.fn(() => Promise.resolve('/certificates/test.txt')),
}));

// Mock emailService — capture calls without sending real emails
const mockEmailService = {
  sendDiscussionReplyEmail: jest.fn(() => Promise.resolve()),
  sendCertificateEmail:     jest.fn(() => Promise.resolve()),
};
jest.mock('../services/emailService', () => mockEmailService);

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

jest.mock('../middleware/checkEnrollment', () => (req, res, next) => next());

// ---------------------------------------------------------------------------
// App setup — mount the discussions router directly
// ---------------------------------------------------------------------------
const discussionRoutes = require('../routes/discussions');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/discussions', discussionRoutes);
  return app;
}

const app = createApp();

// ---------------------------------------------------------------------------
// Shared test constants
// ---------------------------------------------------------------------------
const STR_MODULE_ID    = 'module-uuid-1';
const STR_POST_ID      = 'post-uuid-1';
const STR_BATCH_ID_B1  = 'batch-b1-uuid';
const STR_BATCH_ID_B2  = 'batch-b2-uuid';
const STR_STUDENT_ID   = 'user-student-1';
const STR_TRAINER_ID   = 'user-trainer-1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
});

// ---------------------------------------------------------------------------
// GET /api/discussions?module_id=xxx — getPosts
// ---------------------------------------------------------------------------
describe('GET /api/discussions — getPosts', () => {

  // ── 1. Batch isolation: only own batch posts returned ────────────────────
  test('Returns posts scoped to student batch_id (batch isolation)', async () => {
    // SET role → batch lookup → posts SELECT
    mockClient.query.mockResolvedValueOnce({});                               // SET role
    mockClient.query.mockResolvedValueOnce({                                   // _getStudentBatchId
      rows: [{ batch_id: STR_BATCH_ID_B1 }],
    });
    mockClient.query.mockResolvedValueOnce({                                   // posts query
      rows: [
        {
          id:          STR_POST_ID,
          title:       'Help with React hooks',
          body:        'I am confused about useEffect',
          module_id:   STR_MODULE_ID,
          batch_id:    STR_BATCH_ID_B1,
          author_id:   STR_STUDENT_ID,
          created_at:  new Date().toISOString(),
          author_name: 'Ayush Kumar',
          author_email: 'ayush@test.com',
          reply_count: 2,
        },
      ],
    });

    const res = await request(app)
      .get(`/api/discussions?module_id=${STR_MODULE_ID}`)
      .set('x-user-role', 'student')
      .set('x-user-id', STR_STUDENT_ID);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.posts)).toBe(true);
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0].batch_id).toBe(STR_BATCH_ID_B1);
    expect(res.body.posts[0].reply_count).toBe(2);
    expect(res.body.posts[0].author_name).toBe('Ayush Kumar');

    // Verify batch_id was used as a query parameter (isolation enforced)
    const arrPostQueryCall = mockClient.query.mock.calls[2];
    expect(arrPostQueryCall[1]).toContain(STR_BATCH_ID_B1);
  });

  // ── 2. B2 student gets empty list (does NOT see B1 posts) ─────────────────
  test('B2 student sees zero posts when B1 has posts — batch isolation enforced', async () => {
    mockClient.query.mockResolvedValueOnce({});                               // SET role
    mockClient.query.mockResolvedValueOnce({                                   // B2 batch lookup
      rows: [{ batch_id: STR_BATCH_ID_B2 }],
    });
    mockClient.query.mockResolvedValueOnce({ rows: [] });                     // no B2 posts

    const res = await request(app)
      .get(`/api/discussions?module_id=${STR_MODULE_ID}`)
      .set('x-user-role', 'student')
      .set('x-user-id', 'user-student-b2');

    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(0);

    // Ensure B2's batch_id was the isolation key, NOT B1's
    const arrPostQueryCall = mockClient.query.mock.calls[2];
    expect(arrPostQueryCall[1]).toContain(STR_BATCH_ID_B2);
    expect(arrPostQueryCall[1]).not.toContain(STR_BATCH_ID_B1);
  });

  // ── 3. 400 when module_id is missing ─────────────────────────────────────
  test('Returns 400 when module_id query param is missing', async () => {
    const res = await request(app)
      .get('/api/discussions')
      .set('x-user-role', 'student');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_PARAM');
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  // ── 4. 403 when student has no active enrollment ──────────────────────────
  test('Returns 403 when student has no active enrollment (cannot determine batch)', async () => {
    mockClient.query.mockResolvedValueOnce({});         // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // no enrollment

    const res = await request(app)
      .get(`/api/discussions?module_id=${STR_MODULE_ID}`)
      .set('x-user-role', 'student');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_ENROLLED');
  });

  // ── 11a. 401 when not authenticated ──────────────────────────────────────
  test('Returns 401 when not authenticated', async () => {
    const res = await request(app).get(`/api/discussions?module_id=${STR_MODULE_ID}`);
    expect(res.status).toBe(401);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

});

// ---------------------------------------------------------------------------
// POST /api/discussions — createPost
// ---------------------------------------------------------------------------
describe('POST /api/discussions — createPost', () => {

  // ── 5. Successfully creates post with batch_id ────────────────────────────
  test('Creates post with batch_id from enrollment (201)', async () => {
    mockClient.query.mockResolvedValueOnce({});                               // SET role
    mockClient.query.mockResolvedValueOnce({                                   // batch lookup
      rows: [{ batch_id: STR_BATCH_ID_B1 }],
    });
    mockClient.query.mockResolvedValueOnce({                                   // INSERT
      rows: [{
        id:         STR_POST_ID,
        module_id:  STR_MODULE_ID,
        batch_id:   STR_BATCH_ID_B1,
        author_id:  STR_STUDENT_ID,
        title:      'My Question',
        body:       'Can someone explain closures?',
        created_at: new Date().toISOString(),
      }],
    });

    const res = await request(app)
      .post('/api/discussions')
      .set('x-user-role', 'student')
      .set('x-user-id', STR_STUDENT_ID)
      .send({ module_id: STR_MODULE_ID, title: 'My Question', body: 'Can someone explain closures?' });

    expect(res.status).toBe(201);
    expect(res.body.post).toBeDefined();
    expect(res.body.post.batch_id).toBe(STR_BATCH_ID_B1);
    expect(res.body.post.title).toBe('My Question');
  });

  // ── 6. 400 when title is missing ─────────────────────────────────────────
  test('Returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/api/discussions')
      .set('x-user-role', 'student')
      .send({ module_id: STR_MODULE_ID, body: 'No title here' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_PARAM');
  });

  // ── 11b. 401 when not authenticated ──────────────────────────────────────
  test('Returns 401 when not authenticated', async () => {
    const res = await request(app)
      .post('/api/discussions')
      .send({ module_id: STR_MODULE_ID, title: 'Test', body: 'Test body' });

    expect(res.status).toBe(401);
  });

});

// ---------------------------------------------------------------------------
// GET /api/discussions/:postId/replies — getReplies
// ---------------------------------------------------------------------------
describe('GET /api/discussions/:postId/replies — getReplies', () => {

  // ── 7. Returns replies ordered ASC with author names ─────────────────────
  test('Returns replies ordered ASC with author names', async () => {
    mockClient.query.mockResolvedValueOnce({});                              // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: STR_POST_ID }] }); // post exists
    mockClient.query.mockResolvedValueOnce({                                  // replies
      rows: [
        {
          id: 'reply-1', post_id: STR_POST_ID, author_id: STR_STUDENT_ID,
          body: 'Great question!', created_at: '2026-03-25T08:00:00Z',
          author_name: 'Ayush Kumar', author_email: 'ayush@test.com',
        },
        {
          id: 'reply-2', post_id: STR_POST_ID, author_id: STR_TRAINER_ID,
          body: 'Closures capture the lexical scope.', created_at: '2026-03-25T09:00:00Z',
          author_name: 'Trainer Joe', author_email: 'trainer@acadeno.com',
        },
      ],
    });

    const res = await request(app)
      .get(`/api/discussions/${STR_POST_ID}/replies`)
      .set('x-user-role', 'student');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.replies)).toBe(true);
    expect(res.body.replies).toHaveLength(2);
    expect(res.body.replies[0].body).toBe('Great question!');
    expect(res.body.replies[1].author_name).toBe('Trainer Joe');
  });

  // ── 8. 404 when post not found ───────────────────────────────────────────
  test('Returns 404 when post does not exist', async () => {
    mockClient.query.mockResolvedValueOnce({});           // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // post not found

    const res = await request(app)
      .get('/api/discussions/non-existent-post/replies')
      .set('x-user-role', 'student');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

});

// ---------------------------------------------------------------------------
// POST /api/discussions/:postId/replies — createReply
// ---------------------------------------------------------------------------
describe('POST /api/discussions/:postId/replies — createReply', () => {

  // ── 9. Trainer reply triggers notification INSERT + email ─────────────────
  test('Trainer reply inserts notification and sends email to post author', async () => {
    mockClient.query.mockResolvedValueOnce({});                              // SET role
    mockClient.query.mockResolvedValueOnce({                                  // post + author lookup
      rows: [{
        id:          STR_POST_ID,
        title:       'Help with React hooks',
        author_id:   STR_STUDENT_ID,
        author_email: 'student@test.com',
        author_name:  'Ayush Kumar',
      }],
    });
    mockClient.query.mockResolvedValueOnce({                                  // INSERT reply
      rows: [{
        id: 'reply-new', post_id: STR_POST_ID,
        author_id: STR_TRAINER_ID, body: 'Great question, here is the answer.',
        created_at: new Date().toISOString(),
      }],
    });
    mockClient.query.mockResolvedValueOnce({});                              // INSERT notification

    const res = await request(app)
      .post(`/api/discussions/${STR_POST_ID}/replies`)
      .set('x-user-role', 'trainer')
      .set('x-user-id', STR_TRAINER_ID)
      .send({ body: 'Great question, here is the answer.' });

    expect(res.status).toBe(201);
    expect(res.body.reply).toBeDefined();
    expect(res.body.reply.body).toBe('Great question, here is the answer.');

    // Notification INSERT must have been called
    const arrNotifCall = mockClient.query.mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('INSERT INTO notifications')
    );
    expect(arrNotifCall).toBeDefined();
    expect(arrNotifCall[1][0]).toBe(STR_STUDENT_ID);    // notify the post author
    expect(arrNotifCall[1][1]).toBe('discussion_reply');

    // Email must have been sent to the post author
    expect(mockEmailService.sendDiscussionReplyEmail).toHaveBeenCalledTimes(1);
    expect(mockEmailService.sendDiscussionReplyEmail).toHaveBeenCalledWith(
      'student@test.com',
      'Ayush Kumar',
      'Help with React hooks',
      'Great question, here is the answer.'
    );
  });

  // ── 10. Student reply does NOT trigger notification or email ──────────────
  test('Student reply does NOT trigger notification or email', async () => {
    mockClient.query.mockResolvedValueOnce({});                              // SET role
    mockClient.query.mockResolvedValueOnce({                                  // post lookup
      rows: [{
        id: STR_POST_ID, title: 'Help with React',
        author_id: 'user-student-2', author_email: 'other@test.com', author_name: 'Other Student',
      }],
    });
    mockClient.query.mockResolvedValueOnce({                                  // INSERT reply
      rows: [{ id: 'reply-s', post_id: STR_POST_ID, author_id: STR_STUDENT_ID,
        body: 'I had the same problem!', created_at: new Date().toISOString() }],
    });

    const res = await request(app)
      .post(`/api/discussions/${STR_POST_ID}/replies`)
      .set('x-user-role', 'student')
      .set('x-user-id', STR_STUDENT_ID)
      .send({ body: 'I had the same problem!' });

    expect(res.status).toBe(201);

    // No notification INSERT
    const arrNotifCall = mockClient.query.mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('INSERT INTO notifications')
    );
    expect(arrNotifCall).toBeUndefined();

    // No email
    expect(mockEmailService.sendDiscussionReplyEmail).not.toHaveBeenCalled();
  });

  // ── 11c. 401 when not authenticated ──────────────────────────────────────
  test('Returns 401 when not authenticated', async () => {
    const res = await request(app)
      .post(`/api/discussions/${STR_POST_ID}/replies`)
      .send({ body: 'Hello' });

    expect(res.status).toBe(401);
  });

  // ── 12. 400 when body is missing ─────────────────────────────────────────
  test('Returns 400 when reply body is missing', async () => {
    const res = await request(app)
      .post(`/api/discussions/${STR_POST_ID}/replies`)
      .set('x-user-role', 'student')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_PARAM');
  });

});
