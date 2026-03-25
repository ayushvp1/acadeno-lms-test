// ==========================================================================
// ACADENO LMS — Batches Router (EPIC-08)
// ==========================================================================
const express   = require('express');
const router    = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');
const { createBatch, listBatches, getBatch, updateBatch,
        assignTrainer, listTrainerPool, autoAssignTrainer,
        addToPool, removeFromPool } = require('../controllers/batchController');

const hrAndAbove = [authenticate, authorize('hr')];

router.get ('/',                  ...hrAndAbove, listBatches);
router.post('/',                  ...hrAndAbove, createBatch);
router.get ('/:id',               ...hrAndAbove, getBatch);
router.patch('/:id',              ...hrAndAbove, updateBatch);
router.patch('/:id/trainer',      ...hrAndAbove, assignTrainer);
router.post ('/:id/auto-assign',  ...hrAndAbove, autoAssignTrainer);
router.get ('/course/:courseId/trainer-pool', ...hrAndAbove, listTrainerPool);
router.post ('/trainer-pool',                 ...hrAndAbove, addToPool);
router.delete('/trainer-pool/:courseId/:trainerId', ...hrAndAbove, removeFromPool);

module.exports = router;
