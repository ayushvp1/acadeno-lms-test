// ==========================================================================
// ACADENO LMS — HR Routes (EPIC-08 Modular)
// ==========================================================================

const express    = require('express');
const router     = express.Router();
const authenticate = require('../../../middleware/authenticate');
const authorize    = require('../../../middleware/authorize');

const {
  listEnrollments,
  getEnrollmentDetail,
  getRegistrationReport,
  exportRegistrationsCSV,
} = require('../controllers/hrController');

const hrAndAbove = [authenticate, authorize('hr')];

router.get('/enrollments',                  ...hrAndAbove, listEnrollments);
router.get('/enrollments/:studentId',       ...hrAndAbove, getEnrollmentDetail);
router.get('/reports/registrations',        ...hrAndAbove, getRegistrationReport);
router.get('/reports/registrations/export', ...hrAndAbove, exportRegistrationsCSV);

module.exports = router;
