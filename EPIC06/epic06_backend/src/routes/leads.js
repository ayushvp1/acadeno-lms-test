// ==========================================================================
// ACADENO LMS — Leads Router (EPIC-02)
// ==========================================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');

const storage = multer.memoryStorage();
const upload = multer({ 
  storage, 
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const { 
  createLead, getLeadById, updateLeadStatus, 
  addNote, getNotes, getDashboard, getLeads,
  convertLead, unlockLead, importLeads, deleteLead
} = require('../controllers/leadController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');


// ---------------------------------------------------------------------------
// GET /api/leads
// Fetch leads with dynamic contextual isolation metrics locally returning parameterised arrays (US-BDA-08)
// ---------------------------------------------------------------------------
router.get(
  '/',
  authenticate,
  authorize('bda', 'super_admin', 'hr'),
  getLeads
);

// ---------------------------------------------------------------------------
// GET /api/leads/dashboard
// Fetch Aggregate Analytical KPI context isolated per-user cleanly mapped.
// ---------------------------------------------------------------------------
router.get(
  '/dashboard',
  authenticate,
  authorize('bda', 'super_admin', 'hr'),
  getDashboard
);

// ---------------------------------------------------------------------------
// POST /api/leads
// Create a new lead with duplicate checking and BDA context enforcement.
// ---------------------------------------------------------------------------
router.post(
  '/',
  authenticate,
  authorize('bda', 'super_admin'),
  createLead
);

// ---------------------------------------------------------------------------
// GET /api/leads/:id
// Retrieve single lead data mapping to notes and histories.
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  authenticate,
  authorize('bda', 'super_admin', 'hr'),
  getLeadById
);

// ---------------------------------------------------------------------------
// PATCH /api/leads/:id/status
// Mutate Lead Pipeline Status (US-BDA-02)
// ---------------------------------------------------------------------------
router.patch(
  '/:id/status',
  authenticate,
  authorize('bda', 'super_admin'),
  updateLeadStatus
);

// ---------------------------------------------------------------------------
// POST /api/leads/:id/notes
// Create Append-Only Interaction Notes dynamically locking contexts.
// ---------------------------------------------------------------------------
router.post(
  '/:id/notes',
  authenticate,
  authorize('bda', 'super_admin', 'hr'),
  addNote
);

// ---------------------------------------------------------------------------
// GET /api/leads/:id/notes
// Fetch chronological lead history notes safely via isolation rules.
// ---------------------------------------------------------------------------
router.get(
  '/:id/notes',
  authenticate,
  authorize('bda', 'super_admin', 'hr'),
  getNotes
);

// ---------------------------------------------------------------------------
// POST /api/leads/:id/convert
// Transition to converted status and generate prefill data (US-BDA-05).
// ---------------------------------------------------------------------------
router.post(
  '/:id/convert',
  authenticate,
  authorize('bda', 'super_admin'),
  convertLead
);

// ---------------------------------------------------------------------------
// PATCH /api/leads/:id/unlock
// Re-open a converted/locked lead (Super Admin Only).
// ---------------------------------------------------------------------------
router.patch(
  '/:id/unlock',
  authenticate,
  authorize('super_admin'),
  unlockLead
);

// ---------------------------------------------------------------------------
// POST /api/leads/import
// Bulk Lead CSV Import (US-BDA-06)
// ---------------------------------------------------------------------------
router.post(
  '/import',
  authenticate,
  authorize('bda', 'super_admin'),
  upload.single('file'),
  importLeads
);

// ---------------------------------------------------------------------------
// DELETE /api/leads/:id
// Delete a lead (BDA can delete their own leads, Super Admin can delete any lead)
// ---------------------------------------------------------------------------
router.delete(
  '/:id',
  authenticate,
  authorize('bda', 'super_admin'),
  deleteLead
);

module.exports = router;
