// ==========================================================================
// ACADENO LMS — PIN Code Routes
// ==========================================================================
// Mounts /pincode/:pin endpoint for address auto-fill.
// ==========================================================================

const express = require('express');
const router  = express.Router();

const { lookupPin } = require('../controllers/pinCodeController');
const authenticate  = require('../middleware/authenticate');

// GET /pincode/:pin — Lookup city/state from PIN code (US-REG-02)
router.get('/:pin', authenticate, lookupPin);

module.exports = router;
