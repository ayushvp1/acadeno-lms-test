// ==========================================================================
// ACADENO LMS — Content Routes (EPIC-05)
// ==========================================================================
// Mounts content-item-specific endpoints that are identified by content id
// alone (not nested under the full course/module/sub-module hierarchy).
//
// These are distinct from the creation endpoints which live under:
//   /courses/:id/modules/:modId/sub-modules/:subModId/content
//
// Business Rules enforced at route level:
//   BR-C02 — checkEnrollment middleware guards the URL-generation endpoint
//             so only enrolled students (or staff) can fetch content URLs.
// ==========================================================================

const express   = require('express');
const router    = express.Router();

const ctrl              = require('../controllers/courseController');
const authenticate      = require('../middleware/authenticate');
const requireRole       = require('../middleware/rbac');
const checkEnrollment   = require('../middleware/checkEnrollment');

// ---------------------------------------------------------------------------
// Role middleware bundles
// ---------------------------------------------------------------------------
const authAll     = [authenticate];
const authTrainer = [authenticate, requireRole('trainer', 'super_admin')];

// ---------------------------------------------------------------------------
// GET /api/content/:contentId/url
//   — Generate a pre-signed / direct URL for a content file.
//   — BR-C02: checkEnrollment ensures student is enrolled before serving URL.
// ---------------------------------------------------------------------------
router.get(
  '/:contentId/url',
  authenticate,
  checkEnrollment,
  ctrl.getContentUrl
);

// ---------------------------------------------------------------------------
// GET /api/content/:contentId/transcode-status
//   — Poll the MediaConvert transcoding status for a video content item.
// ---------------------------------------------------------------------------
router.get(
  '/:contentId/transcode-status',
  ...authAll,
  ctrl.getTranscodeStatus
);

// ---------------------------------------------------------------------------
// PATCH /api/content/:contentId/publish
//   — Publish a content item (draft → published).
//   — Requires trainer or super_admin.
// ---------------------------------------------------------------------------
router.patch(
  '/:contentId/publish',
  ...authTrainer,
  ctrl.publishContent
);

// ---------------------------------------------------------------------------
// PATCH /api/content/:contentId/unpublish
//   — Unpublish a content item (published → draft).
//   — Requires trainer or super_admin.
// ---------------------------------------------------------------------------
router.patch(
  '/:contentId/unpublish',
  ...authTrainer,
  ctrl.unpublishContent
);

module.exports = router;
