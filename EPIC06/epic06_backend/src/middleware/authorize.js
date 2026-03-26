// ==========================================================================
// ACADENO LMS — Role-Based Authorization Middleware (US-AUTH-05)
// ==========================================================================
// Integrates with src/config/permissions.js to enforce role hierarchy and
// route restrictions. Must be used AFTER the authenticate middleware.
// ==========================================================================

const { ROLE_HIERARCHY, PERMISSIONS } = require('../config/permissions');

function authorize(...allowedRoles) {
  return (req, res, next) => {
    // Safety check — authenticate middleware must run first
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        error: 'Authentication required before authorization',
        code:  'UNAUTHENTICATED',
      });
    }

    const { role } = req.user;
    const path = req.originalUrl || req.path;

    // ---- Global Route Restrictions ----

    // Attempting /admin routes as a non-admin (super_admin is the only true admin here)
    if (path.startsWith('/admin') && role !== 'super_admin') {
      return res.status(403).json({
        error:    'Access Denied',
        redirect: '/dashboard', // required per SRD BR-A03
      });
    }

    // Student Role Navigation Restrictions (SRD BR-A03)
    // Exclude /auth prefix so they can still refresh/logout
    if (role === 'student' && !path.startsWith('/auth')) {
      const allowedStudentPrefixes = PERMISSIONS.student.allowedPrefixes;
      const isAllowed = allowedStudentPrefixes.some(prefix => path.startsWith(prefix));
      
      if (!isAllowed) {
        return res.status(403).json({
          error: 'Access Denied',
          code:  'FORBIDDEN',
        });
      }
    }

    // ---- Hierarchy Check for Specific Routes ----
    if (allowedRoles.length > 0) {
      const userLevel = ROLE_HIERARCHY[role] || 0;
      
      // The user is granted access if their role level >= ANY of the required roles' levels
      const hasPermission = allowedRoles.some((allowedRole) => {
        const requiredLevel = ROLE_HIERARCHY[allowedRole] || 0;
        return userLevel >= requiredLevel;
      });

      if (!hasPermission) {
        return res.status(403).json({
          error: 'Access Denied',
          code:  'FORBIDDEN',
        });
      }
    }

    // All clear
    next();
  };
}

module.exports = authorize;
