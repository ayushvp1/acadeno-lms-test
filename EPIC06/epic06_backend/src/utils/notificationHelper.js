// ==========================================================================
// ACADENO LMS — Notification Helper (EPIC-06 Prompt I)
// ==========================================================================
// createNotification() inserts a single row into the notifications table.
// Called by the discussion reply handler, task evaluation, and certificate
// generation flows so that all notification insertion is centralised here.
//
// Patterns:
//   - pool.connect() + SET app.current_user_role (EPIC-01/06 baseline)
//   - Hungarian notation for all local variables
//   - Failures are logged but do NOT bubble — callers must not block on notifs
// ==========================================================================

const { pool } = require('../db/index');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STR_ROLE_SUPER_ADMIN = 'super_admin';

// Allowed notification types (match column constraint)
const NOTIFICATION_TYPES = Object.freeze({
  DISCUSSION_REPLY:  'discussion_reply',
  TASK_EVALUATED:    'task_evaluated',
  CERTIFICATE_READY: 'certificate_ready',
});

// ---------------------------------------------------------------------------
// createNotification(userId, type, title, body, referenceId?)
// ---------------------------------------------------------------------------
// Inserts one notification row for the given user.
//
// Parameters:
//   userId      — UUID of the recipient (users.id)
//   type        — One of: 'discussion_reply', 'task_evaluated', 'certificate_ready'
//   title       — Short summary shown in the bell-icon dropdown
//   body        — Full notification message
//   referenceId — Optional UUID linking to the triggering resource
//                 (e.g. postId, taskId, enrollmentId)
//
// Returns: the inserted row { id, user_id, type, title, body, is_read, reference_id, created_at }
// Throws:  re-throws DB errors so callers can decide to swallow or propagate.
// ---------------------------------------------------------------------------
async function createNotification(userId, type, title, body, referenceId = null) {
  if (!userId)  throw new Error('createNotification: userId is required');
  if (!type)    throw new Error('createNotification: type is required');
  if (!title)   throw new Error('createNotification: title is required');
  if (!body)    throw new Error('createNotification: body is required');

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    const objResult = await client.query(
      `INSERT INTO notifications
           (user_id, type, title, body, reference_id, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, FALSE, NOW())
         RETURNING id, user_id, type, title, body, is_read, reference_id, created_at`,
      [userId, type, title, body, referenceId]
    );

    return objResult.rows[0];

  } finally {
    client.release();
  }
}

module.exports = {
  createNotification,
  NOTIFICATION_TYPES,
};
