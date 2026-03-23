// ==========================================================================
// ACADENO LMS — Role Permissions & Hierarchy (US-AUTH-05)
// ==========================================================================
// Defines the role hierarchy and allowed route prefixes/resources per role.
// Used by the authorize middleware for RBAC.
// ==========================================================================

// Role hierarchy: higher numbers = more privilege.
// When checking a required role, any role with an equal or higher
// number in the hierarchy is implicitly allowed.
const ROLE_HIERARCHY = {
  super_admin: 50,
  hr:          40,
  bda:         30,
  trainer:     20,
  student:     10,
};

// Access permissions: specific route prefixes natively allowed without hierarchy.
const PERMISSIONS = {
  super_admin: {
    allowedPrefixes: ['/'], // Has access to everything natively
  },
  hr: {
    allowedPrefixes: ['/users', '/reports', '/dashboard'],
  },
  bda: {
    allowedPrefixes: ['/leads', '/students', '/dashboard'],
  },
  trainer: {
    allowedPrefixes: ['/courses', '/tasks', '/students', '/dashboard'],
  },
  student: {
    // SRD BR-A03: Student allowed routes only
    allowedPrefixes: ['/courses', '/progress', '/tasks', '/invoices'],
  },
};

module.exports = { ROLE_HIERARCHY, PERMISSIONS };
