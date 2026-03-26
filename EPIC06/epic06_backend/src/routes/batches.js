// ==========================================================================
// ACADENO LMS — Batches Router (EPIC-08 Integrated)
// ==========================================================================
const express   = require('express');
const router    = express.Router();
const authenticate = require('../middleware/authenticate');
const requireRole    = require('../middleware/rbac');
const { createBatch, listBatches, getBatch, updateBatch,
        assignTrainer, listTrainerPool, autoAssignTrainer,
        addToPool, removeFromPool, listMyBatches } = require('../controllers/batchController');

const hrAndAbove = [authenticate, requireRole('hr', 'super_admin')];
const trainerAndAbove = [authenticate, requireRole('trainer', 'hr', 'super_admin')];

router.get ('/my-batches',       ...trainerAndAbove, listMyBatches);
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
