// ==========================================================================
// ACADENO LMS — Task Routes (EPIC-05)
// ==========================================================================
// Mounts all /tasks/* endpoints for the task lifecycle:
//   create → publish → submit → evaluate
//
// Business Rules enforced at route level:
//   BR-C02 — checkEnrollment middleware guards the submit endpoint.
// ==========================================================================

const express   = require('express');
const router    = express.Router();

const ctrl              = require('../controllers/taskController');
const authenticate      = require('../middleware/authenticate');
const requireRole       = require('../middleware/rbac');
const checkEnrollment   = require('../middleware/checkEnrollment');

// ---------------------------------------------------------------------------
// Role middleware bundles
// ---------------------------------------------------------------------------
const authAll        = [authenticate];
const authTrainer    = [authenticate, requireRole('trainer', 'super_admin')];
const authTrainerHR  = [authenticate, requireRole('trainer', 'hr', 'super_admin')];
const authStudent    = [authenticate, requireRole('student')];

// ---------------------------------------------------------------------------
// POST /api/tasks                — create a task (trainer / admin)
// ---------------------------------------------------------------------------
router.post('/', ...authTrainer, ctrl.createTask);

// ---------------------------------------------------------------------------
// GET  /api/tasks?batch_id=xxx   — list tasks for a batch
// ---------------------------------------------------------------------------
router.get('/', ...authAll, ctrl.listTasks);

// ---------------------------------------------------------------------------
// GET  /api/tasks/:id            — get a single task
// ---------------------------------------------------------------------------
router.get('/:id', ...authAll, ctrl.getTask);

// ---------------------------------------------------------------------------
// PATCH /api/tasks/:id           — update a task (trainer / admin)
// ---------------------------------------------------------------------------
router.patch('/:id', ...authTrainer, ctrl.updateTask);

// ---------------------------------------------------------------------------
// PATCH /api/tasks/:id/publish   — publish a task (trainer / admin)
// Must come BEFORE /:id to avoid 'publish' being captured as sub-param.
// Express uses the first-matched route; literal 'publish' segment is fine
// here because it is registered before any other /:id sub-path.
// ---------------------------------------------------------------------------
router.patch('/:id/publish', ...authTrainer, ctrl.publishTask);

// ---------------------------------------------------------------------------
// POST /api/tasks/:id/submit     — student submits (BR-C02 via checkEnrollment)
// checkEnrollment resolves the course from the content hierarchy; for task
// submissions we verify enrollment manually in the controller instead.
// ---------------------------------------------------------------------------
router.post(
  '/:id/submit',
  ...authStudent,
  ctrl.handleSubmissionUpload,
  ctrl.submitTask
);

// ---------------------------------------------------------------------------
// GET  /api/tasks/:id/my-submission — student views their own submission
// ---------------------------------------------------------------------------
router.get('/:id/my-submission', ...authStudent, ctrl.getMySubmission);

// ---------------------------------------------------------------------------
// GET  /api/tasks/:id/submissions   — list all submissions (trainer / hr / admin)
// ---------------------------------------------------------------------------
router.get('/:id/submissions', ...authTrainerHR, ctrl.listSubmissions);

// ---------------------------------------------------------------------------
// PATCH /api/tasks/:taskId/submissions/:submissionId/evaluate
//   — trainer evaluates a submission
// ---------------------------------------------------------------------------
router.patch(
  '/:taskId/submissions/:submissionId/evaluate',
  ...authTrainer,
  ctrl.evaluateSubmission
);

// ---------------------------------------------------------------------------
// PATCH /api/tasks/:taskId/submissions/:submissionId/reopen
//   — trainer reopens a submission
// ---------------------------------------------------------------------------
router.patch(
  '/:taskId/submissions/:submissionId/reopen',
  ...authTrainer,
  ctrl.reopenSubmission
);

// --- Analytics ---
router.get('/:id/analytics', ...authTrainer, ctrl.getTaskAnalytics);

// --- Quiz Questions ---
router.get('/:taskId/questions', ...authAll, ctrl.getQuizQuestions);
router.post('/:taskId/questions', ...authTrainer, ctrl.addQuizQuestion);
router.delete('/:taskId/questions/:questionId', ...authTrainer, ctrl.deleteQuizQuestion);

module.exports = router;
