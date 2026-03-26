// ==========================================================================
// ACADENO LMS — Discussion Forum Controller (EPIC-06, US-STU-09)
// ==========================================================================
// Implements module-level discussion forums with strict batch isolation:
//   A student in Batch B1 cannot see Batch B2 posts even for the same course.
//
// Patterns followed (EPIC-01/06 baseline):
//   - pool.connect() + SET app.current_user_role for every query
//   - Hungarian notation for all local variables
//   - Bouncer Pattern: guard checks at the top of each function
//   - Zero magic values: all constants declared at module level
// ==========================================================================

const { pool }                            = require('../db/index');
const emailService                        = require('../services/emailService');
const { createNotification,
         NOTIFICATION_TYPES }             = require('../utils/notificationHelper');

// ---------------------------------------------------------------------------
// Constants (Zero Magic Values Rule)
// ---------------------------------------------------------------------------
const STR_ROLE_SUPER_ADMIN     = 'super_admin';
const STR_ROLE_TRAINER         = 'trainer';
const STR_ENROLLMENT_ACTIVE    = 'active';
const STR_NOTIF_TYPE_REPLY     = 'discussion_reply';

// ---------------------------------------------------------------------------
// _getStudentBatchId(client, strUserId) → string|null
// ---------------------------------------------------------------------------
// Pure helper. Resolves the batch_id from the student's active enrollment.
// Returns null when no active enrollment is found.
// ---------------------------------------------------------------------------
async function _getStudentBatchId(client, strUserId) {
  const objResult = await client.query(
    `SELECT e.batch_id
       FROM enrollments e
       JOIN students    s ON e.student_id = s.id
      WHERE s.user_id = $1
        AND e.status  = $2
      LIMIT 1`,
    [strUserId, STR_ENROLLMENT_ACTIVE]
  );
  return objResult.rows.length > 0 ? objResult.rows[0].batch_id : null;
}

// ---------------------------------------------------------------------------
// getPosts(req, res)
// ---------------------------------------------------------------------------
// GET /api/discussions?module_id=xxx (US-STU-09)
//
// Returns all discussion posts for a module scoped to the requesting user's
// batch (BATCH ISOLATION — students in different batches cannot cross-read).
// Each post includes reply count and author name.
// Ordered by created_at DESC.
//
// Query: ?module_id=<uuid>  (required)
// ---------------------------------------------------------------------------
async function getPosts(req, res) {
  const strModuleId = req.query.module_id;
  const strUserId   = req.user.user_id;

  if (!strModuleId) {
    return res.status(400).json({ error: 'module_id query parameter is required', code: 'MISSING_PARAM' });
  }

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    // Resolve batch_id for batch isolation
    const strBatchId = await _getStudentBatchId(client, strUserId);

    if (!strBatchId) {
      // Trainers / admins without a student enrollment get all posts for the module
      // For strict isolation we return 403 for students with no enrollment
      if (req.user.role === 'student') {
        return res.status(403).json({
          error: 'No active enrollment found for batch isolation',
          code:  'NOT_ENROLLED',
        });
      }
    }

    // Build the WHERE clause depending on whether batch isolation applies
    let strBatchFilter = '';
    const arrParams    = [strModuleId];

    if (strBatchId) {
      strBatchFilter = 'AND dp.batch_id = $2';
      arrParams.push(strBatchId);
    }

    const objPostsResult = await client.query(
      `SELECT
           dp.id,
           dp.title,
           dp.body,
           dp.module_id,
           dp.batch_id,
           dp.author_id,
           dp.created_at,
           u.email        AS author_email,
           COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.email) AS author_name,
           COUNT(dr.id)::int AS reply_count
         FROM discussion_posts dp
         JOIN users            u  ON dp.author_id = u.id
         LEFT JOIN discussion_replies dr ON dr.post_id = dp.id
        WHERE dp.module_id = $1
          ${strBatchFilter}
        GROUP BY dp.id, u.email, u.first_name, u.last_name
        ORDER BY dp.created_at DESC`,
      arrParams
    );

    return res.status(200).json({ posts: objPostsResult.rows });

  } catch (err) {
    console.error('getPosts error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// createPost(req, res)
// ---------------------------------------------------------------------------
// POST /api/discussions (US-STU-09)
// Body: { module_id, title, body }
//
// Inserts a discussion post tagged with the author's batch_id (batch isolation).
// ---------------------------------------------------------------------------
async function createPost(req, res) {
  const strUserId = req.user.user_id;
  const { module_id, title, body } = req.body;

  // Bouncer: validate required fields
  if (!module_id || !module_id.trim()) {
    return res.status(400).json({ error: 'module_id is required', code: 'MISSING_PARAM' });
  }
  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'title is required', code: 'MISSING_PARAM' });
  }
  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'body is required', code: 'MISSING_PARAM' });
  }

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    // Resolve batch_id from active enrollment (batch isolation)
    const strBatchId = await _getStudentBatchId(client, strUserId);

    if (!strBatchId && req.user.role === 'student') {
      return res.status(403).json({
        error: 'No active enrollment found — cannot post to a discussion',
        code:  'NOT_ENROLLED',
      });
    }

    const objInsertResult = await client.query(
      `INSERT INTO discussion_posts
           (module_id, batch_id, author_id, title, body, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id, module_id, batch_id, author_id, title, body, created_at`,
      [module_id.trim(), strBatchId, strUserId, String(title).trim(), String(body).trim()]
    );

    return res.status(201).json({ post: objInsertResult.rows[0] });

  } catch (err) {
    console.error('createPost error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// getReplies(req, res)
// ---------------------------------------------------------------------------
// GET /api/discussions/:postId/replies (US-STU-09)
//
// Returns all replies for a discussion post with author names, ordered ASC.
// ---------------------------------------------------------------------------
async function getReplies(req, res) {
  const strPostId = req.params.postId;

  if (!strPostId) {
    return res.status(400).json({ error: 'postId is required', code: 'MISSING_PARAM' });
  }

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    // Verify the parent post exists
    const objPostCheck = await client.query(
      `SELECT id FROM discussion_posts WHERE id = $1`,
      [strPostId]
    );

    if (objPostCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Discussion post not found', code: 'NOT_FOUND' });
    }

    const objRepliesResult = await client.query(
      `SELECT
           dr.id,
           dr.post_id,
           dr.author_id,
           dr.body,
           dr.created_at,
           COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.email) AS author_name,
           u.email AS author_email
         FROM discussion_replies dr
         JOIN users              u ON dr.author_id = u.id
        WHERE dr.post_id = $1
        ORDER BY dr.created_at ASC`,
      [strPostId]
    );

    return res.status(200).json({ replies: objRepliesResult.rows });

  } catch (err) {
    console.error('getReplies error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// createReply(req, res)
// ---------------------------------------------------------------------------
// POST /api/discussions/:postId/replies (US-STU-09)
// Body: { body }
//
// Inserts a reply. If the author is a trainer:
//   1. Inserts an in-app notification for the post author (Prompt I table).
//   2. Sends a discussion reply email to the post author.
// ---------------------------------------------------------------------------
async function createReply(req, res) {
  const strPostId  = req.params.postId;
  const strUserId  = req.user.user_id;
  const strRole    = req.user.role;
  const { body }   = req.body;

  // Bouncer
  if (!strPostId) {
    return res.status(400).json({ error: 'postId is required', code: 'MISSING_PARAM' });
  }
  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'body is required', code: 'MISSING_PARAM' });
  }

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    // ---- 1. Verify post exists and fetch author info ----
    const objPostResult = await client.query(
      `SELECT dp.id, dp.title, dp.author_id,
              u.email       AS author_email,
              COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.email) AS author_name
         FROM discussion_posts dp
         JOIN users            u ON dp.author_id = u.id
        WHERE dp.id = $1`,
      [strPostId]
    );

    if (objPostResult.rows.length === 0) {
      return res.status(404).json({ error: 'Discussion post not found', code: 'NOT_FOUND' });
    }

    const objPost = objPostResult.rows[0];

    // ---- 2. Insert reply ----
    const objReplyResult = await client.query(
      `INSERT INTO discussion_replies
           (post_id, author_id, body, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id, post_id, author_id, body, created_at`,
      [strPostId, strUserId, String(body).trim()]
    );

    const objReply = objReplyResult.rows[0];

    // ---- 3. Trainer reply → in-app notification + email ----
    if (strRole === STR_ROLE_TRAINER || strRole === STR_ROLE_SUPER_ADMIN) {
      // In-app notification via centralised helper (US-STU-09, Prompt I)
      try {
        await createNotification(
          objPost.author_id,
          NOTIFICATION_TYPES.DISCUSSION_REPLY,
          'Trainer replied to your post',
          `Your discussion post "${objPost.title}" received a reply from your trainer.`,
          strPostId
        );
      } catch (notifErr) {
        // Notification failure must never block the reply response
        console.error('createReply: notification insert failed:', notifErr.message);
      }

      // Email notification to post author
      try {
        await emailService.sendDiscussionReplyEmail(
          objPost.author_email,
          objPost.author_name,
          objPost.title,
          String(body).trim()
        );
      } catch (emailErr) {
        // Email failure must never block the reply response
        console.error('createReply: email send failed:', emailErr.message);
      }
    }

    return res.status(201).json({ reply: objReply });

  } catch (err) {
    console.error('createReply error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

module.exports = {
  getPosts,
  createPost,
  getReplies,
  createReply,
};
