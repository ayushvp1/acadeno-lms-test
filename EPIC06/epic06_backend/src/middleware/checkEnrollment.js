// ==========================================================================
// ACADENO LMS — Enrollment Check Middleware (BR-C02)
// ==========================================================================
// Enforces Business Rule BR-C02:
//   "Student can access content only for courses with active enrollment."
//
// HOW IT WORKS:
//   1. If the requesting user is NOT a student → skip (trainers, hr, admins
//      have unrestricted content access).
//   2. Resolve the course_id from the content_item in the URL params.
//   3. Check that the student has an active enrollment for that course.
//   4. If not → 403 Forbidden.
//
// USAGE:
//   router.get('/content/:contentId/url', authenticate, checkEnrollment, getContentUrl);
//
// ASSUMPTION:
//   req.user is populated by the authenticate middleware before this runs.
// ==========================================================================

const { pool } = require('../db/index');

// ---------------------------------------------------------------------------
// checkEnrollment(req, res, next)
// ---------------------------------------------------------------------------
async function checkEnrollment(req, res, next) {
  // Bouncer: skip for non-student roles — trainers/hr/admin have full access
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' });
  }

  if (req.user.role !== 'student') {
    return next();
  }

  const strContentId = req.params.contentId || req.params.id;

  if (!strContentId) {
    return next();   // Cannot verify without a content ID — let controller handle
  }

  const client = await pool.connect();

  try {
    await client.query("SET app.current_user_role = 'super_admin'");

    // Resolve course from content item through the hierarchy:
    // content_items → sub_modules → modules → courses
    const objContentResult = await client.query(
      `SELECT c.id AS course_id
         FROM content_items ci
         JOIN sub_modules   sm ON ci.sub_module_id = sm.id
         JOIN modules        m ON sm.module_id = m.id
         JOIN courses        c ON m.course_id  = c.id
        WHERE ci.id     = $1
          AND ci.status = 'published'`,
      [strContentId]
    );

    if (objContentResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Content item not found or not yet published.',
        code:  'CONTENT_NOT_FOUND',
      });
    }

    const strCourseId = objContentResult.rows[0].course_id;

    // Verify the student has an active enrollment for this course
    const objEnrollResult = await client.query(
      `SELECT e.id
         FROM enrollments e
         JOIN students s ON e.student_id = s.id
        WHERE s.user_id    = $1
          AND e.course_id  = $2
          AND e.status     = 'active'`,
      [req.user.user_id, strCourseId]
    );

    if (objEnrollResult.rows.length === 0) {
      return res.status(403).json({
        error: 'You are not enrolled in the course for this content.',
        code:  'NOT_ENROLLED',
      });
    }

    return next();
  } catch (err) {
    console.error('checkEnrollment error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

module.exports = checkEnrollment;
