const express   = require('express');
const router    = express.Router();
const authenticate = require('../middleware/authenticate');
const requireRole    = require('../middleware/rbac');
const { listEnrollments, getEnrollmentDetail,
        getRegistrationReport, exportRegistrationsCSV } = require('../controllers/hrController');

const hrAndAbove = [authenticate, requireRole('hr', 'super_admin')];

router.get('/enrollments',                    ...hrAndAbove, listEnrollments);
router.get('/enrollments/:studentId',         ...hrAndAbove, getEnrollmentDetail);
router.get('/reports/registrations',          ...hrAndAbove, getRegistrationReport);
router.get('/reports/registrations/export',   ...hrAndAbove, exportRegistrationsCSV);

module.exports = router;
