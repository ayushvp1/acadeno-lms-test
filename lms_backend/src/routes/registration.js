// ==========================================================================
// ACADENO LMS — Registration Routes
// ==========================================================================
// Mounts all /registration/* endpoints.
// ==========================================================================

const express = require('express');
const router  = express.Router();

const {
  createDraft,
  updatePersonal,
  updateAddress,
  updateAcademic,
  updateCourse,
  submitRegistration,
  listRegistrations,
  getRegistration,
  editRegistration,
} = require('../controllers/registrationController');

const authenticate = require('../middleware/authenticate');
const requireRole  = require('../middleware/rbac');
const { uploadProfilePhoto, uploadMarksheet } = require('../services/fileService');

// All registration routes require authentication + HR/BDA/super_admin role
const authAndRole = [authenticate, requireRole('hr', 'bda', 'super_admin')];

// ---- Draft Step Routes ----

// POST /registration/draft — Create draft with personal details (US-REG-01)
router.post('/draft', ...authAndRole, uploadProfilePhoto, createDraft);

// PUT /registration/draft/:id/personal — Update personal details (US-REG-01 edit)
router.put('/draft/:id/personal', ...authAndRole, uploadProfilePhoto, updatePersonal);

// PUT /registration/draft/:id/address — Update address + identity docs (US-REG-02)
router.put('/draft/:id/address', ...authAndRole, updateAddress);

// PUT /registration/draft/:id/academic — Update academic details (US-REG-03)
router.put('/draft/:id/academic', ...authAndRole, uploadMarksheet, updateAcademic);

// PUT /registration/draft/:id/course — Select course + batch (US-REG-04)
router.put('/draft/:id/course', ...authAndRole, updateCourse);

// POST /registration/draft/:id/submit — Final submit (US-REG-05/07)
router.post('/draft/:id/submit', ...authAndRole, submitRegistration);

// ---- List / View / Edit Routes ----

// GET /registration — List all registrations (US-REG-08)
router.get('/', ...authAndRole, listRegistrations);

// GET /registration/:id — Get single registration (US-REG-08)
router.get('/:id', ...authAndRole, getRegistration);

// PUT /registration/:id — Edit pending_payment registration (US-REG-08)
router.put('/:id', ...authAndRole, editRegistration);

module.exports = router;
