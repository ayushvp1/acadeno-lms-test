// ==========================================================================
// ACADENO LMS — Discussion Forum Routes (EPIC-06, US-STU-09)
// ==========================================================================
// Mounts all /api/discussions/* endpoints for the module discussion forum.
//
// Batch isolation is enforced in the controller layer:
//   Students only see posts from their own batch, even for shared modules.
// ==========================================================================

const express    = require('express');
const router     = express.Router();

const ctrl           = require('../controllers/discussionController');
const authenticate   = require('../middleware/authenticate');
const requireRole    = require('../middleware/rbac');

// ---------------------------------------------------------------------------
// Role middleware bundles (matching patterns from tasks.js)
// ---------------------------------------------------------------------------
const authAll             = [authenticate];
const authStudentTrainer  = [authenticate, requireRole('student', 'trainer', 'super_admin')];

// ---------------------------------------------------------------------------
// GET /api/discussions?module_id=xxx
// Returns all posts for a module scoped to the student's batch.
// ---------------------------------------------------------------------------
router.get('/', ...authAll, ctrl.getPosts);

// ---------------------------------------------------------------------------
// POST /api/discussions
// Body: { module_id, title, body }
// Creates a new discussion post tagged with the author's batch_id.
// ---------------------------------------------------------------------------
router.post('/', ...authStudentTrainer, ctrl.createPost);

// ---------------------------------------------------------------------------
// GET /api/discussions/:postId/replies
// Returns all replies for a post with author names, ordered ASC.
// ---------------------------------------------------------------------------
router.get('/:postId/replies', ...authAll, ctrl.getReplies);

// ---------------------------------------------------------------------------
// POST /api/discussions/:postId/replies
// Body: { body }
// Creates a reply. Trainer replies trigger an in-app notification + email.
// ---------------------------------------------------------------------------
router.post('/:postId/replies', ...authStudentTrainer, ctrl.createReply);

module.exports = router;
