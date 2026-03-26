// ==========================================================================
// ACADENO LMS — Live Session Reminder Job (EPIC-05)
// ==========================================================================
// Runs every hour via node-cron.
// Finds live sessions starting within the next 60 minutes that have not yet
// had a reminder sent, then emails all enrolled students in the batch.
//
// Business Rule: Students receive a 1-hour-ahead reminder for live sessions.
//
// CRON SCHEDULE: Every hour at minute 0 ('0 * * * *')
//
// HOW IT WORKS:
//   1. Query live_sessions where:
//        - scheduled_at BETWEEN NOW() + 55min AND NOW() + 65min
//        - reminder_sent = false   (prevents duplicate sends)
//   2. For each session, fetch all active-enrolled students in the batch.
//   3. Send sendLiveSessionReminderEmail to each student.
//   4. Mark live_sessions.reminder_sent = true.
// ==========================================================================

const cron         = require('node-cron');
const { pool }     = require('../db/index');
const emailService = require('../services/emailService');

// ---------------------------------------------------------------------------
// Constants (Zero Magic Values Rule)
// ---------------------------------------------------------------------------
const STR_CRON_SCHEDULE          = '0 * * * *';          // Every hour at :00
const INT_REMINDER_WINDOW_MIN_LO = 55;                    // Lower bound: 55 min ahead
const INT_REMINDER_WINDOW_MIN_HI = 65;                    // Upper bound: 65 min ahead
const STR_ENROLLMENT_STATUS      = 'active';
const STR_FRONTEND_URL           = process.env.FRONTEND_URL || 'http://localhost:5173';

// ---------------------------------------------------------------------------
// _sendRemindersForSession(client, objSession)
// ---------------------------------------------------------------------------
// Business intent: Send reminder emails to all enrolled students for a single
// live session and mark the session as reminded.
//
// Side effects: Sends emails, updates live_sessions.reminder_sent in Postgres.
// ---------------------------------------------------------------------------
async function _sendRemindersForSession(client, objSession) {
  // Fetch all active students enrolled in this session's batch
  const objStudents = await client.query(
    `SELECT u.email, u.name
       FROM enrollments  e
       JOIN students     s ON e.student_id = s.id
       JOIN users        u ON s.user_id    = u.id
      WHERE e.batch_id = $1
        AND e.status   = $2`,
    [objSession.batch_id, STR_ENROLLMENT_STATUS]
  );

  const strStartTime = new Date(objSession.scheduled_at).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const strJoinUrl = objSession.meeting_url || `${STR_FRONTEND_URL}/live`;

  // Send reminder to each enrolled student
  for (const objStudent of objStudents.rows) {
    try {
      await emailService.sendLiveSessionReminderEmail(
        objStudent.email,
        objStudent.name,
        objSession.title,
        objSession.course_name,
        strStartTime,
        strJoinUrl
      );
    } catch (errEmail) {
      // Log but do not abort the loop — partial delivery is better than none
      console.error(
        `[LiveSessionReminder] Failed to email ${objStudent.email} for session ${objSession.id}:`,
        errEmail.message
      );
    }
  }

  // Mark session as reminded so this job does not re-send
  await client.query(
    `UPDATE live_sessions
        SET reminder_sent = true,
            updated_at    = NOW()
      WHERE id = $1`,
    [objSession.id]
  );

  console.log(
    `[LiveSessionReminder] Sent ${objStudents.rows.length} reminder(s) for session "${objSession.title}" (${objSession.id})`
  );
}

// ---------------------------------------------------------------------------
// runLiveSessionReminderJob()
// ---------------------------------------------------------------------------
// Business intent: Main job handler — finds upcoming sessions in the reminder
// window and dispatches emails.
//
// Called by the cron scheduler and also exported for manual invocation.
// ---------------------------------------------------------------------------
async function runLiveSessionReminderJob() {
  const client = await pool.connect();

  try {
    await client.query("SET app.current_user_role = 'super_admin'");

    // Find sessions starting in the 55–65 min window that haven't been reminded
    const objSessions = await client.query(
      `SELECT ls.id,
              ls.title,
              ls.batch_id,
              ls.scheduled_at,
              ls.meeting_url,
              c.name AS course_name
         FROM live_sessions ls
         JOIN batches       b ON ls.batch_id  = b.id
         JOIN courses       c ON b.course_id  = c.id
        WHERE ls.scheduled_at >= NOW() + INTERVAL '${INT_REMINDER_WINDOW_MIN_LO} minutes'
          AND ls.scheduled_at <= NOW() + INTERVAL '${INT_REMINDER_WINDOW_MIN_HI} minutes'
          AND ls.reminder_sent = false`
    );

    if (objSessions.rows.length === 0) {
      return;   // Nothing to do this tick
    }

    console.log(`[LiveSessionReminder] Found ${objSessions.rows.length} session(s) to remind.`);

    for (const objSession of objSessions.rows) {
      try {
        await _sendRemindersForSession(client, objSession);
      } catch (errSession) {
        console.error(
          `[LiveSessionReminder] Error processing session ${objSession.id}:`,
          errSession.message
        );
      }
    }
  } catch (err) {
    console.error('[LiveSessionReminder] Job error:', err.message);
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// startLiveSessionReminderJob()
// ---------------------------------------------------------------------------
// Business intent: Register the cron task with node-cron.
// Called once from server.js during startup.
// ---------------------------------------------------------------------------
function startLiveSessionReminderJob() {
  cron.schedule(STR_CRON_SCHEDULE, () => {
    console.log('[LiveSessionReminder] Running hourly check...');
    runLiveSessionReminderJob().catch((err) => {
      console.error('[LiveSessionReminder] Unhandled error in cron tick:', err.message);
    });
  });

  console.log('✅ Live Session Reminder Job registered (hourly)');
}

module.exports = { startLiveSessionReminderJob, runLiveSessionReminderJob };
