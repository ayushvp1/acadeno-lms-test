<<<<<<< HEAD
// ==========================================================================
// ACADENO LMS — Courses Routes
// ==========================================================================
// Mounts all /courses/* endpoints for the registration wizard.
// ==========================================================================

const express = require('express');
const router  = express.Router();

const { listCourses, listBatches } = require('../controllers/coursesController');
const authenticate = require('../middleware/authenticate');
const requireRole  = require('../middleware/rbac');

const authAndRole = [authenticate, requireRole('hr', 'bda', 'super_admin')];

// GET /courses — List active courses (US-REG-04)
router.get('/', ...authAndRole, listCourses);

// GET /courses/:id/batches — List batches for a course (US-REG-04)
router.get('/:id/batches', ...authAndRole, listBatches);

module.exports = router;

// EPIC-08: Trainer Pool endpoints (US-HR-04)
const {
  listTrainerPool,
  addTrainerToPool,
  removeTrainerFromPool,
} = require('../controllers/batchController');

router.get   ('/:courseId/trainer-pool',              ...authAndRole, listTrainerPool);
router.post  ('/:courseId/trainer-pool',              ...authAndRole, addTrainerToPool);
router.delete('/:courseId/trainer-pool/:trainerId',   ...authAndRole, removeTrainerFromPool);
=======
// ==========================================================================
// ACADENO LMS — Courses Routes (EPIC-05)
// ==========================================================================
// Mounts all /courses/* endpoints.
//
// EPIC-03 backward-compat routes (listCourses, listBatches) are preserved
// using the new courseController which provides identical behaviour plus the
// full EPIC-05 surface.
//
// Route ordering follows Express best-practice:
//   • Literal-segment routes (e.g. /batches/:batchId/dashboard) are declared
//     BEFORE param-segment routes (e.g. /:id) to avoid accidental capture.
//   • reorder routes are declared BEFORE /:modId / /:subModId routes.
// ==========================================================================

const express    = require('express');
const router     = express.Router();

const ctrl       = require('../controllers/courseController');
const authenticate      = require('../middleware/authenticate');
const requireRole       = require('../middleware/rbac');
const checkEnrollment   = require('../middleware/checkEnrollment');

// ---------------------------------------------------------------------------
// Role middleware bundles
// ---------------------------------------------------------------------------
const authAll          = [authenticate];
const authAdmin        = [authenticate, requireRole('hr', 'super_admin')];
const authStaff        = [authenticate, requireRole('trainer', 'hr', 'super_admin')];
const authTrainer      = [authenticate, requireRole('trainer', 'super_admin')];
const authTrainerHR    = [authenticate, requireRole('trainer', 'hr', 'super_admin')];

// ===========================================================================
// BATCH-STANDALONE routes
// Must be registered BEFORE /:id so 'batches' is not captured as a course id.
// ===========================================================================

// GET  /api/courses/batches/:batchId/dashboard
router.get(
  '/batches/:batchId/dashboard',
  ...authTrainerHR,
  ctrl.getBatchDashboard
);

// GET  /api/courses/batches/:batchId/students/:studentId
router.get(
  '/batches/:batchId/students/:studentId',
  ...authTrainerHR,
  ctrl.getBatchStudent
);

// POST /api/courses/batches/:batchId/live-sessions
router.post(
  '/batches/:batchId/live-sessions',
  ...authTrainer,
  ctrl.createLiveSession
);

// GET  /api/courses/batches/:batchId/live-sessions
router.get(
  '/batches/:batchId/live-sessions',
  ...authAll,
  ctrl.listLiveSessions
);

// ===========================================================================
// COURSE CRUD
// ===========================================================================

// GET  /api/courses       — list active courses
router.get('/',    ...authAll,  ctrl.listCourses);

// POST /api/courses       — create course (HR / super_admin)
router.post('/',   ...authAdmin, ctrl.createCourse);

// GET  /api/courses/:id
router.get('/:id', ...authAll,  ctrl.getCourse);

// PATCH /api/courses/:id
router.patch('/:id', ...authAdmin, ctrl.updateCourse);

// DELETE /api/courses/:id (soft-deactivate, super_admin only)
router.delete('/:id', authenticate, requireRole('super_admin'), ctrl.deactivateCourse);

// ===========================================================================
// BATCH routes (scoped under a course)
// ===========================================================================

// GET  /api/courses/:id/batches
router.get('/:id/batches', ...authAll, ctrl.listCourseBatches);

// POST /api/courses/:id/batches
router.post('/:id/batches', ...authAdmin, ctrl.createBatch);

// PATCH /api/courses/:id/batches/:batchId
router.patch('/:id/batches/:batchId', ...authAdmin, ctrl.updateBatch);

// ===========================================================================
// MODULE routes
// NOTE: reorderModules uses /reorder path — must be BEFORE /:modId
// ===========================================================================

// GET  /api/courses/:id/modules   (full tree: modules + sub-modules + content)
router.get('/:id/modules', ...authAll, ctrl.listModules);

// POST /api/courses/:id/modules
router.post('/:id/modules', ...authTrainerHR, ctrl.createModule);

// PATCH /api/courses/:id/modules/reorder  ← BEFORE /:modId
router.patch('/:id/modules/reorder', ...authTrainerHR, ctrl.reorderModules);

// PATCH /api/courses/:id/modules/:modId
router.patch('/:id/modules/:modId', ...authTrainerHR, ctrl.updateModule);

// DELETE /api/courses/:id/modules/:modId
router.delete('/:id/modules/:modId', ...authTrainerHR, ctrl.deleteModule);

// ===========================================================================
// SUB-MODULE routes
// NOTE: reorderSubModules uses /reorder path — must be BEFORE /:subModId
// ===========================================================================

// POST  /api/courses/:id/modules/:modId/sub-modules
router.post(
  '/:id/modules/:modId/sub-modules',
  ...authTrainerHR,
  ctrl.createSubModule
);

// PATCH /api/courses/:id/modules/:modId/sub-modules/reorder  ← BEFORE /:subModId
router.patch(
  '/:id/modules/:modId/sub-modules/reorder',
  ...authTrainerHR,
  ctrl.reorderSubModules
);

// PATCH /api/courses/:id/modules/:modId/sub-modules/:subModId
router.patch(
  '/:id/modules/:modId/sub-modules/:subModId',
  ...authTrainerHR,
  ctrl.updateSubModule
);

// ===========================================================================
// CONTENT routes
// ===========================================================================

// GET  /api/courses/:courseId/modules/:moduleId/sub-modules/:subModuleId/content
router.get(
  '/:courseId/modules/:moduleId/sub-modules/:subModuleId/content',
  ...authAll,
  ctrl.listContent
);

// POST /api/courses/:courseId/modules/:moduleId/sub-modules/:subModuleId/content
// Accepts a document file upload (PDF, PPT, DOCX) or external_link metadata
router.post(
  '/:courseId/modules/:moduleId/sub-modules/:subModuleId/content',
  ...authTrainer,
  ctrl.handleDocUpload,
  ctrl.createContent
);

// POST /api/courses/:courseId/modules/:moduleId/sub-modules/:subModuleId/content/:contentId/video
// Uploads an MP4 and triggers HLS transcoding stub
router.post(
  '/:courseId/modules/:moduleId/sub-modules/:subModuleId/content/:contentId/video',
  ...authTrainer,
  ctrl.handleVideoUpload,
  ctrl.uploadVideo
);

module.exports = router;
>>>>>>> origin/main
