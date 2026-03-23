// ==========================================================================
// ACADENO LMS — Integration Tests for POST /auth/login
// ==========================================================================
// Covers acceptance criteria for US-AUTH-01 (login) and US-AUTH-02 (lockout).
//
// These tests mock the database (pg), bcrypt, jwt utility, and email service
// so they run fast without external dependencies.
// ==========================================================================

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

// ---------------------------------------------------------------------------
// Mocks — must be set up BEFORE requiring the controller
// ---------------------------------------------------------------------------

// Mock pg pool
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

// Mock bcrypt
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

// Mock jwt utility
jest.mock('../utils/jwt', () => ({
  generateTokens: jest.fn(() => ({
    accessToken:  'mock-access-token',
    refreshToken: 'mock-refresh-token-hex',
  })),
}));

// Mock email service
jest.mock('../services/emailService', () => ({
  sendLockoutEmail: jest.fn(() => Promise.resolve()),
}));

const bcrypt = require('bcrypt');
const { generateTokens } = require('../utils/jwt');
const { sendLockoutEmail } = require('../services/emailService');

// ---------------------------------------------------------------------------
// App setup — minimal Express app with only the auth route
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
// Helper: build a mock user row
// ---------------------------------------------------------------------------
function mockUser(overrides = {}) {
  return {
    id:                 '550e8400-e29b-41d4-a716-446655440000',
    email:              'test@acadeno.com',
    password_hash:      '$2b$10$hashedPasswordHere',
    role:               'student',
    is_active:          true,
    failed_login_count: 0,
    locked_until:       null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
});

// ===========================================================================
// US-AUTH-01: POST /auth/login — Happy Path
// ===========================================================================
describe('US-AUTH-01: POST /auth/login', () => {
  // ---- Validation ----
  test('returns 400 if email is missing', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ password: 'Password123!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email and password are required/i);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('returns 400 if password is missing', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@acadeno.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email and password are required/i);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('returns 400 if email format is invalid', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'not-an-email', password: 'Password123!' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid email format/i);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  // ---- User not found ----
  test('returns 401 "Invalid credentials" when user not found', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // SELECT returns nothing

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@acadeno.com', password: 'Password123!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  // ---- Inactive account ----
  test('returns 401 for inactive user (does not reveal account exists)', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [mockUser({ is_active: false })],
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@acadeno.com', password: 'Password123!' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  // ---- Wrong password ----
  test('returns 401 and increments failed_login_count on wrong password', async () => {
    const user = mockUser({ failed_login_count: 1 });
    mockClient.query.mockResolvedValueOnce({ rows: [user] }); // SELECT
    bcrypt.compare.mockResolvedValueOnce(false);               // wrong password
    mockClient.query.mockResolvedValueOnce({ rows: [] });      // UPDATE

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@acadeno.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');

    // Verify failed_login_count was incremented in the UPDATE call
    const updateCall = mockClient.query.mock.calls[1];
    expect(updateCall[1]).toContain(2); // 1 + 1 = 2
  });

  // ---- Successful login ----
  test('returns 200 with accessToken, user, and sets refreshToken cookie', async () => {
    const user = mockUser();
    mockClient.query.mockResolvedValueOnce({ rows: [user] });   // SELECT
    bcrypt.compare.mockResolvedValueOnce(true);                  // correct password
    mockClient.query.mockResolvedValueOnce({ rows: [] });        // UPDATE reset
    mockClient.query.mockResolvedValueOnce({ rows: [] });        // INSERT refresh token

    const res = await request(app)
      .post('/auth/login')
      .set('User-Agent', 'TestBrowser/1.0')
      .send({ email: 'test@acadeno.com', password: 'CorrectPassword!' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe('mock-access-token');
    expect(res.body.user).toEqual({
      id:    user.id,
      email: user.email,
      role:  user.role,
    });

    // Check refresh cookie was set
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.startsWith('refreshToken='))).toBe(true);

    // Verify generateTokens was called with the user object
    expect(generateTokens).toHaveBeenCalledWith(user);
  });

  test('resets failed_login_count and locked_until on successful login', async () => {
    const user = mockUser({ failed_login_count: 3, locked_until: null });
    mockClient.query.mockResolvedValueOnce({ rows: [user] });   // SELECT
    bcrypt.compare.mockResolvedValueOnce(true);
    mockClient.query.mockResolvedValueOnce({ rows: [] });        // UPDATE reset
    mockClient.query.mockResolvedValueOnce({ rows: [] });        // INSERT token

    await request(app)
      .post('/auth/login')
      .send({ email: 'test@acadeno.com', password: 'CorrectPassword!' });

    // Verify the UPDATE call resets the fields
    const resetCall = mockClient.query.mock.calls[1];
    expect(resetCall[0]).toMatch(/failed_login_count\s*=\s*0/);
    expect(resetCall[0]).toMatch(/locked_until\s*=\s*NULL/);
  });

  test('stores SHA-256 hash of refresh token in db, not the raw token', async () => {
    const user = mockUser();
    mockClient.query.mockResolvedValueOnce({ rows: [user] });
    bcrypt.compare.mockResolvedValueOnce(true);
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .post('/auth/login')
      .set('User-Agent', 'TestBrowser/1.0')
      .send({ email: 'test@acadeno.com', password: 'CorrectPassword!' });

    // The INSERT call (3rd query) should contain token_hash, not raw token
    const insertCall = mockClient.query.mock.calls[2];
    expect(insertCall[0]).toMatch(/INSERT INTO refresh_tokens/);

    // The stored hash should NOT be the raw mock refresh token
    const storedHash = insertCall[1][1]; // $2 param = token_hash
    expect(storedHash).not.toBe('mock-refresh-token-hex');
    expect(storedHash).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  // ---- 500 on unexpected error ----
  test('returns 500 on unexpected database error without leaking details', async () => {
    mockClient.query.mockRejectedValueOnce(new Error('Connection lost'));

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@acadeno.com', password: 'Password123!' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    // Ensure no stack trace leaks
    expect(res.body.stack).toBeUndefined();
    expect(res.body.message).toBeUndefined();
  });
});

// ===========================================================================
// US-AUTH-02: Account Lockout
// ===========================================================================
describe('US-AUTH-02: Account Lockout', () => {
  test('returns 423 when account is currently locked', async () => {
    const futureDate = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const user = mockUser({ locked_until: futureDate });

    mockClient.query.mockResolvedValueOnce({ rows: [user] });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@acadeno.com', password: 'Password123!' });

    expect(res.status).toBe(423);
    expect(res.body.error).toBe('Account locked');
    expect(res.body.locked_until).toBe(futureDate);
    // bcrypt.compare should NOT have been called
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('locks account and sends email after 5th failed attempt', async () => {
    const user = mockUser({ failed_login_count: 4 }); // next fail = 5th
    const lockedUntilDate = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    mockClient.query.mockResolvedValueOnce({ rows: [user] });   // SELECT
    bcrypt.compare.mockResolvedValueOnce(false);                  // wrong password
    mockClient.query.mockResolvedValueOnce({                      // UPDATE with lock
      rows: [{ locked_until: lockedUntilDate }],
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@acadeno.com', password: 'wrong' });

    expect(res.status).toBe(423);
    expect(res.body.error).toBe('Account locked');
    expect(res.body.locked_until).toBe(lockedUntilDate);

    // Verify lockout email was sent
    expect(sendLockoutEmail).toHaveBeenCalledWith(
      user.email,
      lockedUntilDate
    );
  });

  test('allows login after lockout expires and resets counters', async () => {
    // locked_until is in the past → lockout expired
    const pastDate = new Date(Date.now() - 60 * 1000).toISOString();
    const user = mockUser({
      failed_login_count: 5,
      locked_until:       pastDate,
    });

    mockClient.query.mockResolvedValueOnce({ rows: [user] });   // SELECT
    bcrypt.compare.mockResolvedValueOnce(true);                   // correct password
    mockClient.query.mockResolvedValueOnce({ rows: [] });         // UPDATE reset
    mockClient.query.mockResolvedValueOnce({ rows: [] });         // INSERT token

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@acadeno.com', password: 'CorrectPassword!' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();

    // Verify counters were reset
    const resetCall = mockClient.query.mock.calls[1];
    expect(resetCall[0]).toMatch(/failed_login_count\s*=\s*0/);
    expect(resetCall[0]).toMatch(/locked_until\s*=\s*NULL/);
  });

  test('does not lock account on 4th failed attempt (only the 5th)', async () => {
    const user = mockUser({ failed_login_count: 3 }); // next fail = 4th
    mockClient.query.mockResolvedValueOnce({ rows: [user] });
    bcrypt.compare.mockResolvedValueOnce(false);
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // UPDATE increment

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@acadeno.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
    // Should NOT send lockout email
    expect(sendLockoutEmail).not.toHaveBeenCalled();
  });
});
