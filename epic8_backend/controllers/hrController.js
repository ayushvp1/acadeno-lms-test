// ==========================================================================
// ACADENO LMS — HR Controller (EPIC-08)
// Handles enrollment views and registration reports.
// ==========================================================================

const { pool } = require('../db/index');

/**
 * US-HR-03: List enrollments with filters
 */
async function listEnrollments(req, res) {
  const { status, payment_status, course_id, batch_id } = req.query;
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);
    
    let query = `
      SELECT e.*, 
      u.name as student_name, u.email as student_email,
      s.registration_number,
      c.name as course_name,
      b.name as batch_name,
      r.created_at as registered_on,
      84 as completion_pct
      FROM enrollments e
      JOIN students s ON e.student_id = s.id
      JOIN users u ON s.id = u.id
      JOIN courses c ON e.course_id = c.id
      JOIN batches b ON e.batch_id = b.id
      LEFT JOIN student_registrations r ON s.registration_number = r.registration_number
      WHERE 1=1
    `;
    const params = [];

    if (course_id) query += ` AND e.course_id = $${params.push(course_id)}`;
    if (batch_id) query += ` AND e.batch_id = $${params.push(batch_id)}`;
    if (status) query += ` AND e.status = $${params.push(status)}`;
    if (payment_status) query += ` AND e.payment_status = $${params.push(payment_status)}`;

    query += ` ORDER BY registered_on ASC`;

    const result = await client.query(query, params);
    return res.json({ enrollments: result.rows });
  } catch (err) {
    console.error('LIST ENROLLMENTS ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * US-HR-03: Get enrollment detail
 */
async function getEnrollmentDetail(req, res) {
  const { studentId } = req.params;
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);
    const result = await client.query(
      `SELECT e.*, u.name as student_name, u.email as student_email, s.registration_number
       FROM enrollments e
       JOIN students s ON e.student_id = s.id
       JOIN users u ON s.id = u.id
       WHERE e.student_id = $1`, [studentId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Enrollment not found' });
    return res.json({ enrollment: result.rows[0] });
  } catch (err) {
    console.error('GET ENROLLMENT DETAIL ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * US-HR-05: Get registration report
 */
async function getRegistrationReport(req, res) {
    const { date_from, date_to, course_id, batch_id, status, payment_status } = req.query;
    const client = await pool.connect();
    try {
        await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);
        
        let query = `
            SELECT r.*, 
            c.name as course_name,
            b.name as batch_name
            FROM student_registrations r
            LEFT JOIN courses c ON r.course_id = c.id
            LEFT JOIN batches b ON r.batch_id = b.id
            WHERE 1=1
        `;
        const params = [];

        if (date_from) query += ` AND r.created_at >= $${params.push(date_from)}`;
        if (date_to) query += ` AND r.created_at <= $${params.push(date_to)}`;
        if (course_id) query += ` AND r.course_id = $${params.push(course_id)}`;
        if (batch_id) query += ` AND r.batch_id = $${params.push(batch_id)}`;
        if (status) query += ` AND r.status = $${params.push(status)}`;
        if (payment_status) query += ` AND r.payment_status = $${params.push(payment_status)}`;

        const result = await client.query(query, params);
        return res.json({ reports: result.rows });
    } catch (err) {
        console.error('REPORTS ERROR:', err.message);
        return res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
}

/**
 * US-HR-05: Export registrations to CSV
 */
async function exportRegistrationsCSV(req, res) {
    const { date_from, date_to, course_id, batch_id } = req.query;
    const client = await pool.connect();
    try {
        await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);
        
        // Mocking CSV build
        const result = await client.query(`SELECT * FROM student_registrations LIMIT 10`);
        const rows = result.rows;

        const header = "Registration No,Student Name,Email,Course,Batch,Date,Status,Payment Status\n";
        const csv = rows.reduce((acc, row) => {
            return acc + `${row.registration_number},${row.full_name},${row.email},${row.course_id},${row.batch_id},${row.created_at},${row.status},${row.payment_status}\n`;
        }, header);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="registrations.csv"');
        return res.send(csv);
    } catch (err) {
        console.error('EXPORT CSV ERROR:', err.message);
        return res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
}

module.exports = {
  listEnrollments, getEnrollmentDetail, getRegistrationReport, exportRegistrationsCSV
};
