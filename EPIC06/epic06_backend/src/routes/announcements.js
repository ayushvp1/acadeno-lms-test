// =========================================================================
// ACADENO LMS — Announcements Routes (US-TR-03)
// =========================================================================

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/announcementController');
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');

/**
 * POST /api/announcements
 * Post a new announcement (Trainer/Admin)
 */
router.post('/', authenticate, authorize(['trainer', 'hr', 'super_admin']), ctrl.createAnnouncement);

/**
 * GET /api/announcements/batch/:batchId
 * List announcements for a batch (Trainer/Admin/Student)
 */
router.get('/batch/:batchId', authenticate, ctrl.listAnnouncements);

/**
 * DELETE /api/announcements/:id
 * Remove an announcement (Trainer/Admin)
 */
router.delete('/:id', authenticate, authorize(['trainer', 'hr', 'super_admin']), ctrl.deleteAnnouncement);

module.exports = router;
