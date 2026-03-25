/**
 * ACADENO LMS — EPIC 8 MOCK Middleware (Standalone)
 */
module.exports = (req, res, next) => {
    // Hardcoded "Master-Admin" bypass for standalone testing
    req.user = { user_id: 'mock-uuid-admin', role: 'super_admin' };
    next();
};
