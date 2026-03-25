// ==========================================================================
// ACADENO LMS — EPIC 8 Modular Entry point
// Handles HR, Admin, and Batch Management routes.
// ==========================================================================

const express = require('express');
const router  = express.Router();

const hrRoutes    = require('./routes/hrRoutes');
const adminRoutes = require('./routes/adminRoutes');
const batchRoutes = require('./routes/batchRoutes');

// Mount the modular routes
router.use('/hr',     hrRoutes);
router.use('/admin',  adminRoutes);
router.use('/batches', batchRoutes);

module.exports = router;
