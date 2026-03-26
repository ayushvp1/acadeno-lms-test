const request = require('supertest');
const express = require('express');
const { pool } = require('../db/index');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------------------------
// Jest Setup for Lead Import Validation (US-BDA-06)
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

describe('POST /api/leads/import - CSV Bulk Import Logic', () => {
  let mockClient;
  let testToken;

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

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Validates file presence returning 400 if missing', async () => {
    const res = await request(app)
      .post('/api/leads/import')
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No file uploaded');
  });

  test('Successfully imports valid CSV rows and skips duplicates', async () => {
    const csvContent = "name,email,phone,course_interest,source\n" +
                       "John Doe,john@example.com,1234567890,React,Web\n" +
                       "Jane Smith,jane@example.com,0987654321,Node,Referral";
    
    // Setup Mocks
    mockClient.query.mockResolvedValueOnce({}); // SET id
    mockClient.query.mockResolvedValueOnce({}); // SET role
    
    // Row 1: Duplicate check - Not duplicate
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    // Row 2: Duplicate check - Duplicate
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] });

    // Bulk Insert Leads
    mockClient.query.mockResolvedValueOnce({}); // BEGIN
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'new-lead-id' }] }); // INSERT leads
    mockClient.query.mockResolvedValueOnce({}); // INSERT history
    mockClient.query.mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .post('/api/leads/import')
      .set('Authorization', `Bearer ${testToken}`)
      .attach('file', Buffer.from(csvContent), 'leads.csv');

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.skipped.length).toBe(1);
    expect(res.body.skipped[0].email).toBe('jane@example.com');
    expect(res.body.total_rows_processed).toBe(2);
  });

  test('Identifies invalid rows with missing fields or bad formats', async () => {
    const csvContent = "name,email,phone,course_interest,source\n" +
                       ",missing_name@example.com,1234567890,React,Web\n" +
                       "Invalid Email,bad-email,1234567890,Node,Referral\n" +
                       "Invalid Phone,jane@example.com,123,Python,Ads";

    mockClient.query.mockResolvedValueOnce({}); // SET
    mockClient.query.mockResolvedValueOnce({}); // SET

    const res = await request(app)
      .post('/api/leads/import')
      .set('Authorization', `Bearer ${testToken}`)
      .attach('file', Buffer.from(csvContent), 'leads.csv');

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(0);
    expect(res.body.errors.length).toBe(3);
    expect(res.body.errors[0].reason).toBe('Missing required fields');
    expect(res.body.errors[1].reason).toBe('Invalid email format');
    expect(res.body.errors[2].reason).toBe('Phone must be 10 digits');
  });

  test('Processes mixed valid, invalid, and duplicate CSV data correctly', async () => {
    const csvContent = "name,email,phone,course_interest,source\n" +
                       "Valid One,v1@example.com,1112223333,React,Web\n" +
                       "Invalid,inv@example.com,123,Node,Referral\n" +
                       "Duplicate,dup@example.com,9998887777,Python,Ads";

    mockClient.query.mockResolvedValueOnce({}); // SET
    mockClient.query.mockResolvedValueOnce({}); // SET
    
    // Row 1: Not duplicate
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    // Row 3: Duplicate
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'prev' }] });

    mockClient.query.mockResolvedValueOnce({}); // BEGIN
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'new-id' }] }); // Bulk leads
    mockClient.query.mockResolvedValueOnce({}); // Bulk history
    mockClient.query.mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .post('/api/leads/import')
      .set('Authorization', `Bearer ${testToken}`)
      .attach('file', Buffer.from(csvContent), 'leads.csv');

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(1);
    expect(res.body.skipped.length).toBe(1);
    expect(res.body.errors.length).toBe(1);
    expect(res.body.total_rows_processed).toBe(3);
  });
});
