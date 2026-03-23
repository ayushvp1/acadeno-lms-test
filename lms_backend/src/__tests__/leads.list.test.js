const request = require('supertest');
const express = require('express');
const { pool } = require('../db/index');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------------------------
// Jest Setup for Lead Listing & Search Parameters (US-BDA-08)
// ---------------------------------------------------------------------------

jest.mock('../db/index', () => ({
  pool: {
    connect: jest.fn()
  }
}));

jest.mock('../utils/jwt', () => ({
  verifyAccessToken: jest.fn((token) => {
    if (token === 'expired') {
      const err = new Error('expired');
      err.name = 'TokenExpiredError';
      throw err;
    }
    // Simple mock decoding logic based on what generateToken creates in the test
    const jwt = require('jsonwebtoken');
    return jwt.verify(token, 'test_secret');
  })
}));

const leadsRoutes = require('../routes/leads');
const app = express();
app.use(express.json());
app.use('/api/leads', leadsRoutes);

describe('GET /api/leads - Filter, Pagination, Search', () => {
  let mockClient;

  const generateToken = (role, userId) => {
    return jwt.sign(
      { user_id: userId, role: role, email: `${role}@acadeno.com` },
      'test_secret',
      { algorithm: 'HS256' }
    );
  };

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

  const bdaToken = generateToken('bda', 'bda-1234');
  const adminToken = generateToken('super_admin', 'admin-0000');

  test('Validates BDA explicitly enforcing isolation locks executing array counts natively', async () => {
    // Stage 1: RLS
    mockClient.query.mockResolvedValueOnce({});
    mockClient.query.mockResolvedValueOnce({});
    
    // Stage 2: Count array executing natively 
    mockClient.query.mockResolvedValueOnce({ rows: [{ count: '20' }] });
    // Stage 3: Fetch arrays 
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'lead-1', status: 'new' }] });

    const res = await request(app)
      .get(`/api/leads`)
      .set('Authorization', `Bearer ${bdaToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total_count).toBe(20);
    expect(res.body.leads.length).toBe(1);

    // Verify SET user queries explicitly locked natively on bda-1234
    expect(mockClient.query.mock.calls[0][0]).toContain("set_config('app.current_user_id'");
    expect(mockClient.query.mock.calls[0][1][0]).toBe('bda-1234');
  });

  test('Super Admin skips BDA limitations organically enforcing RLS global checks accurately', async () => {
    mockClient.query.mockResolvedValueOnce({});
    mockClient.query.mockResolvedValueOnce({});
    
    // Total DB count mapping unrestricted 
    mockClient.query.mockResolvedValueOnce({ rows: [{ count: '500' }] });
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'lead-global' }] });

    const res = await request(app)
      .get(`/api/leads`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total_count).toBe(500);

    expect(mockClient.query.mock.calls[1][1][0]).toBe('super_admin'); 
  });

  test('Search triggers ILIKE conditions dynamically binding multiple arrays properly avoiding vulnerabilities', async () => {
    mockClient.query.mockResolvedValueOnce({});
    mockClient.query.mockResolvedValueOnce({});
    mockClient.query.mockResolvedValueOnce({ rows: [{ count: '5' }] });
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get(`/api/leads?search=alex`)
      .set('Authorization', `Bearer ${bdaToken}`);

    const countQuery = mockClient.query.mock.calls[2][0];
    const fetchQuery = mockClient.query.mock.calls[3][0];

    // Check mapping 
    expect(countQuery).toContain('full_name ILIKE');
    expect(countQuery).toContain('email ILIKE');
    expect(countQuery).toContain('phone ILIKE');

    const params = mockClient.query.mock.calls[2][1];
    expect(params[0]).toBe('%alex%');
  });

  test('Status evaluation natively passes strictly separating logic sequences', async () => {
    mockClient.query.mockResolvedValueOnce({});
    mockClient.query.mockResolvedValueOnce({});
    mockClient.query.mockResolvedValueOnce({ rows: [{ count: '1' }] });
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    await request(app)
      .get(`/api/leads?status=negotiating`)
      .set('Authorization', `Bearer ${bdaToken}`);

    const countQuery = mockClient.query.mock.calls[2][0];
    expect(countQuery).toContain('status = $');
    
    const params = mockClient.query.mock.calls[2][1];
    expect(params[0]).toBe('negotiating');
  });

  test('Pagination handles limits and offsets accurately wrapping math cleanly', async () => {
    mockClient.query.mockResolvedValueOnce({});
    mockClient.query.mockResolvedValueOnce({});
    mockClient.query.mockResolvedValueOnce({ rows: [{ count: '50' }] });
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get(`/api/leads?page=2&limit=10`)
      .set('Authorization', `Bearer ${bdaToken}`);

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(10);
    expect(res.body.total_pages).toBe(5); // 50 / 10 = 5

    const fetchQuery = mockClient.query.mock.calls[3][0];
    expect(fetchQuery).toContain('LIMIT $1 OFFSET $2'); 

    // Offset math: (2 - 1) * 10 = 10
    const fetchParams = mockClient.query.mock.calls[3][1];
    expect(fetchParams[0]).toBe(10); // LIMIT
    expect(fetchParams[1]).toBe(10); // OFFSET
  });
});
