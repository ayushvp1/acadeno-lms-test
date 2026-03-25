/**
 * ACADENO LMS — EPIC 8 MOCK Authorization (Standalone)
 */
module.exports = (role) => (req, res, next) => {
    // Pass everything for standalone harness testing
    next();
};
