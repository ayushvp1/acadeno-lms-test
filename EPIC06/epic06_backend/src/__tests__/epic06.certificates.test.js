// ==========================================================================
// ACADENO LMS — EPIC-06 Certificate Generation + Verification Tests (US-STU-07)
// ==========================================================================
// Covers:
//   1. GET /api/student/certificates/:enrollmentId — getCertificate
//   2. GET /api/student/certificates/verify/:token — verifyCertificate (public)
//   3. checkAndGenerateCertificate job — certificate generated at 100%, email sent
//
// Test cases:
//   1.  Returns certificate URL + verification_url for student's own enrollment
//   2.  Returns 404 when certificate not yet generated
//   3.  Returns 401 when unauthenticated on /certificates/:enrollmentId
//   4.  Public verify returns { studentName, courseName, completionDate, isValid: true }
//   5.  Public verify returns 404 for invalid token (no auth needed)
//   6.  Public verify works WITHOUT authentication header
//   7.  checkAndGenerateCertificate: generates certificate when pct = 100%
//   8.  checkAndGenerateCertificate: sends certificate email after generation
//   9.  checkAndGenerateCertificate: skips when pct < 100%
//   10. checkAndGenerateCertificate: idempotent — skips if already exists
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

// Mock certificateGenerator so no real file I/O happens
jest.mock('../utils/certificateGenerator', () => ({
  generateCertificate: jest.fn(() => Promise.resolve('/certificates/certificate_test-token.txt')),
}));

// Mock emailService to capture calls without sending real emails
const mockEmailService = {
  sendCertificateEmail: jest.fn(() => Promise.resolve()),
};
jest.mock('../services/emailService', () => mockEmailService);

// certificateJob is NOT mocked here — we test the real implementation
jest.mock('../jobs/certificateJob', () => jest.requireActual('../jobs/certificateJob'));

// authenticate: inject user from headers
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
const STR_STUDENT_USER_ID  = 'user-student-1';
const STR_ENROLLMENT_ID    = 'enroll-abc-123';
const STR_VERIFY_TOKEN     = 'verify-token-uuid-456';
const STR_CERT_URL         = '/certificates/certificate_verify-token-uuid-456.txt';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue('OK');
});

// ---------------------------------------------------------------------------
// Tests: GET /api/student/certificates/:enrollmentId
// ---------------------------------------------------------------------------
describe('GET /api/student/certificates/:enrollmentId — getCertificate', () => {

  // ── 1. Returns certificate data for authenticated student ─────────────────
  test('Returns certificate_url, verification_url, and generated_at for authenticated student', async () => {
    // SET role + SELECT certificate
    mockClient.query.mockResolvedValueOnce({});   // SET role
    mockClient.query.mockResolvedValueOnce({
      rows: [{
        id:                        'cert-1',
        certificate_url:           STR_CERT_URL,
        public_verification_token: STR_VERIFY_TOKEN,
        generated_at:              '2026-03-25T08:00:00.000Z',
      }],
    });

    const res = await request(app)
      .get(`/api/student/certificates/${STR_ENROLLMENT_ID}`)
      .set('x-user-role', 'student')
      .set('x-user-id', STR_STUDENT_USER_ID);

    expect(res.status).toBe(200);
    expect(res.body.certificate_url).toBe(STR_CERT_URL);
    expect(res.body.public_verification_token).toBe(STR_VERIFY_TOKEN);
    expect(res.body.verification_url).toContain('/api/student/certificates/verify/');
    expect(res.body.verification_url).toContain(STR_VERIFY_TOKEN);
    expect(res.body.generated_at).toBe('2026-03-25T08:00:00.000Z');
  });

  // ── 2. Returns 404 when no certificate exists ─────────────────────────────
  test('Returns 404 when certificate not yet generated for enrollment', async () => {
    mockClient.query.mockResolvedValueOnce({});           // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // no cert found

    const res = await request(app)
      .get(`/api/student/certificates/${STR_ENROLLMENT_ID}`)
      .set('x-user-role', 'student')
      .set('x-user-id', STR_STUDENT_USER_ID);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  // ── 3. Returns 401 without auth ───────────────────────────────────────────
  test('Returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .get(`/api/student/certificates/${STR_ENROLLMENT_ID}`);

    expect(res.status).toBe(401);
    expect(mockClient.query).not.toHaveBeenCalled();
  });

});

// ---------------------------------------------------------------------------
// Tests: GET /api/student/certificates/verify/:token (public)
// ---------------------------------------------------------------------------
describe('GET /api/student/certificates/verify/:token — verifyCertificate (public)', () => {

  // ── 4. Valid token returns student, course, date, isValid = true ──────────
  test('Returns studentName, courseName, completionDate, isValid for valid token', async () => {
    mockClient.query.mockResolvedValueOnce({});   // SET role
    mockClient.query.mockResolvedValueOnce({
      rows: [{
        first_name:      'Ayush',
        last_name:       'Kumar',
        course_name:     'Full Stack Web Dev',
        completion_date: '2026-03-25T08:00:00.000Z',
      }],
    });

    const res = await request(app)
      .get(`/api/student/certificates/verify/${STR_VERIFY_TOKEN}`);
    // Note: NO x-user-role header — public endpoint

    expect(res.status).toBe(200);
    expect(res.body.isValid).toBe(true);
    expect(res.body.studentName).toBe('Ayush Kumar');
    expect(res.body.courseName).toBe('Full Stack Web Dev');
    expect(res.body.completionDate).toBe('2026-03-25T08:00:00.000Z');
  });

  // ── 5. Invalid token returns 404 ──────────────────────────────────────────
  test('Returns 404 with isValid: false for an invalid token', async () => {
    mockClient.query.mockResolvedValueOnce({});           // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // no cert found

    const res = await request(app)
      .get('/api/student/certificates/verify/bogus-token-xyz');

    expect(res.status).toBe(404);
    expect(res.body.isValid).toBe(false);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  // ── 6. Works WITHOUT any authentication header ────────────────────────────
  test('Public verify endpoint works without authentication header (no 401)', async () => {
    mockClient.query.mockResolvedValueOnce({});
    mockClient.query.mockResolvedValueOnce({
      rows: [{
        first_name:      'Jane',
        last_name:       'Doe',
        course_name:     'Data Science Fundamentals',
        completion_date: '2026-02-14T12:00:00.000Z',
      }],
    });

    // No x-user-role header at all
    const res = await request(app)
      .get(`/api/student/certificates/verify/${STR_VERIFY_TOKEN}`);

    // Must NOT return 401
    expect(res.status).toBe(200);
    expect(res.body.isValid).toBe(true);
    expect(res.body.studentName).toBe('Jane Doe');
  });

});

// ---------------------------------------------------------------------------
// Tests: checkAndGenerateCertificate job
// ---------------------------------------------------------------------------
describe('checkAndGenerateCertificate — certificateJob', () => {

  const { checkAndGenerateCertificate } = require('../jobs/certificateJob');
  const mockCertGen = require('../utils/certificateGenerator');

  // ── 7. Generates certificate when completion_pct = 100% ──────────────────
  test('Generates certificate when enrollment is 100% complete', async () => {
    mockClient.query.mockResolvedValueOnce({});                                       // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [{ course_id: 'course-1' }] });   // resolve course
    mockClient.query.mockResolvedValueOnce({                                           // completion count
      rows: [{ total_items: '10', completed_items: '10' }],
    });
    mockClient.query.mockResolvedValueOnce({ rows: [] });                             // no existing cert
    mockClient.query.mockResolvedValueOnce({                                           // student/course details
      rows: [{
        first_name:    'Ayush',
        last_name:     'Kumar',
        email:         'ayush@test.com',
        course_name:   'Full Stack Web Dev',
        trainer_email: 'trainer@acadeno.com',
      }],
    });
    mockClient.query.mockResolvedValueOnce({});                                       // INSERT certificate

    const result = await checkAndGenerateCertificate({
      studentId:    STR_STUDENT_USER_ID,
      enrollmentId: STR_ENROLLMENT_ID,
    });

    expect(result.generated).toBe(true);
    expect(result.certificateUrl).toBe('/certificates/certificate_test-token.txt');
    expect(mockCertGen.generateCertificate).toHaveBeenCalledTimes(1);
    expect(mockCertGen.generateCertificate).toHaveBeenCalledWith(expect.objectContaining({
      studentName: 'Ayush Kumar',
      courseName:  'Full Stack Web Dev',
    }));
  });

  // ── 8. Sends certificate email after generation ───────────────────────────
  test('Sends certificate email to student after generation', async () => {
    mockClient.query.mockResolvedValueOnce({});
    mockClient.query.mockResolvedValueOnce({ rows: [{ course_id: 'course-1' }] });
    mockClient.query.mockResolvedValueOnce({
      rows: [{ total_items: '5', completed_items: '5' }],
    });
    mockClient.query.mockResolvedValueOnce({ rows: [] });                             // no existing cert
    mockClient.query.mockResolvedValueOnce({
      rows: [{
        first_name:    'Sample',
        last_name:     'Student',
        email:         'sample@test.com',
        course_name:   'Python Bootcamp',
        trainer_email: 'trainer@acadeno.com',
      }],
    });
    mockClient.query.mockResolvedValueOnce({});                                       // INSERT

    await checkAndGenerateCertificate({
      studentId:    STR_STUDENT_USER_ID,
      enrollmentId: STR_ENROLLMENT_ID,
    });

    expect(mockEmailService.sendCertificateEmail).toHaveBeenCalledTimes(1);
    expect(mockEmailService.sendCertificateEmail).toHaveBeenCalledWith(
      'sample@test.com',
      'Sample Student',
      'Python Bootcamp',
      expect.any(String), // completionDate string
      expect.stringContaining('/api/student/certificates/verify/')
    );
  });

  // ── 9. Does NOT generate when pct < 100% ─────────────────────────────────
  test('Skips certificate generation when completion_pct < 100%', async () => {
    mockClient.query.mockResolvedValueOnce({});
    mockClient.query.mockResolvedValueOnce({ rows: [{ course_id: 'course-1' }] });
    mockClient.query.mockResolvedValueOnce({
      rows: [{ total_items: '10', completed_items: '8' }],  // 80%
    });

    const result = await checkAndGenerateCertificate({
      studentId:    STR_STUDENT_USER_ID,
      enrollmentId: STR_ENROLLMENT_ID,
    });

    expect(result.generated).toBe(false);
    expect(result.certificateUrl).toBeNull();
    expect(mockCertGen.generateCertificate).not.toHaveBeenCalled();
    expect(mockEmailService.sendCertificateEmail).not.toHaveBeenCalled();
  });

  // ── 10. Idempotent — skips if certificate already exists ──────────────────
  test('Is idempotent: returns existing certificate without regenerating', async () => {
    mockClient.query.mockResolvedValueOnce({});
    mockClient.query.mockResolvedValueOnce({ rows: [{ course_id: 'course-1' }] });
    mockClient.query.mockResolvedValueOnce({
      rows: [{ total_items: '5', completed_items: '5' }],   // 100%
    });
    // Existing cert found
    mockClient.query.mockResolvedValueOnce({
      rows: [{
        id:              'existing-cert',
        certificate_url: STR_CERT_URL,
        public_verification_token: STR_VERIFY_TOKEN,
      }],
    });

    const result = await checkAndGenerateCertificate({
      studentId:    STR_STUDENT_USER_ID,
      enrollmentId: STR_ENROLLMENT_ID,
    });

    expect(result.generated).toBe(false);
    expect(result.certificateUrl).toBe(STR_CERT_URL);
    // File generator and email must NOT be called
    expect(mockCertGen.generateCertificate).not.toHaveBeenCalled();
    expect(mockEmailService.sendCertificateEmail).not.toHaveBeenCalled();
  });

});
