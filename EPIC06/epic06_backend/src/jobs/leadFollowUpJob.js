// ==========================================================================
// ACADENO LMS — BDA Lead Follow-Up Reminder Job (US-NOT-04)
// ==========================================================================
// Runs daily at 08:00 AM via node-cron.
// Identifies leads due for follow-up today (Primary) or 3 days ago (Secondary).
// Sends email and in-app notifications to the assigned BDA.
// ==========================================================================

const cron         = require('node-cron');
const { pool }     = require('../db/index');
const emailService = require('../services/emailService');
const { createNotification, NOTIFICATION_TYPES } = require('../utils/notificationHelper');

// ---------------------------------------------------------------------------
// Constants (Zero Magic Values Rule)
// ---------------------------------------------------------------------------
const STR_CRON_SCHEDULE          = '0 8 * * *';          // Daily at 08:00 AM
const STR_ROLE_SUPER_ADMIN       = 'super_admin';
const STR_FRONTEND_URL           = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Executes the lead follow-up check.
 */
async function processLeadFollowUpReminders() {
    console.log('[LEAD FOLLOW-UP JOB] Starting daily scan...');
    const client = await pool.connect();

    try {
        await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

        // Query both primary and secondary reminders in one go
        const objResult = await client.query(`
            SELECT 
                l.id,
                l.full_name as lead_name,
                l.follow_up_date,
                l.last_activity_at,
                u.id as bda_user_id,
                u.email as bda_email,
                (CURRENT_DATE - l.last_activity_at::date) as days_since_contact,
                (
                    SELECT note_text 
                    FROM lead_notes 
                    WHERE lead_id = l.id 
                    ORDER BY created_at DESC 
                    LIMIT 1
                ) as last_note,
                CASE 
                    WHEN l.follow_up_date = CURRENT_DATE THEN 'primary'
                    WHEN l.follow_up_date = CURRENT_DATE - INTERVAL '3 days' THEN 'escalation'
                    ELSE 'none'
                END as reminder_type
            FROM leads l
            JOIN users u ON l.bda_id = u.id
            WHERE 
                (l.follow_up_date = CURRENT_DATE)
                OR (
                    l.follow_up_date = CURRENT_DATE - INTERVAL '3 days'
                    AND NOT EXISTS (
                        SELECT 1 FROM lead_notes ln 
                        WHERE ln.lead_id = l.id 
                        AND ln.created_at::date > l.follow_up_date
                    )
                )
            AND l.status NOT IN ('converted', 'cold');
        `);

        const arrReminders = objResult.rows;
        console.log(`[LEAD FOLLOW-UP JOB] Found ${arrReminders.length} leads requiring reminders.`);

        for (const lead of arrReminders) {
            const isEscalation = lead.reminder_type === 'escalation';
            const strLeadLink = `${STR_FRONTEND_URL}/bda/leads/${lead.id}`;
            const strTitle = isEscalation ? '🚨 Escalation: Lead Follow-up overdue' : '📅 Reminder: Lead Follow-up due';
            const strBody = `Follow up with ${lead.lead_name}. Last note: "${lead.last_note || 'N/A'}". Days since contact: ${lead.days_since_contact}.`;

            // 1. In-App Notification
            await createNotification(
                lead.bda_user_id,
                NOTIFICATION_TYPES.LEAD_FOLLOW_UP,
                strTitle,
                strBody,
                lead.id
            ).catch(err => console.error(`Failed to create notification for BDA ${lead.bda_email}:`, err.message));

            // 2. Email Notification
            await emailService.sendFollowUpReminderEmail(
                lead.bda_email,
                lead.bda_name || lead.bda_email.split('@')[0],
                {
                    leadName: lead.lead_name,
                    lastNote: lead.last_note,
                    daysSinceContact: lead.days_since_contact,
                    leadLink: strLeadLink,
                    isEscalation: isEscalation
                }
            ).catch(err => console.error(`Failed to email BDA ${lead.bda_email}:`, err.message));
        }

        console.log('[LEAD FOLLOW-UP JOB] All reminders processed successfully.');

    } catch (err) {
        console.error('[LEAD FOLLOW-UP JOB] Critical failure:', err.message);
    } finally {
        client.release();
    }
}

/**
 * Initializes the daily cron job.
 */
function startLeadFollowUpJob() {
    cron.schedule(STR_CRON_SCHEDULE, () => {
        processLeadFollowUpReminders();
    });
    console.log(`✅ Lead Follow-Up Reminder Job registered: ${STR_CRON_SCHEDULE}`);
}

module.exports = { startLeadFollowUpJob, processLeadFollowUpReminders };
