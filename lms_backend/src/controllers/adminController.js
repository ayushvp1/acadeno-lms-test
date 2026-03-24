// ==========================================================================
// ACADENO LMS — Admin Controller (EPIC-08)
// ==========================================================================
// Handles: US-HR-06 (System Settings), US-HR-07 (Analytics Dashboard)
// ==========================================================================

const bcrypt = require('bcrypt');
const { pool } = require('../db/index');

async function setRlsContext(client, role) {
  await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [role]);
}

// ==========================================================================
// US-HR-06: System Settings
// ==========================================================================

// ---------------------------------------------------------------------------
// GET /api/admin/settings
// ---------------------------------------------------------------------------
async function listSettings(req, res) {
  const client = await pool.connect();
  try {
    await setRlsContext(client, req.user.role);

    const result = await client.query(
      `SELECT key, description, is_sensitive, updated_at,
              CASE WHEN is_sensitive THEN '••••••••' ELSE value END AS value
         FROM system_settings
         ORDER BY key`
    );

    return res.status(200).json({ settings: result.rows });
  } catch (err) {
    console.error('LIST SETTINGS ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/settings/:key
// ---------------------------------------------------------------------------
async function updateSetting(req, res) {
  const client = await pool.connect();
  try {
    await setRlsContext(client, req.user.role);
    await client.query('BEGIN');

    const { key } = req.params;
    const { value, current_password } = req.body;

    if (value === undefined || value === null) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'value is required' });
    }

    // Fetch existing setting
    const settingRes = await client.query(
      'SELECT * FROM system_settings WHERE key = $1',
      [key]
    );
    if (settingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: `Setting '${key}' not found` });
    }
    const setting = settingRes.rows[0];

    // Re-auth gate for sensitive settings
    if (setting.is_sensitive) {
      if (!current_password) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'current_password is required for sensitive settings' });
      }

      const userRes = await client.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [req.user.user_id]
      );
      if (userRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(401).json({ error: 'User not found' });
      }

      const passwordMatch = await bcrypt.compare(current_password, userRes.rows[0].password_hash);
      if (!passwordMatch) {
        await client.query('ROLLBACK');
        return res.status(401).json({ error: 'Incorrect password' });
      }
    }

    const updated = await client.query(
      `UPDATE system_settings
          SET value = $1, updated_by = $2, updated_at = NOW()
        WHERE key = $3
        RETURNING key, description, is_sensitive, updated_at,
                  CASE WHEN is_sensitive THEN '••••••••' ELSE value END AS value`,
      [String(value), req.user.user_id, key]
    );

    await client.query('COMMIT');
    return res.status(200).json({ setting: updated.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('UPDATE SETTING ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ==========================================================================
// US-HR-07: Admin Analytics
// ==========================================================================

// ---------------------------------------------------------------------------
// GET /api/admin/analytics
// ---------------------------------------------------------------------------
async function getAnalytics(req, res) {
  const client = await pool.connect();
  try {
    await setRlsContext(client, req.user.role);

    // Run all analytics queries in parallel
    const [
      activeStudentsRes,
      monthlyRevenueRes,
      activeBatchesRes,
      enrollmentsByCourseRes,
      monthlyTrendRes,
    ] = await Promise.all([
      // Total active students
      client.query(
        `SELECT COUNT(DISTINCT s.id)::int AS total
           FROM students s
           JOIN users u ON u.id = s.user_id
          WHERE u.is_active = TRUE`
      ),
      // Total revenue this month
      client.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS revenue
           FROM payments
          WHERE status = 'paid'
            AND created_at >= date_trunc('month', NOW())`
      ),
      // Active batch count
      client.query(
        `SELECT COUNT(*)::int AS total FROM batches WHERE status = 'active'`
      ),
      // Enrollments by course (for bar chart)
      client.query(
        `SELECT c.course_name,
                COUNT(e.id)::int AS enrollment_count
           FROM courses c
           LEFT JOIN enrollments e ON e.course_id = c.id
          GROUP BY c.id, c.course_name
          ORDER BY enrollment_count DESC`
      ),
      // Monthly registration trend (last 12 months)
      client.query(
        `SELECT TO_CHAR(month, 'YYYY-MM') AS month,
                COUNT(e.id)::int          AS registrations
           FROM generate_series(
                  date_trunc('month', NOW() - INTERVAL '11 months'),
                  date_trunc('month', NOW()),
                  INTERVAL '1 month'
                ) AS month
           LEFT JOIN enrollments e
                  ON date_trunc('month', e.created_at) = month
          GROUP BY month
          ORDER BY month`
      ),
    ]);

    return res.status(200).json({
      total_active_students:  activeStudentsRes.rows[0].total,
      monthly_revenue:        monthlyRevenueRes.rows[0].revenue,
      active_batch_count:     activeBatchesRes.rows[0].total,
      enrollments_by_course:  enrollmentsByCourseRes.rows,
      monthly_trend:          monthlyTrendRes.rows,
    });
  } catch (err) {
    console.error('GET ANALYTICS ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

module.exports = { listSettings, updateSetting, getAnalytics };
