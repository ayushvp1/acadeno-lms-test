// ==========================================================================
// ACADENO LMS — Batch Start Reminder Job (US-NOT-05)
// ==========================================================================
// Runs daily at 09:15 AM via node-cron.
// Identifies batches starting in exactly 48 hours.
// Sends email and in-app notifications to trainers and enrolled students.
// ==========================================================================

const cron         = require('node-cron');
const { pool }     = require('../db/index');
const emailService = require('../services/emailService');
const { createNotification, NOTIFICATION_TYPES } = require('../utils/notificationHelper');

// ---------------------------------------------------------------------------
// Constants (Zero Magic Values Rule)
// ---------------------------------------------------------------------------
const STR_CRON_SCHEDULE          = '15 9 * * *';          // Daily at 09:15 AM
const STR_ROLE_SUPER_ADMIN       = 'super_admin';

/**
 * Executes the batch start check.
 */
async function processBatchStartReminders() {
    console.log('[BATCH START JOB] Starting 48h lead-time scan...');
    const client = await pool.connect();

    try {
        await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

        // 1. Find batches starting in 2 days
        const objResult = await client.query(`
            SELECT 
                b.id as batch_id,
                b.name as batch_name,
                b.start_date,
                b.class_time_start,
                b.schedule_type,
                b.class_days,
                b.meeting_url,
                c.name as course_name,
                u.id as trainer_user_id,
                u.email as trainer_email,
                u.full_name as trainer_name
            FROM batches b
            JOIN courses c ON b.course_id = c.id
            LEFT JOIN users u ON b.trainer_id = u.id
            WHERE b.start_date = CURRENT_DATE + INTERVAL '2 days'
              AND b.is_active = TRUE;
        `);

        const arrBatches = objResult.rows;
        console.log(`[BATCH START JOB] Found ${arrBatches.length} batches starting in 48 hours.`);

        for (const batch of arrBatches) {
            // Handle class_days whether it's JSONB array or string
            const strDays = Array.isArray(batch.class_days) ? batch.class_days.join(', ') : (batch.class_days || 'N/A');
            const strSchedule = `${batch.schedule_type || 'Regular'} (${strDays})`;
            const objBatchInfo = {
                batchName: batch.batch_name,
                courseName: batch.course_name,
                startDate: batch.start_date.toISOString().split('T')[0],
                startTime: batch.class_time_start,
                schedule: strSchedule,
                meetingUrl: batch.meeting_url
            };

            // --- 2. Notify Trainer ---
            if (batch.trainer_user_id) {
                const strTitle = `📅 Upcoming: Batch "${batch.batch_name}" starts in 48h`;
                const strBody = `Your course "${batch.course_name}" begins on ${objBatchInfo.startDate} at ${batch.class_time_start || 'scheduled time'}.`;

                await createNotification(
                    batch.trainer_user_id,
                    NOTIFICATION_TYPES.BATCH_START,
                    strTitle,
                    strBody,
                    batch.batch_id
                ).catch(err => console.error(`Failed to notify trainer ${batch.trainer_email}:`, err.message));

                await emailService.sendBatchStartReminderEmail(
                    batch.trainer_email,
                    batch.trainer_name || batch.trainer_email.split('@')[0],
                    objBatchInfo
                ).catch(err => console.error(`Failed to email trainer ${batch.trainer_email}:`, err.message));
            }

            // --- 3. Notify Students ---
            const objStudentsResult = await client.query(`
                SELECT 
                    u.id as user_id,
                    u.email,
                    s.first_name as student_name
                FROM enrollments e
                JOIN students s ON e.student_id = s.id
                JOIN users u ON s.user_id = u.id
                WHERE e.batch_id = $1
            `, [batch.batch_id]);

            for (const student of objStudentsResult.rows) {
                const strTitle = `🚀 Get Ready: "${batch.course_name}" starts in 2 days!`;
                const strBody = `Your batch "${batch.batch_name}" starts on ${objBatchInfo.startDate}. See you in class!`;

                await createNotification(
                    student.user_id,
                    NOTIFICATION_TYPES.BATCH_START,
                    strTitle,
                    strBody,
                    batch.batch_id
                ).catch(err => console.error(`Failed to notify student ${student.email}:`, err.message));

                await emailService.sendBatchStartReminderEmail(
                    student.email,
                    student.student_name || student.email.split('@')[0],
                    objBatchInfo
                ).catch(err => console.error(`Failed to email student ${student.email}:`, err.message));
            }
        }

        console.log('[BATCH START JOB] All reminders processed successfully.');

    } catch (err) {
        console.error('[BATCH START JOB] Critical failure:', err.message);
    } finally {
        client.release();
    }
}

/**
 * Initializes the daily cron job.
 */
function startBatchStartJob() {
    cron.schedule(STR_CRON_SCHEDULE, () => {
        processBatchStartReminders();
    });
    console.log(`✅ Batch Start Reminder Job registered: ${STR_CRON_SCHEDULE}`);
}

module.exports = { startBatchStartJob, processBatchStartReminders };
