const request = require('supertest');
const express = require('express');
const { pool } = require('../db/index');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------------------------
// Jest Setup for Lead Notes Validation (US-BDA-03)
// ---------------------------------------------------------------------------

jest.mock('../db/index', () => ({
  pool: {
    connect: jest.fn()
  }
}));

jest.mock('../utils/jwt', () => ({
  verifyAccessToken: jest.fn(() => ({
    user_id: 'bda-1234',
    role: 'bda',
    email: 'bda@acadeno.com'
  }))
}));

const leadsRoutes = require('../routes/leads');
const app = express();
app.use(express.json());
app.use('/api/leads', leadsRoutes);

describe('POST /api/leads/:id/notes - Append-Only Logic', () => {
  let mockClient;
  let testToken;
  const leadId = 'lead-9999-uuid';

  beforeAll(() => {
    testToken = jwt.sign(
      { user_id: 'bda-1234', role: 'bda' },
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

  test('Validates note_text strictly blocking empty or missing contexts returning 400', async () => {
    const res = await request(app)
      .post(`/api/leads/${leadId}/notes`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({}); // Missing note_text

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('note_text is required');
  });

  test('Validates follow_up_date preventing past dates returning 400', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5); 

    const res = await request(app)
      .post(`/api/leads/${leadId}/notes`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ note_text: 'Following up', follow_up_date: pastDate.toISOString() });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('follow_up_date must be today or a future date');
  });

  test('Successfully inserts Note capturing user context and updating targeted bounds', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    // Initial RLS & Transcation Setups
    mockClient.query.mockResolvedValueOnce({}); // SET id
    mockClient.query.mockResolvedValueOnce({}); // SET role
    mockClient.query.mockResolvedValueOnce({}); // BEGIN
    
    // Select FOR UPDATE (Ensures RLS evaluation allows access)
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: leadId }] });
    
    // Insert Into NOTES
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'note-001', note_text: 'Testing Notes' }] });
    // Fetch user context
    mockClient.query.mockResolvedValueOnce({ rows: [{ full_name: 'bda@acadeno.com' }] });
    // Update target LEAD
    mockClient.query.mockResolvedValueOnce({});
    // COMMIT
    mockClient.query.mockResolvedValueOnce({});

    const res = await request(app)
      .post(`/api/leads/${leadId}/notes`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ note_text: 'Testing Notes', follow_up_date: futureDate.toISOString() });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Note added securely');
    expect(res.body.note.bda_name).toBe('bda@acadeno.com');

    // Confirm Update Lead explicitly updates last_activity_at and follow_up_date together
    const updateCall = mockClient.query.mock.calls[6];
    expect(updateCall[0]).toContain('UPDATE leads SET last_activity_at = NOW(), follow_up_date = $1');
  });

  test('Blocks interaction natively 404 whenever RLS prevents isolated matching constraints', async () => {
    mockClient.query.mockResolvedValueOnce({}); // SET id
    mockClient.query.mockResolvedValueOnce({}); // SET role
    mockClient.query.mockResolvedValueOnce({}); // BEGIN
    
    // Native simulated block by having PostgreSQL return 0 rows organically
    mockClient.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post(`/api/leads/${leadId}/notes`)
      .set('Authorization', `Bearer ${testToken}`)
      .send({ note_text: 'Unauthorized intercept note' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Lead not found or access denied');
    expect(mockClient.query.mock.calls[4][0]).toBe('ROLLBACK');
  });
});

describe('GET /api/leads/:id/notes - Sequential Access', () => {
  let mockClient;
  let testToken;
  const leadId = 'lead-9999-uuid';

  beforeAll(() => {
    testToken = jwt.sign(
      { user_id: 'bda-1234', role: 'bda' },
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

  test('Aggregates mapped sequential notes sorting strictly Ascending logically', async () => {
    // Context Setup
    mockClient.query.mockResolvedValueOnce({}); // SET
    mockClient.query.mockResolvedValueOnce({}); // SET
    
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: leadId }] }); // Target Validate
    
    // Notes Join Returns
    mockClient.query.mockResolvedValueOnce({ rows: [
      { id: 1, note_text: 'Note A', created_at: '2023-01-01', bda_name: 'old@bda' },
      { id: 2, note_text: 'Note B', created_at: '2023-01-02', bda_name: 'new@bda' }
    ]});

    const res = await request(app)
      .get(`/api/leads/${leadId}/notes`)
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.notes.length).toBe(2);
    
    const queryStr = mockClient.query.mock.calls[3][0];
    expect(queryStr).toContain('ORDER BY n.created_at ASC');
  });
});
