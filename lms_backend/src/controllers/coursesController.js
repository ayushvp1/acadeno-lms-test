// ==========================================================================
// ACADENO LMS — Courses Controller
// ==========================================================================
// Handles course and batch listing for the registration wizard.
// ==========================================================================

const { pool } = require('../db/index');

// ---------------------------------------------------------------------------
// GET /api/courses  (US-REG-04)
// ---------------------------------------------------------------------------
async function listCourses(req, res) {
  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const result = await client.query(
      `SELECT id, name, description, duration_weeks, base_fee
         FROM courses
        WHERE is_active = TRUE
        ORDER BY name ASC`
    );

    return res.status(200).json({ courses: result.rows });
  } catch (err) {
    console.error('LIST COURSES ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/courses/:id/batches  (US-REG-04)
// ---------------------------------------------------------------------------
async function listBatches(req, res) {
  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const { id } = req.params;

    // Verify course exists and is active
    const courseResult = await client.query(
      `SELECT id FROM courses WHERE id = $1 AND is_active = TRUE`,
      [id]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Course not found or inactive',
        code:  'COURSE_NOT_FOUND',
      });
    }

    const result = await client.query(
      `SELECT b.id, b.name, b.schedule, b.capacity, b.enrolled_count,
              b.start_date, b.end_date,
              u.email AS trainer_email
         FROM batches b
         LEFT JOIN users u ON b.trainer_id = u.id
        WHERE b.course_id = $1
          AND b.is_active = TRUE
        ORDER BY b.start_date ASC NULLS LAST`,
      [id]
    );

    const batches = result.rows.map((batch) => ({
      ...batch,
      seats_remaining: batch.capacity - batch.enrolled_count,
      is_full:         batch.enrolled_count >= batch.capacity,
    }));

    return res.status(200).json({ batches });
  } catch (err) {
    console.error('LIST BATCHES ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

module.exports = { listCourses, listBatches };
