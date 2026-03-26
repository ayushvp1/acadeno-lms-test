// ==========================================================================
// ACADENO LMS — Low Progress Alert Job (US-NOT-03)
// ==========================================================================
// Runs nightly at midnight via node-cron.
// Identifies students with completion < 40% OR 3+ overdue tasks.
// Sends individual emails to students and batch summaries to trainers.
// ==========================================================================

const cron         = require('node-cron');
const { pool }     = require('../db/index');
const emailService = require('../services/emailService');

// ---------------------------------------------------------------------------
// Constants (Zero Magic Values Rule)
// ---------------------------------------------------------------------------
const STR_CRON_SCHEDULE          = '0 0 * * *';          // Daily at midnight
const STR_ENROLLMENT_STATUS      = 'active';
const INT_AT_RISK_OVERDUE_LIMIT  = 3;
const DEC_AT_RISK_PCT_LIMIT      = 0.4;
const STR_ROLE_SUPER_ADMIN       = 'super_admin';

/**
 * Executes the progress alert check.
 * Can be called manually for testing.
 */
async function processProgressAlerts() {
    console.log('[PROGRESS ALERT JOB] Starting nightly scan...');
    const client = await pool.connect();

    try {
        await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

        // Query to find at-risk students
        const objResult = await client.query(`
            WITH TaskStats AS (
                SELECT 
                    e.id AS enrollment_id,
                    e.batch_id,
                    e.student_id AS enrollment_student_id, -- students.id
                    s.user_id AS student_user_id,          -- users.id
                    COUNT(t.id) FILTER (WHERE t.status = 'published') AS total_tasks,
                    COUNT(ts.id) FILTER (WHERE ts.grade = 'pass') AS completed_tasks,
                    COUNT(t.id) FILTER (
                        WHERE t.status = 'published' 
                        AND t.due_date < NOW() 
                        AND (ts.id IS NULL OR ts.grade != 'pass')
                    ) AS overdue_tasks
                FROM enrollments e
                JOIN students s ON e.student_id = s.id
                JOIN tasks t ON e.batch_id = t.batch_id
                LEFT JOIN task_submissions ts ON t.id = ts.task_id AND ts.student_id = s.user_id
                WHERE e.status = $1
                GROUP BY e.id, e.batch_id, e.student_id, s.user_id
            )
            SELECT 
                ts.student_user_id,
                u.email AS student_email,
                s.first_name AS student_name,
                b.id AS batch_id,
                b.name AS batch_name,
                c.name AS course_name,
                tu.email AS trainer_email,
                tu.email AS trainer_name,
                ts.total_tasks,
                ts.completed_tasks,
                ts.overdue_tasks,
                CASE WHEN ts.total_tasks > 0 
                     THEN (ts.completed_tasks::float / ts.total_tasks::float) 
                     ELSE 1.0 
                END AS completion_frac
            FROM TaskStats ts
            JOIN students s ON ts.enrollment_student_id = s.id
            JOIN users u ON ts.student_user_id = u.id
            JOIN batches b ON ts.batch_id = b.id
            JOIN courses c ON b.course_id = c.id
            JOIN users tu ON b.trainer_id = tu.id
            WHERE 
                (ts.total_tasks > 0 AND (ts.completed_tasks::float / ts.total_tasks::float) < $2)
                OR ts.overdue_tasks >= $3;
        `, [STR_ENROLLMENT_STATUS, DEC_AT_RISK_PCT_LIMIT, INT_AT_RISK_OVERDUE_LIMIT]);

        const arrAtRiskStudents = objResult.rows;
        console.log(`[PROGRESS ALERT JOB] Found ${arrAtRiskStudents.length} at-risk students.`);

        if (arrAtRiskStudents.length === 0) return;

        // 1. Send Individual Student Emails
        const studentPromises = arrAtRiskStudents.map(student => {
            return emailService.sendAtRiskStudentEmail(
                student.student_email,
                student.student_name,
                student.course_name,
                {
                    completionPct: Math.round(student.completion_frac * 100),
                    overdueCount: student.overdue_tasks
                }
            ).catch(err => console.error(`Failed to email student ${student.student_email}:`, err.message));
        });
        await Promise.all(studentPromises);

        // 2. Aggregate and Send Trainer Summary Emails
        const mapTrainerBatches = new Map();

        arrAtRiskStudents.forEach(student => {
            const strKey = `${student.trainer_email}|${student.batch_id}`;
            if (!mapTrainerBatches.has(strKey)) {
                mapTrainerBatches.set(strKey, {
                    trainerEmail: student.trainer_email,
                    trainerName: student.trainer_name,
                    batchName: student.batch_name,
                    students: []
                });
            }
            mapTrainerBatches.get(strKey).students.push({
                name: student.student_name,
                completionPct: Math.round(student.completion_frac * 100),
                overdueCount: student.overdue_tasks
            });
        });

        const trainerPromises = Array.from(mapTrainerBatches.values()).map(summary => {
            return emailService.sendAtRiskTrainerSummaryEmail(
                summary.trainerEmail,
                summary.trainerName,
                summary.batchName,
                summary.students
            ).catch(err => console.error(`Failed to email trainer ${summary.trainerEmail}:`, err.message));
        });
        await Promise.all(trainerPromises);

        console.log('[PROGRESS ALERT JOB] All alerts processed successfully.');

    } catch (err) {
        console.error('[PROGRESS ALERT JOB] Critical failure:', err.message);
    } finally {
        client.release();
    }
}

/**
 * Initializes the nightly cron job.
 */
function startProgressAlertJob() {
    cron.schedule(STR_CRON_SCHEDULE, () => {
        processProgressAlerts();
    });
    console.log(`✅ Progress Alert Job registered: ${STR_CRON_SCHEDULE}`);
}

module.exports = { startProgressAlertJob, processProgressAlerts };
