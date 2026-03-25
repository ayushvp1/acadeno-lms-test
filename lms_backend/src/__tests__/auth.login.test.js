// ==========================================================================
// ACADENO LMS — Integration Tests for POST /auth/login
// ==========================================================================
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.mock('../db/index', () => ({
  pool: {
    connect: jest.fn(() => Promise.resolve(mockClient)),
    query: jest.fn(),
  },
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

jest.mock('../utils/jwt', () => ({
  generateTokens: jest.fn(() => ({
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token-hex',
  })),
}));

jest.mock('../services/emailService', () => ({
  sendLockoutEmail: jest.fn(() => Promise.resolve()),
}));

const bcrypt = require('bcrypt');
const { generateTokens } = require('../utils/jwt');
const { sendLockoutEmail } = require('../services/emailService');
const authRoutes = require('../routes/auth');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/auth', authRoutes);
  return app;
}

const app = createApp();

function mockUser(overrides = {}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'test@acadeno.com',
    password_hash: '$2b$10$hashedPasswordHere',
    role: 'student',
    is_active: true,
    failed_login_count: 0,
    locked_until: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
});

describe('US-AUTH-01: POST /auth/login', () => {
  test('returns 400 if email or password missing', async () => {
    const res = await request(app).post('/auth/login').send({ email: '' });
    expect(res.status).toBe(400);
  });

  test('returns 401 "Invalid credentials" when user not found', async () => {
    mockClient.query.mockResolvedValueOnce({});           // SET role
<<<<<<< HEAD
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // SELECT
    const res = await request(app).post('/auth/login').send({ email: 'nobody@a.com', password: 'P1!' });
=======
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // SELECT returns nothing

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@acadeno.com', password: 'Password123!' });

>>>>>>> origin/main
    expect(res.status).toBe(401);
  });

<<<<<<< HEAD
  test('returns 401 for inactive user', async () => {
    mockClient.query.mockResolvedValueOnce({}); // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [mockUser({ is_active: false })] });
    const res = await request(app).post('/auth/login').send({ email: 't@a.com', password: 'P1!' });
=======
  // ---- Inactive account ----
  test('returns 401 for inactive user (does not reveal account exists)', async () => {
    mockClient.query.mockResolvedValueOnce({}); // SET role
    mockClient.query.mockResolvedValueOnce({
      rows: [mockUser({ is_active: false })],
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@acadeno.com', password: 'Password123!' });

>>>>>>> origin/main
    expect(res.status).toBe(401);
  });

<<<<<<< HEAD
  test('Successful login', async () => {
    const user = mockUser();
    mockClient.query.mockResolvedValueOnce({}); // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [user] });   // SELECT
    bcrypt.compare.mockResolvedValueOnce(true);
    mockClient.query.mockResolvedValueOnce({}); // UPDATE reset
    mockClient.query.mockResolvedValueOnce({}); // INSERT refresh
    mockClient.query.mockResolvedValueOnce({}); // UPDATE devices
=======
  // ---- Wrong password ----
  test('returns 401 and increments failed_login_count on wrong password', async () => {
    const user = mockUser({ failed_login_count: 1 });
    mockClient.query.mockResolvedValueOnce({});                // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [user] }); // SELECT
    bcrypt.compare.mockResolvedValueOnce(false);               // wrong password
    mockClient.query.mockResolvedValueOnce({ rows: [] });      // UPDATE

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@acadeno.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');

    // Verify failed_login_count was incremented in the UPDATE call
    const updateCall = mockClient.query.mock.calls[2];
    expect(updateCall[1]).toContain(2); // 1 + 1 = 2
  });

  // ---- Successful login ----
  test('returns 200 with accessToken, user, and sets refreshToken cookie', async () => {
    const user = mockUser();
    mockClient.query.mockResolvedValueOnce({});                  // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [user] });   // SELECT
    bcrypt.compare.mockResolvedValueOnce(true);                  // correct password
    mockClient.query.mockResolvedValueOnce({});        // UPDATE reset
    mockClient.query.mockResolvedValueOnce({});        // INSERT refresh token
    mockClient.query.mockResolvedValueOnce({});        // UPDATE trusted_devices

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
    mockClient.query.mockResolvedValueOnce({});                  // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [user] });   // SELECT
    bcrypt.compare.mockResolvedValueOnce(true);
    mockClient.query.mockResolvedValueOnce({});        // UPDATE reset
    mockClient.query.mockResolvedValueOnce({});        // INSERT token
    mockClient.query.mockResolvedValueOnce({});        // UPDATE trusted_devices

    await request(app)
      .post('/auth/login')
      .send({ email: 'test@acadeno.com', password: 'CorrectPassword!' });

    // Verify the UPDATE call resets the fields
    const resetCall = mockClient.query.mock.calls[2];
    expect(resetCall[0]).toMatch(/failed_login_count\s*=\s*0/);
    expect(resetCall[0]).toMatch(/locked_until\s*=\s*NULL/);
  });

  test('stores SHA-256 hash of refresh token in db, not the raw token', async () => {
    const user = mockUser();
    mockClient.query.mockResolvedValueOnce({}); // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [user] });
    bcrypt.compare.mockResolvedValueOnce(true);
    mockClient.query.mockResolvedValueOnce({});
    mockClient.query.mockResolvedValueOnce({});
    mockClient.query.mockResolvedValueOnce({});

    await request(app)
      .post('/auth/login')
      .set('User-Agent', 'TestBrowser/1.0')
      .send({ email: 'test@acadeno.com', password: 'CorrectPassword!' });

    // The INSERT call (4rd query including SET) should contain token_hash, not raw token
    const insertCall = mockClient.query.mock.calls[3];
    expect(insertCall[0]).toMatch(/INSERT INTO refresh_tokens/);

    // The stored hash should NOT be the raw mock refresh token
    const storedHash = insertCall[1][1]; // $2 param = token_hash
    expect(storedHash).not.toBe('mock-refresh-token-hex');
    expect(storedHash).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  // ---- 500 on unexpected error ----
  test('returns 500 on unexpected database error without leaking details', async () => {
    mockClient.query.mockResolvedValueOnce({}); // SET role
    mockClient.query.mockResolvedValueOnce({}); // SET role
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

    mockClient.query.mockResolvedValueOnce({}); // SET role
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

    mockClient.query.mockResolvedValueOnce({});                // SET role
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

    mockClient.query.mockResolvedValueOnce({});                  // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [user] });   // SELECT
    bcrypt.compare.mockResolvedValueOnce(true);                   // correct password
    mockClient.query.mockResolvedValueOnce({});         // UPDATE reset
    mockClient.query.mockResolvedValueOnce({});         // INSERT token
    mockClient.query.mockResolvedValueOnce({});         // UPDATE trusted_devices

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@acadeno.com', password: 'CorrectPassword!' });
>>>>>>> origin/main

    const res = await request(app).post('/auth/login').send({ email: 't@a.com', password: 'P!' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
<<<<<<< HEAD
  });
});

describe('US-AUTH-02: Account Lockout', () => {
  test('returns 423 when locked', async () => {
    const futureDate = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    mockClient.query.mockResolvedValueOnce({}); // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [mockUser({ locked_until: futureDate })] });
    const res = await request(app).post('/auth/login').send({ email: 't@a.com', password: 'P!' });
    expect(res.status).toBe(423);
=======

    // Verify counters were reset
    const resetCall = mockClient.query.mock.calls[2];
    expect(resetCall[0]).toMatch(/failed_login_count\s*=\s*0/);
    expect(resetCall[0]).toMatch(/locked_until\s*=\s*NULL/);
  });

  test('does not lock account on 4th failed attempt (only the 5th)', async () => {
    const user = mockUser({ failed_login_count: 3 }); // next fail = 4th
    mockClient.query.mockResolvedValueOnce({}); // SET role
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
>>>>>>> origin/main
  });
});
