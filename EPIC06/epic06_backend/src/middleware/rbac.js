// ==========================================================================
// ACADENO LMS — RBAC Middleware
// ==========================================================================
// Factory function that returns Express middleware to restrict routes
// to specific roles. Must be used AFTER the `authenticate` middleware
// so that `req.user.role` is available.
//
// Usage:
//   const requireRole = require('../middleware/rbac');
//   router.post('/some-route', authenticate, requireRole('hr', 'bda', 'super_admin'), controller);
// ==========================================================================

const ROLE_HIERARCHY = {
  super_admin:       50,
  hr:                40,
  bda:               30,
  trainer:           20,
  student:           10,
  // lead_registrant is a transient role issued to converted leads so they can
  // complete the registration wizard before a full user account is activated.
  // It carries the lowest privilege level and is intentionally absent from
  // the PostgreSQL user_role ENUM — it only exists inside signed JWTs.
  lead_registrant:   5,
};

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        error: 'Authentication required',
        code:  'AUTH_REQUIRED',
      });
    }

    const userRole = req.user.role;

    // Super admin always has access
    if (userRole === 'super_admin') {
      return next();
    }

    // Check if user's role is in the allowed list
    if (allowedRoles.includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      error: 'Insufficient permissions',
      code:  'FORBIDDEN',
    });
  };
}

module.exports = requireRole;
