// ==========================================================================
// ACADENO LMS — Integration Tests for MFA on New Device (US-AUTH-06)
// ==========================================================================
// Covers:
//   POST /auth/login       — MFA gate on untrusted device
//   POST /auth/verify-mfa  — OTP validation + device trust + token issuance
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
  hash:    jest.fn(() => Promise.resolve('$2b$12$hashedPassword')),
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
const { generateTokens } = require('../utils/jwt');
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

function mockUser(overrides = {}) {
  return {
    id:                 TEST_USER_ID,
    email:              'test@acadeno.com',
    password_hash:      '$2b$10$hashedPasswordHere',
    role:               'student',
    is_active:          true,
    failed_login_count: 0,
    locked_until:       null,
    mfa_enabled:        false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
  mockClient.release.mockReset();
  mockRedis.get.mockReset();
  mockRedis.set.mockReset();
  mockRedis.del.mockReset();
});

// ===========================================================================
// LOGIN — MFA gating
// ===========================================================================
describe('POST /auth/login — MFA on new device', () => {
  test('skips MFA when mfa_enabled = false (normal login)', async () => {
    const user = mockUser({ mfa_enabled: false });
    mockClient.query
      .mockResolvedValueOnce({})                   // SET role
      .mockResolvedValueOnce({ rows: [user] })    // SELECT user
      .mockResolvedValueOnce({ rows: [] })         // UPDATE reset counters (issueTokens helper)
      .mockResolvedValueOnce({ rows: [] })         // INSERT refresh_tokens
      .mockResolvedValueOnce({ rows: [] });        // UPDATE trusted_devices last_seen

    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app)
      .post('/auth/login')
      .set('User-Agent', 'TestBrowser/1.0')
      .send({ email: 'test@acadeno.com', password: 'Password1!' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe('mock-access-token');
    expect(res.body.mfa_required).toBeUndefined();
  });

  test('skips MFA when device IS trusted even if mfa_enabled = true', async () => {
    const user = mockUser({ mfa_enabled: true });
    mockClient.query
      .mockResolvedValueOnce({})                         // SET role
      .mockResolvedValueOnce({ rows: [user] })           // SELECT user
      .mockResolvedValueOnce({ rows: [{ id: 'dev1' }] }) // SELECT trusted_devices → found
      .mockResolvedValueOnce({ rows: [] })                // UPDATE reset counters
      .mockResolvedValueOnce({ rows: [] })                // INSERT refresh_tokens
      .mockResolvedValueOnce({ rows: [] });               // UPDATE trusted_devices last_seen

    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app)
      .post('/auth/login')
      .set('User-Agent', 'TrustedBrowser/1.0')
      .set('x-device-fingerprint', 'trusted-device-uuid')
      .send({ email: 'test@acadeno.com', password: 'Password1!' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.mfa_required).toBeUndefined();
    // MFA email should NOT have been sent
    expect(sendOTPEmail).not.toHaveBeenCalled();
  });

  test('triggers MFA when mfa_enabled = true AND device is NOT trusted', async () => {
    const user = mockUser({ mfa_enabled: true });
    mockClient.query
      .mockResolvedValueOnce({})                 // SET role
      .mockResolvedValueOnce({ rows: [user] })   // SELECT user
      .mockResolvedValueOnce({ rows: [] });      // SELECT trusted_devices → not found

    bcrypt.compare.mockResolvedValueOnce(true);
    mockRedis.set.mockResolvedValueOnce('OK');     // store MFA OTP

    const res = await request(app)
      .post('/auth/login')
      .set('User-Agent', 'NewBrowser/1.0')
      .send({ email: 'test@acadeno.com', password: 'Password1!' });

    expect(res.status).toBe(200);
    expect(res.body.mfa_required).toBe(true);
    expect(res.body.message).toBe('OTP sent to registered email');
    // No access token should be issued
    expect(res.body.accessToken).toBeUndefined();
    // Tokens should NOT have been generated
    expect(generateTokens).not.toHaveBeenCalled();
  });

  test('stores MFA OTP in Redis with correct key and TTL', async () => {
    const user = mockUser({ mfa_enabled: true });
    mockClient.query
      .mockResolvedValueOnce({})             // SET role
      .mockResolvedValueOnce({ rows: [user] })
      .mockResolvedValueOnce({ rows: [] })   // untrusted device
      .mockResolvedValueOnce({ rows: [] });  // reset counters

    bcrypt.compare.mockResolvedValueOnce(true);
    mockRedis.set.mockResolvedValueOnce('OK');

    await request(app)
      .post('/auth/login')
      .send({ email: 'test@acadeno.com', password: 'Password1!' });

    expect(mockRedis.set).toHaveBeenCalledWith(
      `otp:mfa:${user.id}`,
      expect.stringMatching(/^\d{6}$/),
      'EX',
      600
    );
  });

  test('sends MFA OTP via email with purpose = mfa', async () => {
    const user = mockUser({ mfa_enabled: true });
    mockClient.query
      .mockResolvedValueOnce({})             // SET role
      .mockResolvedValueOnce({ rows: [user] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    bcrypt.compare.mockResolvedValueOnce(true);
    mockRedis.set.mockResolvedValueOnce('OK');

    await request(app)
      .post('/auth/login')
      .send({ email: 'test@acadeno.com', password: 'Password1!' });

    expect(sendOTPEmail).toHaveBeenCalledWith(
      user.email,
      expect.stringMatching(/^\d{6}$/),
      'mfa'
    );
  });
});

// ===========================================================================
// POST /auth/verify-mfa
// ===========================================================================
describe('POST /auth/verify-mfa', () => {
  test('returns 400 if email or otp is missing', async () => {
    const cases = [
      { otp: '123456' },                             // no email
      { email: 'test@acadeno.com' },                  // no otp
      {},                                             // neither
    ];

    for (const body of cases) {
      mockClient.query.mockResolvedValueOnce({});               // SET role
      const res = await request(app)
        .post('/auth/verify-mfa')
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });

  test('returns 400 OTP_INVALID when user does not exist', async () => {
    mockClient.query
      .mockResolvedValueOnce({})                            // SET role
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post('/auth/verify-mfa')
      .send({ email: 'nobody@acadeno.com', otp: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OTP_INVALID');
  });

  test('returns 400 OTP_EXPIRED when Redis key is missing', async () => {
    mockClient.query
      .mockResolvedValueOnce({})                            // SET role
      .mockResolvedValueOnce({
        rows: [{ id: TEST_USER_ID, email: 'test@acadeno.com', role: 'student' }],
      });
    mockRedis.get.mockResolvedValueOnce(null);  // OTP expired

    const res = await request(app)
      .post('/auth/verify-mfa')
      .send({ email: 'test@acadeno.com', otp: '123456' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OTP_EXPIRED');
  });

  test('returns 400 OTP_INVALID when OTP does not match', async () => {
    mockClient.query
      .mockResolvedValueOnce({})                            // SET role
      .mockResolvedValueOnce({
        rows: [{ id: TEST_USER_ID, email: 'test@acadeno.com', role: 'student' }],
      });
    mockRedis.get.mockResolvedValueOnce('999999');  // stored OTP

    const res = await request(app)
      .post('/auth/verify-mfa')
      .send({ email: 'test@acadeno.com', otp: '111111' });  // wrong OTP

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OTP_INVALID');
  });

  test('returns 200 with accessToken on valid OTP (trust_device = false)', async () => {
    const user = { id: TEST_USER_ID, email: 'test@acadeno.com', role: 'student' };
    mockClient.query
      .mockResolvedValueOnce({})                   // SET role
      .mockResolvedValueOnce({ rows: [user] })    // SELECT user
      .mockResolvedValueOnce({ rows: [] })         // UPDATE reset counters
      .mockResolvedValueOnce({ rows: [] })         // INSERT refresh_tokens
      .mockResolvedValueOnce({ rows: [] });        // UPDATE trusted_devices last_seen

    mockRedis.get.mockResolvedValueOnce('654321'); // stored OTP
    mockRedis.del.mockResolvedValueOnce(1);        // delete OTP

    const res = await request(app)
      .post('/auth/verify-mfa')
      .set('User-Agent', 'TestBrowser/1.0')
      .send({ email: 'test@acadeno.com', otp: '654321', trust_device: false });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe('mock-access-token');
    expect(res.body.user).toEqual({
      id:    TEST_USER_ID,
      email: 'test@acadeno.com',
      role:  'student',
    });

    // Verify OTP was deleted from Redis
    expect(mockRedis.del).toHaveBeenCalledWith(`otp:mfa:${TEST_USER_ID}`);

    // Cookie should be set
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.startsWith('refreshToken='))).toBe(true);
  });

  test('inserts trusted_device row when trust_device = true', async () => {
    const user = { id: TEST_USER_ID, email: 'test@acadeno.com', role: 'student' };
    mockClient.query
      .mockResolvedValueOnce({})                   // SET role
      .mockResolvedValueOnce({ rows: [user] })    // SELECT user
      .mockResolvedValueOnce({ rows: [] })         // INSERT trusted_devices (ON CONFLICT)
      .mockResolvedValueOnce({ rows: [] })         // UPDATE reset counters
      .mockResolvedValueOnce({ rows: [] })         // INSERT refresh_tokens
      .mockResolvedValueOnce({ rows: [] });        // UPDATE trusted_devices last_seen

    mockRedis.get.mockResolvedValueOnce('654321');
    mockRedis.del.mockResolvedValueOnce(1);

    const res = await request(app)
      .post('/auth/verify-mfa')
      .set('User-Agent', 'TestBrowser/1.0')
      .send({ email: 'test@acadeno.com', otp: '654321', trust_device: true });

    expect(res.status).toBe(200);

    // Verify INSERT INTO trusted_devices was called
    const insertCall = mockClient.query.mock.calls[2]; // Index 2 after SET, SELECT
    expect(insertCall[0]).toMatch(/INSERT INTO trusted_devices/);
    expect(insertCall[0]).toMatch(/ON CONFLICT/);
    expect(insertCall[1]).toContain(TEST_USER_ID);
  });

  test('does NOT insert trusted_device when trust_device is omitted', async () => {
    const user = { id: TEST_USER_ID, email: 'test@acadeno.com', role: 'student' };
    mockClient.query
      .mockResolvedValueOnce({})                   // SET role
      .mockResolvedValueOnce({ rows: [user] })    // SELECT user
      .mockResolvedValueOnce({ rows: [] })         // UPDATE reset counters
      .mockResolvedValueOnce({ rows: [] })         // INSERT refresh_tokens
      .mockResolvedValueOnce({ rows: [] });        // UPDATE trusted_devices last_seen

    mockRedis.get.mockResolvedValueOnce('654321');
    mockRedis.del.mockResolvedValueOnce(1);

    const res = await request(app)
      .post('/auth/verify-mfa')
      .send({ email: 'test@acadeno.com', otp: '654321' });

    expect(res.status).toBe(200);

    // No call with INSERT INTO trusted_devices
    const allQueries = mockClient.query.mock.calls.map(c => c[0]);
    const trustedInserts = allQueries.filter(q => q && q.includes('INSERT INTO trusted_devices'));
    expect(trustedInserts).toHaveLength(0);
  });

  test('returns 500 on unexpected error without leaking details', async () => {
    mockClient.query
      .mockResolvedValueOnce({})                // SET role
      .mockRejectedValueOnce(new Error('DB gone'));

    const res = await request(app)
      .post('/auth/verify-mfa')
      .send({ email: 'test@acadeno.com', otp: '123456' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(res.body.stack).toBeUndefined();
  });
});
