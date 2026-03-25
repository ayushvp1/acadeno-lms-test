const cron = require('node-cron');
const { pool } = require('../db/index');
const emailService = require('../services/emailService');
const { startLeadJobs } = require('../jobs/leadArchiveJob');

// ---------------------------------------------------------------------------
// Jest Setup for Lead Jobs (US-BDA-07)
// ---------------------------------------------------------------------------

jest.mock('node-cron', () => ({
  schedule: jest.fn()
}));

jest.mock('../db/index', () => ({
  pool: {
    connect: jest.fn()
  }
}));

jest.mock('../services/emailService', () => ({
  sendLeadArchiveEmail: jest.fn(),
  sendFollowUpReminderEmail: jest.fn()
}));

describe('Lead Management Jobs - Auto-Archive & Reminders', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };
    pool.connect.mockResolvedValue(mockClient);
    process.env.CRON_SCHEDULE = '0 9 * * *';
    console.log = jest.fn();
    console.error = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('archiveInactiveLeads: processes inactive leads, updates status, and notifies BDA', async () => {
    // 1. Mock finding one inactive lead
    mockClient.query.mockResolvedValueOnce({
      rows: [{
        id: 'lead-001',
        full_name: 'Inactive Lead',
        last_activity_at: new Date('2023-01-01'),
        bda_id: 'bda-123',
        bda_email: 'bda@acadeno.com',
        status: 'new'
      }]
    });

    // 2. Mock individual transaction steps
    mockClient.query.mockResolvedValueOnce({}); // BEGIN
    mockClient.query.mockResolvedValueOnce({}); // UPDATE status
    mockClient.query.mockResolvedValueOnce({}); // INSERT history
    mockClient.query.mockResolvedValueOnce({}); // COMMIT

    // Manually trigger the internal function (since we want to test logic)
    // In a real scenario, we'd export it or trigger the cron callback.
    // For this test, I'll re-require or use a trick. 
    // Actually, I'll extract the function or use the startLeadJobs call to get the callback.
    
    startLeadJobs();
    const cronCallback = cron.schedule.mock.calls[0][1];
    await cronCallback();

    // Verify Archive logic
    expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("last_activity_at < NOW() - INTERVAL '90 days'"));
    expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE leads SET status = 'cold'"), ['lead-001']);
    expect(emailService.sendLeadArchiveEmail).toHaveBeenCalledWith('bda@acadeno.com', 'Inactive Lead', '2023-01-01');
  });

  test('sendFollowUpReminders: notifies BDAs of current day follow-ups', async () => {
    // 1. Mock finding one follow-up for today
    // We'll skip the archive query by returning empty
    mockClient.query.mockResolvedValueOnce({ rows: [] }); 
    
    // 2. Mock follow-up reminder query
    const today = new Date();
    mockClient.query.mockResolvedValueOnce({
      rows: [{
        id: 'lead-002',
        full_name: 'FollowUp Lead',
        follow_up_date: today,
        bda_id: 'bda-123',
        bda_email: 'bda@acadeno.com',
        last_note: 'Call them back'
      }]
    });

    startLeadJobs();
    const cronCallback = cron.schedule.mock.calls[0][1];
    await cronCallback();

    expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining("follow_up_date = CURRENT_DATE"));
    expect(emailService.sendFollowUpReminderEmail).toHaveBeenCalledWith(
      'bda@acadeno.com',
      'FollowUp Lead',
      'Call them back',
      today.toISOString().split('T')[0],
      expect.stringContaining('/leads/lead-002')
    );
  });

  test('Schedules the job with the correct cron pattern', () => {
    startLeadJobs();
    expect(cron.schedule).toHaveBeenCalledWith('0 9 * * *', expect.any(Function));
  });
});
