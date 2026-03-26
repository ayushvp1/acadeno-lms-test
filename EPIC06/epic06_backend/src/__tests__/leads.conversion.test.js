const request = require('supertest');
const express = require('express');
const { pool } = require('../db/index');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------------------------
// Jest Setup for Lead Conversion (US-BDA-05)
// ---------------------------------------------------------------------------

jest.mock('../db/index', () => ({
  pool: {
    connect: jest.fn()
  }
}));

jest.mock('../utils/jwt', () => ({
  verifyAccessToken: jest.fn(() => ({
    user_id: 'bda-user-8888',
    role: 'bda',
    email: 'bda@acadeno.com'
  }))
}));

const leadsRoutes = require('../routes/leads');
const app = express();
app.use(express.json());
app.use('/api/leads', leadsRoutes);

describe('POST /api/leads/:id/convert - Lead Conversion', () => {
  let mockClient;
  let testToken;
  const leadId = 'lead-0000-uuid';

  beforeAll(() => {
    testToken = jwt.sign(
      { user_id: 'bda-user-8888', role: 'bda' },
      'test_secret',
      { algorithm: 'HS256' }
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

  test('Validates lead status blocking conversion if status is new or contacted (400)', async () => {
    mockClient.query.mockResolvedValueOnce({}); // SET id
    mockClient.query.mockResolvedValueOnce({}); // SET role
    mockClient.query.mockResolvedValueOnce({}); // BEGIN
    
    // Simulate lead at 'contacted' stage
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: leadId, status: 'contacted', is_locked: false }] });

    const res = await request(app)
      .post(`/api/leads/${leadId}/convert`)
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Interested or Negotiating stage to convert');
    expect(res.body.code).toBe('INVALID_STATUS_FOR_CONVERSION');
    expect(mockClient.query.mock.calls[4][0]).toBe('ROLLBACK');
  });

  test('Successfully converts lead if status is interested/negotiating returning prefill data', async () => {
    mockClient.query.mockResolvedValueOnce({}); // SET id
    mockClient.query.mockResolvedValueOnce({}); // SET role
    mockClient.query.mockResolvedValueOnce({}); // BEGIN
    
    const leadData = { 
      id: leadId, 
      full_name: 'Jane Student', 
      email: 'jane@example.com', 
      phone: '1122334455',
      course_interest: 'Data Science',
      status: 'interested', 
      is_locked: false 
    };
    
    mockClient.query.mockResolvedValueOnce({ rows: [leadData] }); // SELECT FOR UPDATE
    mockClient.query.mockResolvedValueOnce({ rows: [{ ...leadData, status: 'converted', is_locked: true }] }); // UPDATE
    mockClient.query.mockResolvedValueOnce({}); // HISTORY
    mockClient.query.mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .post(`/api/leads/${leadId}/convert`)
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Lead converted successfully');
    expect(res.body.registration_prefill.email).toBe('jane@example.com');
    expect(res.body.registration_prefill.full_name).toBe('Jane Student');
  });

  test('Rejects if lead already converted (409)', async () => {
    mockClient.query.mockResolvedValueOnce({}); // SET
    mockClient.query.mockResolvedValueOnce({}); // SET
    mockClient.query.mockResolvedValueOnce({}); // BEGIN
    
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: leadId, status: 'converted', is_locked: true }] });

    const res = await request(app)
      .post(`/api/leads/${leadId}/convert`)
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Lead is already converted');
  });
});

describe('PATCH /api/leads/:id/unlock - Admin Bypass', () => {
  let mockClient;
  let adminToken;

  beforeAll(() => {
    adminToken = jwt.sign(
      { user_id: 'admin-1', role: 'super_admin' },
      'test_secret',
      { algorithm: 'HS256' }
    );
  });

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect.mockResolvedValue(mockClient);
    
    // We need to mock authorize for super_admin specifically here or mock jwt return differently
    // Actually our routes call authorize('super_admin')
    const jwtMod = require('../utils/jwt');
    jwtMod.verifyAccessToken.mockImplementation((token) => {
       if(token === 'admin-token') return { user_id: 'admin-1', role: 'super_admin' };
       return { user_id: 'bda-1', role: 'bda' };
    });
  });

  test('Allows super_admin to unlock lead resetting it to negotiating state', async () => {
    mockClient.query.mockResolvedValueOnce({}); // SET
    mockClient.query.mockResolvedValueOnce({}); // SET
    mockClient.query.mockResolvedValueOnce({}); // BEGIN
    
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'lead-1', status: 'converted' }] }); // SELECT
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'lead-1', status: 'negotiating', is_locked: false }] }); // UPDATE
    mockClient.query.mockResolvedValueOnce({}); // HIST
    mockClient.query.mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .patch(`/api/leads/lead-1/unlock`)
      .set('Authorization', `Bearer admin-token`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Lead unlocked successfully');
    expect(res.body.lead.status).toBe('negotiating');
    
    expect(mockClient.query.mock.calls[4][0]).toContain('UPDATE leads');
    expect(mockClient.query.mock.calls[4][1][0]).toBe('lead-1');
  });

  test('Blocks BDA from unlocking lead (403)', async () => {
    // Note: Router level authorize('super_admin') handles this. 
    // SuperTest + our Express app will trigger it.
    
    const bdaToken = 'bda-token';

    const res = await request(app)
      .patch(`/api/leads/lead-1/unlock`)
      .set('Authorization', `Bearer ${bdaToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Access Denied');
  });
});
