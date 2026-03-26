const request = require('supertest');
const express = require('express');
const { pool } = require('../db/index');
const redis = require('../utils/redis');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------------------------
// Jest Setup for KPI Dashboard metrics (US-BDA-04)
// ---------------------------------------------------------------------------

jest.mock('../db/index', () => ({
  pool: {
    connect: jest.fn()
  }
}));

jest.mock('../utils/redis', () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn()
}));

jest.mock('../utils/jwt', () => ({
  verifyAccessToken: jest.fn(() => ({
    user_id: 'bda-alpha-uuid',
    role: 'bda',
    email: 'alpha@acadeno.com'
  }))
}));

const leadsRoutes = require('../routes/leads');
const app = express();
app.use(express.json());
app.use('/api/leads', leadsRoutes);

describe('GET /api/leads/dashboard - Native BDA Isolation & Metric Aggregation', () => {
  let mockClient;
  let testToken;
  const bdaId = 'bda-alpha-uuid';

  beforeAll(() => {
    testToken = jwt.sign(
      { user_id: bdaId, role: 'bda' },
      'test_secret',
      { algorithm: 'HS256' } // Fallback testing standard
    );
  });

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

  test('Directly serves cached Redis data if it exists bypassing full computations natively', async () => {
    const cachedDashboard = {
      total_leads_this_month: 5,
      conversion_rate: 20.0,
      pipeline_board: { new: 3, converted: 1 },
      overdue_followups: [],
      monthly_target: { target: 20, achieved: 1, percentage: 5.0 }
    };
    
    // Simulate cache hit organically
    redis.get.mockResolvedValueOnce(JSON.stringify(cachedDashboard));

    const res = await request(app)
      .get(`/api/leads/dashboard`)
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.conversion_rate).toBe(20.0);
    
    // Verify PostgreSQL logic didn't physically fire since cache organically caught it first
    expect(mockClient.query).not.toHaveBeenCalled();
    expect(redis.get).toHaveBeenCalledWith(`dashboard:${bdaId}`);
  });

  test('Computes strict RLS isolation filtering BDA interactions appropriately executing full query matrix natively', async () => {
    // Stage 1: Cache Miss
    redis.get.mockResolvedValueOnce(null);

    // Stage 2: RLS Setters
    mockClient.query.mockResolvedValueOnce({});
    mockClient.query.mockResolvedValueOnce({});

    // Stage 3: Total Leads Count 
    mockClient.query.mockResolvedValueOnce({ rows: [{ count: '10' }] });
    // Stage 4: Converted Leads Count
    mockClient.query.mockResolvedValueOnce({ rows: [{ count: '2' }] });
    // Stage 5: Pipeline Groups
    mockClient.query.mockResolvedValueOnce({ rows: [
      { status: 'new', count: '5' },
      { status: 'converted', count: '2' },
      { status: 'negotiating', count: '3' }
    ]});
    // Stage 6: Overdue Followups
    mockClient.query.mockResolvedValueOnce({ rows: [
      { id: '123', full_name: 'John', status: 'new' }
    ]});

    const res = await request(app)
      .get(`/api/leads/dashboard`)
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    // Explicit Metrics validations dynamically mapping mathematics securely
    expect(res.body.total_leads_this_month).toBe(10);
    expect(res.body.conversion_rate).toBe(20.0); // (2/10) * 100
    expect(res.body.pipeline_board.new).toBe(5);
    expect(res.body.overdue_followups[0].overdue).toBe(true);
    expect(res.body.monthly_target.achieved).toBe(2);

    // Ensure array matrices natively updated the actual user cache cleanly mapping 300 TTL standard rules explicitly
    expect(redis.set).toHaveBeenCalledWith(
      `dashboard:${bdaId}`,
      expect.any(String),
      'EX',
      300
    );

    // Explicitly confirm BDA mapping isolate sequence locking variables securely 
    expect(mockClient.query.mock.calls[0][0]).toContain("set_config('app.current_user_id'");
    expect(mockClient.query.mock.calls[0][1][0]).toBe(bdaId);
  });
});

describe('PATCH /api/leads/:id/status Redis Cache Invalidation Matrices', () => {
  let mockClient;
  let testToken;

  beforeAll(() => {
    testToken = jwt.sign(
      { user_id: 'bda-alpha-uuid', role: 'bda' },
      'test_secret',
      { algorithm: 'HS256' } // Fallback testing standard
    );
  });

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect.mockResolvedValue(mockClient);
    jest.clearAllMocks();
  });

  test('Invalidates Native user dashboard logically after successful status manipulation matrices execute securely', async () => {
    mockClient.query.mockResolvedValueOnce({}); // SET 
    mockClient.query.mockResolvedValueOnce({}); // SET 
    mockClient.query.mockResolvedValueOnce({}); // BEGIN
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'lead-test', status: 'new' }] }); // SELECT 
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'lead-test', status: 'contacted' }] }); // UPDATE 
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'hist' }] }); // HIST 
    mockClient.query.mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .patch(`/api/leads/lead-test/status`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ new_status: 'contacted' });

    expect(res.status).toBe(200);
    
    // Explicit array logic enforcing native redis clearance routines correctly targeting identical isolate variables exclusively
    expect(redis.del).toHaveBeenCalledWith('dashboard:bda-alpha-uuid');
  });
});
