// ===========================================================================
// ACADENO LMS — Analytics & Stats Routes (EPIC-05)
// ===========================================================================
const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const authenticate = require('../middleware/authenticate');
const requireRole = require('../middleware/rbac');

const STAFF_ROLES = ['trainer', 'hr', 'super_admin'];
const ADMIN_ROLES = ['hr', 'super_admin'];

/**
 * GET /api/analytics/global
 * Returns global LMS stats (HR/Admin only)
 */
router.get('/global', 
    authenticate, 
    requireRole(...ADMIN_ROLES), 
    analyticsController.getGlobalStats
);

/**
 * GET /api/analytics/batches/:batchId
 * Returns batch-wide student performance metrics (Staff)
 */
router.get('/batches/:batchId', 
    authenticate, 
    requireRole(...STAFF_ROLES), 
    analyticsController.getBatchAnalytics
);

/**
 * GET /api/analytics/students/:studentId
 * Returns individual student stats and trends (Staff)
 */
router.get('/students/:studentId', 
    authenticate, 
    requireRole(...STAFF_ROLES), 
    analyticsController.getStudentStats
);

module.exports = router;
