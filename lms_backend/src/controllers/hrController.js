// ==========================================================================
// ACADENO LMS — HR Controller (EPIC-08)
// ==========================================================================
// Handles: US-HR-03 (Enrollment visibility),
//          US-HR-05 (Registration reports & CSV export)
// ==========================================================================

const { pool } = require('../db/index');

async function setRlsContext(client, role) {
  await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [role]);
}

// ==========================================================================
// US-HR-03: Enrollment Management
// ==========================================================================

// ---------------------------------------------------------------------------
// GET /api/hr/enrollments
// ---------------------------------------------------------------------------
async function listEnrollments(req, res) {
  const client = await pool.connect();
  try {
    await setRlsContext(client, req.user.role);

    const { status, payment_status, course_id, batch_id } = req.query;
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`e.status = $${params.length}`);
    }
    if (payment_status) {
      params.push(payment_status);
      conditions.push(`e.payment_status = $${params.length}`);
    }
    if (course_id) {
      params.push(course_id);
      conditions.push(`c.id = $${params.length}`);
    }
    if (batch_id) {
      params.push(batch_id);
      conditions.push(`e.batch_id = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await client.query(
      `SELECT e.id          AS enrollment_id,
              s.registration_number,
              u.full_name   AS student_name,
              u.email,
              c.course_name,
              b.batch_name,
              e.status      AS enrollment_status,
              e.payment_status,
              COALESCE(
                ROUND(
                  100.0 * COUNT(DISTINCT ct.id) FILTER (WHERE ct.status = 'completed')
                  / NULLIF(COUNT(DISTINCT ct.id), 0)
                , 1), 0
              )             AS completion_pct
         FROM enrollments e
         JOIN students s ON s.id = e.student_id
         JOIN users    u ON u.id = s.user_id
         JOIN courses  c ON c.id = e.course_id
         LEFT JOIN batches b ON b.id = e.batch_id
         LEFT JOIN course_tasks ct ON ct.course_id = e.course_id
         ${where}
         GROUP BY e.id, s.registration_number, u.full_name, u.email,
                  c.course_name, b.batch_name, e.status, e.payment_status
         ORDER BY e.created_at DESC`,
      params
    );

    return res.status(200).json({ enrollments: result.rows });
  } catch (err) {
    console.error('LIST ENROLLMENTS ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/hr/enrollments/:studentId
// ---------------------------------------------------------------------------
async function getEnrollmentDetail(req, res) {
  const client = await pool.connect();
  try {
    await setRlsContext(client, req.user.role);

    const result = await client.query(
      `SELECT s.*,
              u.full_name, u.email, u.phone,
              json_agg(
                json_build_object(
                  'enrollment_id',  e.id,
                  'course_name',    c.course_name,
                  'batch_name',     b.batch_name,
                  'status',         e.status,
                  'payment_status', e.payment_status,
                  'enrolled_at',    e.created_at
                ) ORDER BY e.created_at DESC
              ) AS enrollments
         FROM students s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN enrollments e ON e.student_id = s.id
         LEFT JOIN courses c ON c.id = e.course_id
         LEFT JOIN batches b ON b.id = e.batch_id
        WHERE s.id = $1
        GROUP BY s.id, u.full_name, u.email, u.phone`,
      [req.params.studentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    return res.status(200).json({ student: result.rows[0] });
  } catch (err) {
    if (err.code === '22P02') {
      return res.status(404).json({ error: 'Student not found' });
    }
    console.error('GET ENROLLMENT DETAIL ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ==========================================================================
// US-HR-05: Registration Reports
// ==========================================================================

// Shared query builder for reports
function buildReportQuery(params) {
  const conditions = [];
  const values = [];

  if (params.date_from) {
    values.push(params.date_from);
    conditions.push(`e.created_at >= $${values.length}`);
  }
  if (params.date_to) {
    values.push(params.date_to);
    conditions.push(`e.created_at <= $${values.length}`);
  }
  if (params.course_id) {
    values.push(params.course_id);
    conditions.push(`e.course_id = $${values.length}`);
  }
  if (params.batch_id) {
    values.push(params.batch_id);
    conditions.push(`e.batch_id = $${values.length}`);
  }
  if (params.registration_status) {
    values.push(params.registration_status);
    conditions.push(`e.status = $${values.length}`);
  }
  if (params.payment_status) {
    values.push(params.payment_status);
    conditions.push(`e.payment_status = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, values };
}

const REPORT_SELECT = `
  SELECT s.registration_number,
         u.full_name        AS student_name,
         u.email,
         c.course_name,
         b.batch_name,
         e.status           AS registration_status,
         e.payment_status,
         e.created_at       AS registered_at
    FROM enrollments e
    JOIN students s ON s.id = e.student_id
    JOIN users    u ON u.id = s.user_id
    JOIN courses  c ON c.id = e.course_id
    LEFT JOIN batches b ON b.id = e.batch_id`;

// ---------------------------------------------------------------------------
// GET /api/hr/reports/registrations
// ---------------------------------------------------------------------------
async function getRegistrationReport(req, res) {
  const client = await pool.connect();
  try {
    await setRlsContext(client, req.user.role);
    const { where, values } = buildReportQuery(req.query);
    const result = await client.query(
      `${REPORT_SELECT} ${where} ORDER BY e.created_at DESC`,
      values
    );
    return res.status(200).json({ report: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('GET REPORT ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/hr/reports/registrations/export
// ---------------------------------------------------------------------------
async function exportRegistrationsCSV(req, res) {
  const client = await pool.connect();
  try {
    await setRlsContext(client, req.user.role);
    const { where, values } = buildReportQuery(req.query);
    const result = await client.query(
      `${REPORT_SELECT} ${where} ORDER BY e.created_at DESC`,
      values
    );

    const headers = [
      'registration_number',
      'student_name',
      'email',
      'course_name',
      'batch_name',
      'registration_status',
      'payment_status',
      'registered_at',
    ];

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines = [
      headers.join(','),
      ...result.rows.map((row) =>
        headers.map((h) => escapeCSV(row[h])).join(',')
      ),
    ];

    const csv = csvLines.join('\n');
    const filename = `registrations_export_${Date.now()}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (err) {
    console.error('EXPORT CSV ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

module.exports = {
  listEnrollments,
  getEnrollmentDetail,
  getRegistrationReport,
  exportRegistrationsCSV,
};
