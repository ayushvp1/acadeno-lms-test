// ==========================================================================
// ACADENO LMS — EPIC-06 Notification Tests (Prompt I, US-STU-09)
// ==========================================================================
// Covers:
//   1. GET  /api/student/notifications       — getNotifications
//   2. GET  /api/student/notifications/count — getUnreadCount
//   3. PATCH /api/student/notifications/:id/read — markNotificationRead
//   4. createNotification() helper — inserts correct row
//   5. Discussion: trainer reply calls createNotification()
//
// Test cases:
//    1. getNotifications: returns unread list ordered DESC, max 20
//    2. getNotifications: returns empty array when no unread notifications
//    3. getNotifications: returns 401 when not authenticated
//    4. getUnreadCount: returns correct { unread_count } integer
//    5. getUnreadCount: returns 0 when no unread
//    6. getUnreadCount: returns 401 when not authenticated
//    7. markNotificationRead: sets is_read=true and returns { id, is_read }
//    8. markNotificationRead: 404 when notification not found or not owned
//    9. markNotificationRead: 401 when not authenticated
//   10. createNotification helper: inserts row and returns it
//   11. Discussion reply: trainer reply calls createNotification for post author
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

// Mock emailService
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
// App setup — student routes only
// ---------------------------------------------------------------------------
const studentRoutes = require('../routes/student');

function createStudentApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/student', studentRoutes);
  return app;
}

const app = createStudentApp();

// ---------------------------------------------------------------------------
// Discussion app — for trainer-reply → notification test
// ---------------------------------------------------------------------------
const discussionRoutes = require('../routes/discussions');

function createDiscussionApp() {
  const d = express();
  d.use(express.json());
  d.use(cookieParser());
  d.use('/api/discussions', discussionRoutes);
  return d;
}

const discussionApp = createDiscussionApp();

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------
const STR_STUDENT_ID  = 'user-student-1';
const STR_TRAINER_ID  = 'user-trainer-1';
const STR_NOTIF_ID    = 'notif-uuid-1';
const STR_POST_ID     = 'post-uuid-1';

const objSampleNotif = {
  id:           STR_NOTIF_ID,
  type:         'discussion_reply',
  title:        'Trainer replied to your post',
  body:         'Your post "React hooks" received a reply from your trainer.',
  is_read:      false,
  reference_id: STR_POST_ID,
  created_at:   new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
});

// ---------------------------------------------------------------------------
// GET /api/student/notifications — getNotifications
// ---------------------------------------------------------------------------
describe('GET /api/student/notifications — getNotifications', () => {

  // ── 1. Returns unread list ────────────────────────────────────────────────
  test('Returns unread notifications list, ordered DESC', async () => {
    mockClient.query.mockResolvedValueOnce({});                        // SET role
    mockClient.query.mockResolvedValueOnce({                            // SELECT
      rows: [objSampleNotif],
    });

    const res = await request(app)
      .get('/api/student/notifications')
      .set('x-user-role', 'student')
      .set('x-user-id', STR_STUDENT_ID);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.notifications)).toBe(true);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0].id).toBe(STR_NOTIF_ID);
    expect(res.body.notifications[0].type).toBe('discussion_reply');
    expect(res.body.notifications[0].is_read).toBe(false);

    // Confirm user_id was the query parameter
    const arrSelectCall = mockClient.query.mock.calls[1];
    expect(arrSelectCall[1][0]).toBe(STR_STUDENT_ID);
    // Confirm LIMIT 20 was applied
    expect(arrSelectCall[1][1]).toBe(20);
  });

  // ── 2. Returns empty array when no unread ─────────────────────────────────
  test('Returns empty array when student has no unread notifications', async () => {
    mockClient.query.mockResolvedValueOnce({});           // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // no rows

    const res = await request(app)
      .get('/api/student/notifications')
      .set('x-user-role', 'student');

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(0);
  });

  // ── 3. 401 when not authenticated ────────────────────────────────────────
  test('Returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/student/notifications');
    expect(res.status).toBe(401);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

});

// ---------------------------------------------------------------------------
// GET /api/student/notifications/count — getUnreadCount
// ---------------------------------------------------------------------------
describe('GET /api/student/notifications/count — getUnreadCount', () => {

  // ── 4. Returns correct unread_count ───────────────────────────────────────
  test('Returns correct { unread_count: N } integer', async () => {
    mockClient.query.mockResolvedValueOnce({});                         // SET role
    mockClient.query.mockResolvedValueOnce({                             // COUNT
      rows: [{ unread_count: 5 }],
    });

    const res = await request(app)
      .get('/api/student/notifications/count')
      .set('x-user-role', 'student')
      .set('x-user-id', STR_STUDENT_ID);

    expect(res.status).toBe(200);
    expect(typeof res.body.unread_count).toBe('number');
    expect(res.body.unread_count).toBe(5);
  });

  // ── 5. Returns 0 when no unread ───────────────────────────────────────────
  test('Returns unread_count = 0 when no unread notifications exist', async () => {
    mockClient.query.mockResolvedValueOnce({});
    mockClient.query.mockResolvedValueOnce({ rows: [{ unread_count: 0 }] });

    const res = await request(app)
      .get('/api/student/notifications/count')
      .set('x-user-role', 'student');

    expect(res.status).toBe(200);
    expect(res.body.unread_count).toBe(0);
  });

  // ── 6. 401 when not authenticated ────────────────────────────────────────
  test('Returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/student/notifications/count');
    expect(res.status).toBe(401);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

});

// ---------------------------------------------------------------------------
// PATCH /api/student/notifications/:id/read — markNotificationRead
// ---------------------------------------------------------------------------
describe('PATCH /api/student/notifications/:id/read — markNotificationRead', () => {

  // ── 7. Marks notification as read ────────────────────────────────────────
  test('Sets is_read = true and returns { id, is_read: true }', async () => {
    mockClient.query.mockResolvedValueOnce({});                          // SET role
    mockClient.query.mockResolvedValueOnce({                              // UPDATE
      rows: [{ id: STR_NOTIF_ID, is_read: true }],
    });

    const res = await request(app)
      .patch(`/api/student/notifications/${STR_NOTIF_ID}/read`)
      .set('x-user-role', 'student')
      .set('x-user-id', STR_STUDENT_ID);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(STR_NOTIF_ID);
    expect(res.body.is_read).toBe(true);

    // Verify ownership enforced: user_id was $2 in the UPDATE
    const arrUpdateCall = mockClient.query.mock.calls[1];
    expect(arrUpdateCall[1][0]).toBe(STR_NOTIF_ID);   // $1 = notification id
    expect(arrUpdateCall[1][1]).toBe(STR_STUDENT_ID);  // $2 = user_id (ownership)
  });

  // ── 8. 404 when not found or not owned ───────────────────────────────────
  test('Returns 404 when notification not found or not owned by user', async () => {
    mockClient.query.mockResolvedValueOnce({});           // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // UPDATE matched 0 rows

    const res = await request(app)
      .patch('/api/student/notifications/non-existent-id/read')
      .set('x-user-role', 'student');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  // ── 9. 401 when not authenticated ────────────────────────────────────────
  test('Returns 401 when not authenticated', async () => {
    const res = await request(app)
      .patch(`/api/student/notifications/${STR_NOTIF_ID}/read`);

    expect(res.status).toBe(401);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

});

// ---------------------------------------------------------------------------
// createNotification() helper unit tests
// ---------------------------------------------------------------------------
describe('createNotification() helper — notificationHelper.js', () => {

  const { createNotification, NOTIFICATION_TYPES } = require('../utils/notificationHelper');

  // ── 10. Inserts notification row and returns it ───────────────────────────
  test('Inserts correct row and returns the notification object', async () => {
    const objExpectedRow = {
      id:           STR_NOTIF_ID,
      user_id:      STR_STUDENT_ID,
      type:         NOTIFICATION_TYPES.DISCUSSION_REPLY,
      title:        'Trainer replied to your post',
      body:         'Your post received a reply.',
      is_read:      false,
      reference_id: STR_POST_ID,
      created_at:   new Date().toISOString(),
    };

    mockClient.query.mockResolvedValueOnce({});                // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [objExpectedRow] }); // INSERT

    const objResult = await createNotification(
      STR_STUDENT_ID,
      NOTIFICATION_TYPES.DISCUSSION_REPLY,
      'Trainer replied to your post',
      'Your post received a reply.',
      STR_POST_ID
    );

    expect(objResult.id).toBe(STR_NOTIF_ID);
    expect(objResult.user_id).toBe(STR_STUDENT_ID);
    expect(objResult.type).toBe('discussion_reply');
    expect(objResult.is_read).toBe(false);

    // Verify INSERT params: userId=$1, type=$2, title=$3, body=$4, referenceId=$5
    const arrInsertCall = mockClient.query.mock.calls[1];
    expect(arrInsertCall[1][0]).toBe(STR_STUDENT_ID);
    expect(arrInsertCall[1][1]).toBe('discussion_reply');
    expect(arrInsertCall[1][4]).toBe(STR_POST_ID);
  });

});

// ---------------------------------------------------------------------------
// Discussion: trainer reply fires createNotification (integration)
// ---------------------------------------------------------------------------
describe('Discussion: trainer reply fires createNotification (US-STU-09)', () => {

  // ── 11. Trainer reply → createNotification called for post author ─────────
  test('Trainer reply triggers notification INSERT via createNotification', async () => {
    // Discussion controller sequence:
    //   query 0 — SET role (discussion)
    //   query 1 — post + author lookup
    //   query 2 — INSERT reply
    //   query 3 — SET role (notificationHelper)
    //   query 4 — INSERT notifications
    mockClient.query
      .mockResolvedValueOnce({})                                         // SET role (discussion)
      .mockResolvedValueOnce({                                            // post lookup
        rows: [{
          id:           STR_POST_ID,
          title:        'Help with React hooks',
          author_id:    STR_STUDENT_ID,
          author_email: 'student@test.com',
          author_name:  'Ayush Kumar',
        }],
      })
      .mockResolvedValueOnce({                                            // INSERT reply
        rows: [{ id: 'reply-new', post_id: STR_POST_ID,
          author_id: STR_TRAINER_ID, body: 'Great question!',
          created_at: new Date().toISOString() }],
      })
      .mockResolvedValueOnce({})                                         // SET role (notif helper)
      .mockResolvedValueOnce({                                            // INSERT notification
        rows: [{
          id: STR_NOTIF_ID, user_id: STR_STUDENT_ID,
          type: 'discussion_reply', title: 'Trainer replied to your post',
          body: 'Your discussion post "Help with React hooks" received a reply from your trainer.',
          is_read: false, reference_id: STR_POST_ID, created_at: new Date().toISOString(),
        }],
      });

    const res = await request(discussionApp)
      .post(`/api/discussions/${STR_POST_ID}/replies`)
      .set('x-user-role', 'trainer')
      .set('x-user-id', STR_TRAINER_ID)
      .send({ body: 'Great question!' });

    expect(res.status).toBe(201);

    // Verify notification INSERT was called (query index 4)
    const arrNotifInsert = mockClient.query.mock.calls.find(
      call => typeof call[0] === 'string' && call[0].includes('INSERT INTO notifications')
    );
    expect(arrNotifInsert).toBeDefined();
    // First param = user_id of the post author (student)
    expect(arrNotifInsert[1][0]).toBe(STR_STUDENT_ID);
    expect(arrNotifInsert[1][1]).toBe('discussion_reply');

    // Email also sent
    expect(mockEmailService.sendDiscussionReplyEmail).toHaveBeenCalledTimes(1);
  });

});
