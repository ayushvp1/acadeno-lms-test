const request = require('supertest');
const express = require('express');
const { pool } = require('../db/index');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------------------------
// Jest Setup for Lead Status Transitions (US-BDA-02)
// ---------------------------------------------------------------------------

jest.mock('../db/index', () => ({
  pool: {
    connect: jest.fn()
  }
}));

jest.mock('../utils/jwt', () => ({
  verifyAccessToken: jest.fn(() => ({
    user_id: 'bda-user-1234',
    role: 'bda',
    email: 'bda@acadeno.com'
  }))
}));

const leadsRoutes = require('../routes/leads');
const app = express();
app.use(express.json());
app.use('/api/leads', leadsRoutes);

describe('PATCH /api/leads/:id/status - Status Transitions', () => {
  let mockClient;
  let testToken;
  const leadId = 'lead-9876-uuid';

  beforeAll(() => {
    testToken = jwt.sign(
      { user_id: 'bda-user-1234', role: 'bda' },
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

  const runBasicMockSequence = (leadOverrides) => {
    const leadData = { id: leadId, status: 'new', is_locked: false, ...leadOverrides };
    
    // SET user_id
    mockClient.query.mockResolvedValueOnce({});
    // SET role
    mockClient.query.mockResolvedValueOnce({});
    // BEGIN
    mockClient.query.mockResolvedValueOnce({});
    // SELECT FOR UPDATE
    mockClient.query.mockResolvedValueOnce({ rows: leadData ? [leadData] : [] });
    
    // UPDATE LEADS
    mockClient.query.mockResolvedValueOnce({ rows: [{ ...leadData, status: 'updated' }] });
    // INSERT HISTORY
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'hist-1' }] });
    // COMMIT
    mockClient.query.mockResolvedValueOnce({});
  };

  test('Forward transition allowed natively without explicitly defining reason', async () => {
    runBasicMockSequence({ status: 'new' });

    const res = await request(app)
      .patch(`/api/leads/${leadId}/status`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ new_status: 'contacted' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Status updated');
    
    // Verify Update query variables
    const updateCall = mockClient.query.mock.calls[4];
    expect(updateCall[0]).toContain('UPDATE leads');
    expect(updateCall[1][0]).toBe('contacted'); // new_status
    expect(updateCall[1][1]).toBe(false); // shouldLock = false
  });

  test('Backwards transition securely requires reason field explicitly (400) if missing', async () => {
    // Current status is 'negotiating' (index 3). Trying to go to 'contacted' (index 1).
    const leadData = { id: leadId, status: 'negotiating', is_locked: false };
    mockClient.query.mockResolvedValueOnce({}); // SET
    mockClient.query.mockResolvedValueOnce({}); // SET
    mockClient.query.mockResolvedValueOnce({}); // BEGIN
    mockClient.query.mockResolvedValueOnce({ rows: [leadData] }); // SELECT FOR UPDATE
    
    const res = await request(app)
      .patch(`/api/leads/${leadId}/status`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ new_status: 'contacted' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Reason is required for backwards transition');
    expect(res.body.code).toBe('REASON_REQUIRED');
    expect(mockClient.query.mock.calls[4][0]).toBe('ROLLBACK');
  });

  test('Backwards transition allowed natively whenever reason is accurately detailed', async () => {
    runBasicMockSequence({ status: 'negotiating' });

    const res = await request(app)
      .patch(`/api/leads/${leadId}/status`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ new_status: 'contacted', reason: 'Client went cold on budget.' });

    expect(res.status).toBe(200);
    
    const histCall = mockClient.query.mock.calls[5];
    expect(histCall[0]).toContain('INSERT INTO lead_status_history');
    expect(histCall[1][4]).toBe('Client went cold on budget.');
  });

  test('Locked lead strictly rejects evaluation (423)', async () => {
    const leadData = { id: leadId, status: 'converted', is_locked: true };
    mockClient.query.mockResolvedValueOnce({}); // SET
    mockClient.query.mockResolvedValueOnce({}); // SET
    mockClient.query.mockResolvedValueOnce({}); // BEGIN
    mockClient.query.mockResolvedValueOnce({ rows: [leadData] }); // SELECT

    const res = await request(app)
      .patch(`/api/leads/${leadId}/status`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ new_status: 'cold' });

    expect(res.status).toBe(423);
    expect(res.body.error).toBe('Lead is locked');
    expect(res.body.code).toBe('LEAD_LOCKED');
    expect(mockClient.query.mock.calls[4][0]).toBe('ROLLBACK');
  });

  test('Conversion triggers BR-L04 locks safely appending logic', async () => {
    runBasicMockSequence({ status: 'negotiating' });

    const res = await request(app)
      .patch(`/api/leads/${leadId}/status`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ new_status: 'converted' });

    expect(res.status).toBe(200);
    
    // Check UPDATE call has is_locked evaluated to true
    const updateCall = mockClient.query.mock.calls[4];
    expect(updateCall[1][1]).toBe(true); // shouldLock maps exactly to boolean sequence
  });

  test('Lead ownership safely enforces 404 natively matching 0 rows through RLS', async () => {
    mockClient.query.mockResolvedValueOnce({}); // SET
    mockClient.query.mockResolvedValueOnce({}); // SET
    mockClient.query.mockResolvedValueOnce({}); // BEGIN
    
    // Simulate RLS blocking BDA access returning absolutely 0 rows 
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .patch(`/api/leads/${leadId}/status`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ new_status: 'contacted' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Lead not found or unauthorized');
  });
});
