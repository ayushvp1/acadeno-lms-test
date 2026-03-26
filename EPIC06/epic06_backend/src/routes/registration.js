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
  handlePaymentSuccess,
  listCourses,
  listBatches,
  listPinCode,
  updateBatch,
} = require('../controllers/registrationController');

const authenticate = require('../middleware/authenticate');
const requireRole  = require('../middleware/rbac');
const { uploadProfilePhoto, uploadMarksheet } = require('../services/fileService');

// Staff-only: HR, BDA, super_admin — used for list/view/edit management routes
const authStaffOnly = [authenticate, requireRole('hr', 'bda', 'super_admin')];

// Wizard routes: additionally allow lead_registrant (converted leads filling their own form)
const authWizard = [authenticate, requireRole('hr', 'bda', 'super_admin', 'lead_registrant')];

// ---- Public Routes (NO auth — must be defined BEFORE any /:id wildcard) ----
// These are mounted at /api/registration/courses etc.
// IMPORTANT: Express matches routes in order — these specific paths must come
// before the generic /:id route, otherwise /:id catches them with auth middleware.
router.get('/courses', listCourses);
router.get('/courses/:courseId/batches', listBatches);
router.patch('/batches/:id', authenticate, requireRole('super_admin', 'trainer'), updateBatch);
router.get('/pincode/:pin', listPinCode);

// POST /registration/payment-webhook — Webhook for successful payment (no auth)
router.post('/payment-webhook', handlePaymentSuccess);

// ---- Draft Step Routes ----

// POST /registration/draft — Create draft with personal details (US-REG-01)
router.post('/draft', ...authWizard, uploadProfilePhoto, createDraft);

// PUT /registration/draft/:id/personal — Update personal details (US-REG-01 edit)
router.put('/draft/:id/personal', ...authWizard, uploadProfilePhoto, updatePersonal);

// PUT /registration/draft/:id/address — Update address + identity docs (US-REG-02)
router.put('/draft/:id/address', ...authWizard, updateAddress);

// PUT /registration/draft/:id/academic — Update academic details (US-REG-03)
router.put('/draft/:id/academic', ...authWizard, uploadMarksheet, updateAcademic);

// PUT /registration/draft/:id/course — Select course + batch (US-REG-04)
router.put('/draft/:id/course', ...authWizard, updateCourse);

// POST /registration/draft/:id/submit — Final submit (US-REG-05/07)
router.post('/draft/:id/submit', ...authWizard, submitRegistration);

// ---- List / View / Edit Routes (staff only — must come AFTER specific routes) ----

// GET /registration — List all registrations (US-REG-08)
router.get('/', ...authStaffOnly, listRegistrations);

// GET /registration/:id — Get single registration (US-REG-08)
// Wizard users (guests) need this to refetch draft after course selection
// NOTE: This wildcard route must remain LAST among GET routes
router.get('/:id', ...authWizard, getRegistration);

// PUT /registration/:id — Edit pending_payment registration (US-REG-08)
router.put('/:id', ...authWizard, editRegistration);

module.exports = router;
