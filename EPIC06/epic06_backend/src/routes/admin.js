const express   = require('express');
const router    = express.Router();
const authenticate    = require('../middleware/authenticate');
const requireRole     = require('../middleware/rbac');
const { listSettings, updateSetting, getAnalytics } = require('../controllers/adminController');

const superAdminOnly = [authenticate, requireRole('super_admin')];

router.get ('/settings',       ...superAdminOnly, listSettings);
router.patch('/settings/:key', ...superAdminOnly, updateSetting);
router.get ('/analytics',      ...superAdminOnly, getAnalytics);

module.exports = router;
