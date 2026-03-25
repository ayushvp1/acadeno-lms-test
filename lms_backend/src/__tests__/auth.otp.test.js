// ==========================================================================
// ACADENO LMS — Integration Tests for Password Reset OTP (US-AUTH-04)
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
  hash: jest.fn(() => Promise.resolve('$2b$12$newHashedPassword')),
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

function mockUserRow(overrides = {}) {
  return { id: TEST_USER_ID, email: 'test@acadeno.com', ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockReset();
});

describe('POST /auth/forgot-password', () => {
  test('Success when user exists', async () => {
    mockRedis.get.mockResolvedValueOnce(null);                   // rate limit check
    mockClient.query.mockResolvedValueOnce({});                 // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [mockUserRow()] });
    mockRedis.set.mockResolvedValueOnce('OK');
    mockRedis.incr.mockResolvedValueOnce(1);
    mockRedis.expire.mockResolvedValueOnce(1);

    const res = await request(app).post('/auth/forgot-password').send({ email: 'test@acadeno.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/OTP has been sent/);
  });
});

describe('POST /auth/reset-password', () => {
  test('Success on valid OTP', async () => {
    mockClient.query.mockResolvedValueOnce({});                         // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [mockUserRow()] });   // SELECT user
    mockClient.query.mockResolvedValueOnce({});                 // UPDATE password
    mockClient.query.mockResolvedValueOnce({});                 // UPDATE revoke tokens
    mockRedis.get.mockResolvedValueOnce('654321');
    mockRedis.del.mockResolvedValueOnce(1);

    const res = await request(app).post('/auth/reset-password').send({ email: 't@a.com', otp: '654321', newPassword: 'StrongPass1!' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/successfully/i);
  });
});
