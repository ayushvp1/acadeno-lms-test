const express   = require('express');
const router    = express.Router();
const authenticate    = require('../middleware/authenticate');
const requireRole     = require('../middleware/rbac');
const { listSettings, updateSetting, getAnalytics, getAuditLogs, deleteAuditLog } = require('../controllers/adminController');

const superAdminOnly = [authenticate, requireRole('super_admin')];
const adminAndHR      = [authenticate, requireRole('super_admin', 'hr')];

router.get ('/settings',       ...superAdminOnly, listSettings);
router.patch('/settings/:key', ...superAdminOnly, updateSetting);
router.get ('/analytics',      ...superAdminOnly, getAnalytics);

// --- Audit Logs (US-NOT-06) ---
router.get   ('/audit-logs',      ...adminAndHR, getAuditLogs);
router.delete('/audit-logs/:id',  ...adminAndHR, deleteAuditLog);

module.exports = router;
