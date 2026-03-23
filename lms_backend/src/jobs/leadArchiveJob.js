const cron = require('node-cron');
const { pool } = require('../db/index');
const emailService = require('../services/emailService');

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 9 * * *';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * JOB 1: Auto-Archive to Cold (90 days of inactivity)
 */
async function archiveInactiveLeads() {
  const client = await pool.connect();
  try {
    // 1. Find leads with no activity for 90 days
    const query = `
      SELECT l.id, l.full_name, l.last_activity_at, l.bda_id, u.email as bda_email, l.status
      FROM leads l
      JOIN users u ON l.bda_id = u.id
      WHERE l.last_activity_at < NOW() - INTERVAL '90 days'
        AND l.status NOT IN ('converted', 'cold')
    `;
    const res = await client.query(query);
    const leadsToArchive = res.rows;

    for (const lead of leadsToArchive) {
      await client.query('BEGIN');
      try {
        // 2. Update lead status to cold
        await client.query(
          "UPDATE leads SET status = 'cold', last_activity_at = NOW() WHERE id = $1",
          [lead.id]
        );

        // 3. Insert into history
        await client.query(
          "INSERT INTO lead_status_history (lead_id, changed_by, from_status, to_status, reason) VALUES ($1, $2, $3, 'cold', 'Auto-archived due to 90 days of inactivity')",
          [lead.id, lead.bda_id, lead.status]
        );

        await client.query('COMMIT');

        // 4. Send notification email
        await emailService.sendLeadArchiveEmail(
          lead.bda_email,
          lead.full_name,
          lead.last_activity_at.toISOString().split('T')[0]
        );
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Error archiving lead ${lead.id}:`, err.message);
      }
    }

    if (leadsToArchive.length > 0) {
      console.log(`[Job:Archive] Auto-archived ${leadsToArchive.length} leads to Cold status`);
    }
  } catch (err) {
    console.error('[Job:Archive] Error:', err.message);
  } finally {
    client.release();
  }
}

/**
 * JOB 2: Daily Follow-Up Reminders
 */
async function sendFollowUpReminders() {
  const client = await pool.connect();
  try {
    // 1. Find leads with follow_up_date = today
    const query = `
      SELECT l.id, l.full_name, l.follow_up_date, l.bda_id, u.email as bda_email,
             (SELECT note_text FROM lead_notes WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1) as last_note
      FROM leads l
      JOIN users u ON l.bda_id = u.id
      WHERE l.follow_up_date = CURRENT_DATE
        AND l.status NOT IN ('converted', 'cold')
    `;
    const res = await client.query(query);
    const leadsToRemind = res.rows;

    for (const lead of leadsToRemind) {
      const leadLink = `${FRONTEND_URL}/leads/${lead.id}`;
      await emailService.sendFollowUpReminderEmail(
        lead.bda_email,
        lead.full_name,
        lead.last_note,
        lead.follow_up_date.toISOString().split('T')[0],
        leadLink
      );
    }

    if (leadsToRemind.length > 0) {
      console.log(`[Job:Reminder] Sent ${leadsToRemind.length} follow-up reminders`);
    }
  } catch (err) {
    console.error('[Job:Reminder] Error:', err.message);
  } finally {
    client.release();
  }
}

/**
 * Initialization function to register and start all lead management jobs
 */
function startLeadJobs() {
  console.log(`⏰ Cron Job scheduled: ${CRON_SCHEDULE}`);
  
  cron.schedule(CRON_SCHEDULE, async () => {
    console.log('[Cron] Starting Daily Lead Management Jobs...');
    await archiveInactiveLeads();
    await sendFollowUpReminders();
    console.log('[Cron] Daily Lead Management Jobs completed.');
  });
}

module.exports = { startLeadJobs };
