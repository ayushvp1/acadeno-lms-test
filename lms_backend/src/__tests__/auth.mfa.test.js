// ==========================================================================
// ACADENO LMS — Integration Tests for MFA on New Device (US-AUTH-06)
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
  hash: jest.fn(() => Promise.resolve('$2b$12$hashedPassword')),
}));

jest.mock('../utils/jwt', () => ({
  generateTokens: jest.fn(() => ({
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token-hex',
  })),
}));

const mockRedis = {
  get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(),
};
jest.mock('../utils/redis', () => mockRedis);

jest.mock('../services/emailService', () => ({
  sendLockoutEmail: jest.fn(() => Promise.resolve()),
  sendOTPEmail: jest.fn(() => Promise.resolve()),
}));

const bcrypt = require('bcrypt');
const { generateTokens } = require('../utils/jwt');
const { sendOTPEmail } = require('../services/emailService');
const authRoutes = require('../routes/auth');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/auth', authRoutes);
  return app;
}

const app = createApp();
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';

function mockUser(overrides = {}) {
  return {
    id: TEST_USER_ID, email: 'test@acadeno.com', password_hash: '$2b$10$hashedP', role: 'student',
    is_active: true, failed_login_count: 0, locked_until: null, mfa_enabled: false, ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
});

describe('POST /auth/login — MFA on new device', () => {
  test('skips MFA when mfa_enabled = false', async () => {
    const user = mockUser({ mfa_enabled: false });
    mockClient.query.mockResolvedValueOnce({}); // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [user] });
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // UPDATE reset
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // INSERT refresh
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // UPDATE devices
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app).post('/auth/login').send({ email: 't@a.com', password: 'P!' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  test('triggers MFA on new device', async () => {
    const user = mockUser({ mfa_enabled: true });
    mockClient.query.mockResolvedValueOnce({}); // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [user] });
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // devices → not found
    bcrypt.compare.mockResolvedValueOnce(true);
    mockRedis.set.mockResolvedValueOnce('OK');

    const res = await request(app).post('/auth/login').send({ email: 't@a.com', password: 'P!' });
    expect(res.status).toBe(200);
    expect(res.body.mfa_required).toBe(true);
  });
});

describe('POST /auth/verify-mfa', () => {
  test('Success on valid OTP', async () => {
    const user = { id: TEST_USER_ID, email: 't@a.com', role: 'student' };
    mockClient.query.mockResolvedValueOnce({}); // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [user] });
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // UPDATE reset
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // INSERT refresh
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // UPDATE devices
    mockRedis.get.mockResolvedValueOnce('654321');
    mockRedis.del.mockResolvedValueOnce(1);

    const res = await request(app).post('/auth/verify-mfa').send({ email: 't@a.com', otp: '654321' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });
});
