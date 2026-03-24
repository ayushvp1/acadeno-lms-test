// ==========================================================================
// ACADENO LMS — Admin Settings Tests (US-HR-06)
// ==========================================================================

const request = require('supertest');
const express = require('express');
const { pool } = require('../db/index');

jest.mock('../db/index', () => ({
  pool: { connect: jest.fn() },
}));

jest.mock('../utils/jwt', () => ({
  verifyAccessToken: jest.fn(() => ({
    user_id: 'admin-user-uuid-0001',
    role:    'super_admin',
    email:   'admin@acadeno.com',
  })),
}));

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

const bcrypt = require('bcrypt');
const adminRoutes = require('../routes/admin');
const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

let mockClient;
const TOKEN = 'Bearer test-token';

const fakeSettings = [
  { key: 'gst_rate',                value: '18',         is_sensitive: false, description: 'GST rate' },
  { key: 'razorpay_webhook_secret', value: '••••••••',   is_sensitive: true,  description: 'Razorpay secret' },
];

beforeEach(() => {
  mockClient = { query: jest.fn(), release: jest.fn() };
  pool.connect.mockResolvedValue(mockClient);
  jest.clearAllMocks();
});

describe('GET /api/admin/settings — List Settings (US-HR-06)', () => {
  test('Returns settings with sensitive values masked', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: fakeSettings });

    const res = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.settings).toHaveLength(2);
    const sensitive = res.body.settings.find(s => s.key === 'razorpay_webhook_secret');
    expect(sensitive.value).toBe('••••••••');
  });
});

describe('PATCH /api/admin/settings/:key — Update Setting (US-HR-06)', () => {
  test('Updates non-sensitive key successfully', async () => {
    const updatedSetting = { key: 'gst_rate', value: '20', is_sensitive: false };
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ key: 'gst_rate', is_sensitive: false }] }) // fetch setting
      .mockResolvedValueOnce({ rows: [updatedSetting] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await request(app)
      .patch('/api/admin/settings/gst_rate')
      .set('Authorization', TOKEN)
      .send({ value: '20' });

    expect(res.status).toBe(200);
    expect(res.body.setting.value).toBe('20');
  });

  test('Update sensitive key without password returns 400', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ key: 'razorpay_webhook_secret', is_sensitive: true }] }); // fetch setting — sensitive

    const res = await request(app)
      .patch('/api/admin/settings/razorpay_webhook_secret')
      .set('Authorization', TOKEN)
      .send({ value: 'new-secret' }); // no current_password

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/current_password is required/);
  });

  test('Update sensitive key with wrong password returns 401', async () => {
    bcrypt.compare.mockResolvedValue(false);

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ key: 'razorpay_webhook_secret', is_sensitive: true }] })
      .mockResolvedValueOnce({ rows: [{ password_hash: '$2b$12$hash' }] }); // user

    const res = await request(app)
      .patch('/api/admin/settings/razorpay_webhook_secret')
      .set('Authorization', TOKEN)
      .send({ value: 'new-secret', current_password: 'wrongpass' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Incorrect password/);
  });

  test('Missing value returns 400', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .patch('/api/admin/settings/gst_rate')
      .set('Authorization', TOKEN)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/value is required/);
  });

  test('Non-existent key returns 404', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }); // setting not found

    const res = await request(app)
      .patch('/api/admin/settings/non_existent_key')
      .set('Authorization', TOKEN)
      .send({ value: 'test' });

    expect(res.status).toBe(404);
  });
});
