// ==========================================================================
// ACADENO LMS — Batch Routes (EPIC-08 Modular)
// ==========================================================================

const express    = require('express');
const router     = express.Router();
const authenticate = require('../../../middleware/authenticate');
const authorize    = require('../../../middleware/authorize');

const {
  createBatch,
  listBatches,
  getBatch,
  updateBatch,
  assignTrainer,
  autoAssignTrainer,
} = require('../controllers/batchController');

const hrAndAbove = [authenticate, authorize('hr')];

router.get ('/',                 ...hrAndAbove, listBatches);
router.post('/',                 ...hrAndAbove, createBatch);
router.get ('/:id',              ...hrAndAbove, getBatch);
router.patch('/:id',             ...hrAndAbove, updateBatch);
router.patch('/:id/trainer',     ...hrAndAbove, assignTrainer);
router.post ('/:id/auto-assign', ...hrAndAbove, autoAssignTrainer);

module.exports = router;
