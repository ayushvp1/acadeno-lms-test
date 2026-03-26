const request = require('supertest');
const express = require('express');
const { pool } = require('../db/index');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------------------------
// Jest Setup for Lead Creation Tests (US-BDA-01)
// ---------------------------------------------------------------------------

// Mock the DB comprehensively mapping transactions correctly.
jest.mock('../db/index', () => ({
  pool: {
    connect: jest.fn()
  }
}));

// Mock authentication utilities enforcing payload bypassing
jest.mock('../utils/jwt', () => ({
  verifyAccessToken: jest.fn(() => ({
    user_id: 'bda-1234-5678-uuid',
    role: 'bda',
    email: 'bda@acadeno.com'
  }))
}));

// Setup Standalone Test App isolated from persistent Redis handles Native mapped in app.js
const leadsRoutes = require('../routes/leads');
const app = express();
app.use(express.json());
app.use('/api/leads', leadsRoutes);

describe('POST /api/leads - Lead Creation', () => {
  let mockClient;
  let testToken;
  let bdaUserId = 'bda-1234-5678-uuid';

  beforeAll(() => {
    // Generate an asymmetric token payload mapping BDA contexts natively
    testToken = jwt.sign(
      { user_id: bdaUserId, role: 'bda', email: 'bda@acadeno.com' },
      process.env.JWT_PRIVATE_KEY || 'test_secret', // Fallback for env testing
      { algorithm: process.env.JWT_PRIVATE_KEY ? 'RS256' : 'HS256' }
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

  const validLeadPayload = {
    full_name: 'John Doe',
    email: 'johndoe@example.com',
    phone: '1234567890',
    course_interest: 'Full Stack Development',
    lead_source: 'Facebook Ad'
  };

  test('Validates required fields missing gracefully returning 400', async () => {
    const res = await request(app)
      .post('/api/leads')
      .set('Cookie', [`accessToken=${testToken}`]) // Emulate HttpOnly
      .set('Authorization', `Bearer ${testToken}`) 
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContain('full_name is required');
    expect(res.body.details).toContain('phone is required');
  });

  test('Validates email format strictly returning 400', async () => {
    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ ...validLeadPayload, email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.details).toContain('Invalid email format');
  });

  test('Validates phone exactly 10 digits returning 400', async () => {
    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ ...validLeadPayload, phone: '12345' });

    expect(res.status).toBe(400);
    expect(res.body.details).toContain('Phone must be 10 digits');
  });

  test('Rejects duplicate mapping strictly validating email + phone combination returning 409', async () => {
    // Stage 1: Setting App constraints
    mockClient.query.mockResolvedValueOnce({});
    mockClient.query.mockResolvedValueOnce({});
    // Stage 2: BEGIN
    mockClient.query.mockResolvedValueOnce({});
    // Stage 3: Dup Check Query hitting a match
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: 'existing-uuid', email: validLeadPayload.email, phone: validLeadPayload.phone }]
    });

    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${testToken}`)
      .send(validLeadPayload);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Duplicate lead detected');
    expect(res.body.code).toBe('DUPLICATE_LEAD');
    expect(res.body.existing_lead).toBeDefined();
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
  });

  test('Creates a lead successfully issuing correct 201 mapped to BDA constraints', async () => {
    // Transaction Mappings
    mockClient.query.mockResolvedValueOnce({}); // SET user_id
    mockClient.query.mockResolvedValueOnce({}); // SET user_role
    mockClient.query.mockResolvedValueOnce({}); // BEGIN
    
    // Duplicate Check Query matching nothing natively 
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    
    // Insert Into Leads Query
    mockClient.query.mockResolvedValueOnce({
      rows: [{ id: 'new-lead-uuid', ...validLeadPayload, bda_id: bdaUserId, status: 'new' }]
    });
    
    // Insert History
    mockClient.query.mockResolvedValueOnce({});

    // COMMIT
    mockClient.query.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${testToken}`)
      .send(validLeadPayload);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Lead created successfully');
    expect(res.body.lead.id).toBe('new-lead-uuid');
    
    // Check that SET properties applied sequentially enforcing RLS
    expect(mockClient.query.mock.calls[0][0]).toContain("set_config('app.current_user_id'");
    expect(mockClient.query.mock.calls[1][0]).toContain("set_config('app.current_user_role'");
    expect(mockClient.query.mock.calls[4][0]).toContain('INSERT INTO leads');
  });

  test('Automatically maps Notes directly into lead_notes during transaction if appended natively', async () => {
    mockClient.query.mockResolvedValue({ rows: [] }); // Default silent pass
    
    mockClient.query.mockResolvedValueOnce({}); // SET 
    mockClient.query.mockResolvedValueOnce({}); // SET 
    mockClient.query.mockResolvedValueOnce({}); // BEGIN
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // DUP
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'new-uuid', status: 'new' }] }); // Insert Lead
    mockClient.query.mockResolvedValueOnce({}); // History 
    
    // Here we map the Note 
    mockClient.query.mockResolvedValueOnce({}); // Notes Append
    
    await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ ...validLeadPayload, notes: 'Called prospect. Sent email dynamically.' });

    // History is call index 5. Notes insertion is call index 6.
    const noteCall = mockClient.query.mock.calls[6];
    expect(noteCall[0]).toContain('INSERT INTO lead_notes');
    expect(noteCall[1][2]).toBe('Called prospect. Sent email dynamically.');
  });
});
