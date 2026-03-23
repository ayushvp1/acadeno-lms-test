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
