const express   = require('express');
const router    = express.Router();
const authenticate    = require('../middleware/authenticate');
const authorize       = require('../middleware/authorize');
const { listSettings, updateSetting, getAnalytics } = require('../controllers/adminController');

const superAdminOnly = [authenticate, authorize('super_admin')];

router.get ('/settings',       ...superAdminOnly, listSettings);
router.patch('/settings/:key', ...superAdminOnly, updateSetting);
router.get ('/analytics',      ...superAdminOnly, getAnalytics);

module.exports = router;
