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
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // SELECT
    const res = await request(app).post('/auth/login').send({ email: 'nobody@a.com', password: 'P1!' });
    expect(res.status).toBe(401);
  });

  test('returns 401 for inactive user', async () => {
    mockClient.query.mockResolvedValueOnce({}); // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [mockUser({ is_active: false })] });
    const res = await request(app).post('/auth/login').send({ email: 't@a.com', password: 'P1!' });
    expect(res.status).toBe(401);
  });

  test('Successful login', async () => {
    const user = mockUser();
    mockClient.query.mockResolvedValueOnce({}); // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [user] });   // SELECT
    bcrypt.compare.mockResolvedValueOnce(true);
    mockClient.query.mockResolvedValueOnce({}); // UPDATE reset
    mockClient.query.mockResolvedValueOnce({}); // INSERT refresh
    mockClient.query.mockResolvedValueOnce({}); // UPDATE devices

    const res = await request(app).post('/auth/login').send({ email: 't@a.com', password: 'P!' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });
});

describe('US-AUTH-02: Account Lockout', () => {
  test('returns 423 when locked', async () => {
    const futureDate = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    mockClient.query.mockResolvedValueOnce({}); // SET role
    mockClient.query.mockResolvedValueOnce({ rows: [mockUser({ locked_until: futureDate })] });
    const res = await request(app).post('/auth/login').send({ email: 't@a.com', password: 'P!' });
    expect(res.status).toBe(423);
  });
});
