const request = require('supertest');
const express = require('express');
const { pool } = require('../db/index');
const redis = require('../utils/redis');
const emailService = require('../services/emailService');

// ---------------------------------------------------------------------------
// Jest Setup for Registration Flow (Epic 3)
// ---------------------------------------------------------------------------

jest.mock('../db/index', () => ({
  pool: {
    connect: jest.fn()
  }
}));

jest.mock('../utils/redis', () => ({
  set: jest.fn().mockResolvedValue({}),
  get: jest.fn().mockResolvedValue({}),
  del: jest.fn().mockResolvedValue({})
}));

jest.mock('../services/emailService', () => ({
  sendRegistrationSuccessEmail: jest.fn().mockResolvedValue({}),
  sendEnrollmentSuccessEmail: jest.fn().mockResolvedValue({}),
  sendPaymentLinkEmail: jest.fn().mockResolvedValue({})
}));

jest.mock('../services/fileService', () => ({
  uploadProfilePhoto: (req, res, next) => next(),
  uploadMarksheet: (req, res, next) => next(),
  getUploadedFilePath: jest.fn(() => 'mock/path/file.jpg')
}));

jest.mock('../utils/jwt', () => ({
  generateTokens: jest.fn(() => ({
    accessToken: 'mock_access_token',
    refreshToken: 'mock_refresh_token'
  })),
  verifyAccessToken: jest.fn((token) => {
    if (token === 'valid_wizard_token') {
      return { lead_id: 'lead-123', role: 'lead_registrant' };
    }
    if (token === 'valid_admin_token') {
      return { user_id: 'admin-123', role: 'super_admin' };
    }
    const err = new Error('Invalid token');
    err.name = 'JsonWebTokenError';
    throw err;
  })
}));

const registrationRoutes = require('../routes/registration');
const app = express();
app.use(express.json());
app.use('/api/registration', registrationRoutes);

describe('Registration Flow (Epic 3)', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/registration/draft', () => {
    test('Creates a draft successfully for a lead', async () => {
      // 1. SET role
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 2. Duplicate email check
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 3. INSERT draft
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'draft-123', registration_number: 'REG001', created_at: new Date() }] });

      const res = await request(app)
        .post('/api/registration/draft')
        .set('Authorization', 'Bearer valid_wizard_token')
        .send({
          first_name: 'John', 
          last_name: 'Doe', 
          email: 'john@example.com',
          phone: '1234567890',
          date_of_birth: '2000-01-01',
          gender: 'Male'
        });

      expect(res.status).toBe(201);
      expect(res.body.draft_id).toBe('draft-123');
    });

    test('Fails with invalid token', async () => {
      const res = await request(app)
        .post('/api/registration/draft')
        .set('Authorization', 'Bearer invalid_token')
        .send({});

      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/registration/draft/:id/personal', () => {
    test('Updates personal details in draft', async () => {
      // 1. SET role
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 2. Fetch draft
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'draft-123', status: 'draft' }] });
      // 3. Update
      mockClient.query.mockResolvedValueOnce({ rowCount: 1 });

      const res = await request(app)
        .put('/api/registration/draft/draft-123/personal')
        .set('Authorization', 'Bearer valid_wizard_token')
        .send({ 
          first_name: 'Johnny',
          last_name: 'Doe',
          date_of_birth: '2000-01-01',
          gender: 'Male',
          phone: '1234567890',
          email: 'john@example.com'
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Personal details updated');
    });
  });

  describe('POST /api/registration/draft/:id/submit', () => {
    const mockDraft = {
      id: 'draft-123',
      lead_id: 'lead-123',
      registration_number: 'REG001',
      status: 'draft',
      personal_details: { 
        first_name: 'John', 
        last_name: 'Doe', 
        email: 'john@example.com',
        phone: '1234567890',
        date_of_birth: '2000-01-01',
        gender: 'Male'
      },
      address_documents: { address_line1: '123 St', pin_code: '123456' },
      academic: { qualification: 'B.Tech', institution: 'Uni', year_of_passing: 2022 },
      course_batch: { course_id: 'course-1', batch_id: 'batch-1', base_fee: 1000, gst_amount: 180, total_fee: 1180 }
    };

    test('Successfully submits a complete registration', async () => {
      // 1. SET role
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 2. Fetch Draft
      mockClient.query.mockResolvedValueOnce({ rows: [mockDraft] });
      // 3. Begin Tx
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 4. Insert User (ON CONFLICT DO UPDATE)
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'user-123', is_new_user: true }] });
      // 5. Insert Student
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'student-123' }] });
      // 6. Insert Enrollment
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'enrollment-123' }] });
      // 7. Increment Batch count
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 8. Update Draft Status
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 9. Update Lead Status (if lead exists)
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 10. Insert Lead History
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 11. Commit
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/registration/draft/draft-123/submit')
        .set('Authorization', 'Bearer valid_wizard_token')
        .send({ privacy_consent: true });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('Registration submitted successfully');
    });

    test('Rejects if draft is incomplete', async () => {
      // 1. SET role
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 2. Fetch Draft
      mockClient.query.mockResolvedValueOnce({ rows: [{ ...mockDraft, course_batch: null }] });

      const res = await request(app)
        .post('/api/registration/draft/draft-123/submit')
        .set('Authorization', 'Bearer valid_wizard_token')
        .send({ privacy_consent: true });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('incomplete');
    });
  });

  describe('POST /api/registration/payment-webhook', () => {
    test('Handles successful payment confirmation', async () => {
      const mockEnrollment = {
        id: 'enrollment-123',
        student_id: 'student-123',
        course_id: 'course-1',
        total_fee: 1180
      };
      const mockStudent = {
        id: 'student-123',
        user_id: 'user-123',
        lead_id: 'lead-123',
        registered_by: 'admin-123',
        first_name: 'John',
        email: 'john@example.com'
      };

      // 1. SET role
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 2. Begin Tx
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 3. Update Enrollment Status
      mockClient.query.mockResolvedValueOnce({ rows: [{ student_id: 'student-123' }] });
      // 4. Fetch Student
      mockClient.query.mockResolvedValueOnce({ rows: [mockStudent] });
      // 5. Update Lead Status (lead exists)
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 6. Insert Lead History
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 7. Fetch User for tokens
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'user-123', role: 'student', email: 'john@example.com' }] });
      // 8. Commit
      mockClient.query.mockResolvedValueOnce({ rows: [] });
      // 9. Fetch User for Redis (in email block)
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'user-123' }] });

      // Redis: Get Password
      redis.get.mockResolvedValueOnce('temp_pass_123');

      const res = await request(app)
        .post('/api/registration/payment-webhook')
        .send({ enrollment_id: 'enrollment-123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(emailService.sendEnrollmentSuccessEmail).toHaveBeenCalled();
    });
  });
});
