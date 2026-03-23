// ==========================================================================
// ACADENO LMS — Integration Tests for Password Reset OTP (US-AUTH-04)
// ==========================================================================
// Covers:
//   POST /auth/forgot-password — OTP generation, rate limiting, anti-enum
//   POST /auth/reset-password  — OTP validation, password update, session revoke
// ==========================================================================

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

// ---------------------------------------------------------------------------
// Mocks
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

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash:    jest.fn(() => Promise.resolve('$2b$12$newHashedPassword')),
}));

jest.mock('../utils/jwt', () => ({
  generateTokens: jest.fn(() => ({
    accessToken:  'mock-access-token',
    refreshToken: 'mock-refresh-token-hex',
  })),
}));

const mockRedis = {
  get:    jest.fn(),
  set:    jest.fn(),
  del:    jest.fn(),
  incr:   jest.fn(),
  expire: jest.fn(),
};
jest.mock('../utils/redis', () => mockRedis);

jest.mock('../services/emailService', () => ({
  sendLockoutEmail: jest.fn(() => Promise.resolve()),
  sendOTPEmail:     jest.fn(() => Promise.resolve()),
}));

const bcrypt = require('bcrypt');
const { sendOTPEmail } = require('../services/emailService');

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const authRoutes = require('../routes/auth');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/auth', authRoutes);
  return app;
}

const app = createApp();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

function mockUserRow(overrides = {}) {
  return {
    id:    TEST_USER_ID,
    email: 'test@acadeno.com',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
  mockRedis.get.mockReset();
  mockRedis.set.mockReset();
  mockRedis.del.mockReset();
  mockRedis.incr.mockReset();
  mockRedis.expire.mockReset();
});

// ===========================================================================
// POST /auth/forgot-password
// ===========================================================================
describe('POST /auth/forgot-password', () => {
  test('returns 400 if email is missing', async () => {
    const res = await request(app)
      .post('/auth/forgot-password')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('returns 200 with generic message when user does NOT exist (anti-enumeration)', async () => {
    mockRedis.get.mockResolvedValueOnce(null);                   // rate limit check
    mockClient.query.mockResolvedValueOnce({ rows: [] });        // user not found

    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'nobody@acadeno.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('If this email exists, an OTP has been sent.');
    // Email should NOT have been sent
    expect(sendOTPEmail).not.toHaveBeenCalled();
  });

  test('returns 200 and sends OTP email when user exists', async () => {
    mockRedis.get.mockResolvedValueOnce(null);                   // no rate limit yet
    mockClient.query.mockResolvedValueOnce({                     // user found
      rows: [mockUserRow()],
    });
    mockRedis.set.mockResolvedValueOnce('OK');                   // store OTP
    mockRedis.incr.mockResolvedValueOnce(1);                     // rate limit incr
    mockRedis.expire.mockResolvedValueOnce(1);                   // set TTL

    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'test@acadeno.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('If this email exists, an OTP has been sent.');

    // Verify OTP was stored in Redis with correct key and TTL
    expect(mockRedis.set).toHaveBeenCalledWith(
      `otp:reset:${TEST_USER_ID}`,
      expect.stringMatching(/^\d{6}$/),  // 6-digit OTP
      'EX',
      600
    );

    // Verify email was sent
    expect(sendOTPEmail).toHaveBeenCalledWith(
      'test@acadeno.com',
      expect.stringMatching(/^\d{6}$/),
      'reset'
    );
  });

  test('returns 429 when rate limit is exceeded (3 requests in 15 min)', async () => {
    mockRedis.get.mockResolvedValueOnce('3');                    // already at limit

    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'test@acadeno.com' });

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
    // Should not even query the database
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  test('increments rate limit counter and sets TTL on first request', async () => {
    mockRedis.get.mockResolvedValueOnce(null);
    mockClient.query.mockResolvedValueOnce({
      rows: [mockUserRow()],
    });
    mockRedis.set.mockResolvedValueOnce('OK');
    mockRedis.incr.mockResolvedValueOnce(1);         // first request
    mockRedis.expire.mockResolvedValueOnce(1);

    await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'test@acadeno.com' });

    expect(mockRedis.incr).toHaveBeenCalledWith('otp:ratelimit:test@acadeno.com');
    expect(mockRedis.expire).toHaveBeenCalledWith('otp:ratelimit:test@acadeno.com', 900);
  });

  test('does not reset TTL on subsequent requests within the window', async () => {
    mockRedis.get.mockResolvedValueOnce('1');         // 1 prior request
    mockClient.query.mockResolvedValueOnce({
      rows: [mockUserRow()],
    });
    mockRedis.set.mockResolvedValueOnce('OK');
    mockRedis.incr.mockResolvedValueOnce(2);         // second request

    await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'test@acadeno.com' });

    expect(mockRedis.incr).toHaveBeenCalled();
    // expire should NOT be called again (only on first request)
    expect(mockRedis.expire).not.toHaveBeenCalled();
  });

  test('returns 500 on unexpected error without leaking details', async () => {
    mockRedis.get.mockRejectedValueOnce(new Error('Redis down'));

    const res = await request(app)
      .post('/auth/forgot-password')
      .send({ email: 'test@acadeno.com' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});

// ===========================================================================
// POST /auth/reset-password
// ===========================================================================
describe('POST /auth/reset-password', () => {
  test('returns 400 if any required field is missing', async () => {
    const cases = [
      { email: 'test@acadeno.com', otp: '123456' },                   // no newPassword
      { email: 'test@acadeno.com', newPassword: 'NewPass1!' },         // no otp
      { otp: '123456', newPassword: 'NewPass1!' },                     // no email
    ];

    for (const body of cases) {
      const res = await request(app)
        .post('/auth/reset-password')
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  test('returns 400 WEAK_PASSWORD for passwords that fail complexity check', async () => {
    const weakPasswords = [
      'short1!',          // too short (7 chars)
      'alllowercase1!',   // no uppercase
      'AllUpperCase!',    // no digit
      'AllUpper1case',    // no special char
    ];

    for (const pw of weakPasswords) {
      const res = await request(app)
        .post('/auth/reset-password')
        .send({ email: 'test@acadeno.com', otp: '123456', newPassword: pw });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('WEAK_PASSWORD');
    }
  });

  test('returns 400 "Invalid OTP" when user is not found', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ email: 'nobody@acadeno.com', otp: '123456', newPassword: 'StrongPass1!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid OTP');
  });

  test('returns 400 OTP_EXPIRED when Redis key has expired', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [mockUserRow()],
    });
    mockRedis.get.mockResolvedValueOnce(null);      // OTP key expired

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ email: 'test@acadeno.com', otp: '123456', newPassword: 'StrongPass1!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('OTP expired. Please request a new one.');
    expect(res.body.code).toBe('OTP_EXPIRED');
  });

  test('returns 400 OTP_INVALID when OTP does not match', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [mockUserRow()],
    });
    mockRedis.get.mockResolvedValueOnce('999999');   // stored OTP

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ email: 'test@acadeno.com', otp: '111111', newPassword: 'StrongPass1!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid OTP');
    expect(res.body.code).toBe('OTP_INVALID');
  });

  test('returns 200, updates password, deletes OTP, and revokes all tokens on success', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [mockUserRow()] })   // SELECT user
      .mockResolvedValueOnce({ rows: [] })                 // UPDATE password
      .mockResolvedValueOnce({ rows: [] });                // UPDATE revoke tokens

    mockRedis.get.mockResolvedValueOnce('654321');          // stored OTP matches
    mockRedis.del.mockResolvedValueOnce(1);                 // delete OTP key

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ email: 'test@acadeno.com', otp: '654321', newPassword: 'StrongPass1!' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/password reset successfully/i);

    // Verify bcrypt.hash was called with cost factor 12
    expect(bcrypt.hash).toHaveBeenCalledWith('StrongPass1!', 12);

    // Verify password was updated in DB
    const updateCall = mockClient.query.mock.calls[1];
    expect(updateCall[0]).toMatch(/UPDATE users/);
    expect(updateCall[1][0]).toBe('$2b$12$newHashedPassword');

    // Verify OTP was deleted from Redis
    expect(mockRedis.del).toHaveBeenCalledWith(`otp:reset:${TEST_USER_ID}`);

    // Verify ALL refresh tokens were revoked
    const revokeCall = mockClient.query.mock.calls[2];
    expect(revokeCall[0]).toMatch(/UPDATE refresh_tokens/);
    expect(revokeCall[0]).toMatch(/revoked_at = NOW/);
    expect(revokeCall[1]).toContain(TEST_USER_ID);
  });

  test('also resets failed_login_count and locked_until on password reset', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [mockUserRow()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    mockRedis.get.mockResolvedValueOnce('654321');
    mockRedis.del.mockResolvedValueOnce(1);

    await request(app)
      .post('/auth/reset-password')
      .send({ email: 'test@acadeno.com', otp: '654321', newPassword: 'StrongPass1!' });

    const updateCall = mockClient.query.mock.calls[1];
    expect(updateCall[0]).toMatch(/failed_login_count\s*=\s*0/);
    expect(updateCall[0]).toMatch(/locked_until\s*=\s*NULL/);
  });

  test('returns 500 on unexpected error without leaking details', async () => {
    mockClient.query.mockRejectedValueOnce(new Error('DB down'));

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ email: 'test@acadeno.com', otp: '123456', newPassword: 'StrongPass1!' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(res.body.stack).toBeUndefined();
  });
});
