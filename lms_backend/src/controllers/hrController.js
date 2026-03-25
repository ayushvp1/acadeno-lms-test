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
      u.full_name as student_name, u.email as student_email,
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
      LEFT JOIN students r ON s.registration_number = r.registration_number
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
      `SELECT e.*, u.full_name as student_name, u.email as student_email, s.registration_number
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
            e.course_id, e.batch_id, e.status as enrollment_status, e.total_fee,
            c.name as course_name,
            b.name as batch_name
            FROM students r
            JOIN enrollments e ON r.id = e.student_id
            LEFT JOIN courses c ON e.course_id = c.id
            LEFT JOIN batches b ON e.batch_id = b.id
            WHERE 1=1
        `;
        const params = [];

        if (date_from) query += ` AND r.created_at >= $${params.push(date_from)}`;
        if (date_to) query += ` AND r.created_at <= $${params.push(date_to)}`;
        if (course_id) query += ` AND e.course_id = $${params.push(course_id)}`;
        if (batch_id) query += ` AND e.batch_id = $${params.push(batch_id)}`;
        if (status) query += ` AND e.status = $${params.push(status)}`;

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
        
        // Fetch data with joins for CSV
        const result = await client.query(`
            SELECT r.registration_number, r.first_name, r.last_name, r.email,
            c.name as course_name, b.name as batch_name, r.created_at, e.status
            FROM students r
            JOIN enrollments e ON r.id = e.student_id
            LEFT JOIN courses c ON e.course_id = c.id
            LEFT JOIN batches b ON e.batch_id = b.id
            LIMIT 100
        `);
        const rows = result.rows;

        const header = "Registration No,Student Name,Email,Course,Batch,Date,Status\n";
        const csv = rows.reduce((acc, row) => {
            const fullName = `${row.first_name} ${row.last_name || ''}`;
            return acc + `${row.registration_number},${fullName},${row.email},${row.course_name},${row.batch_name},${row.created_at},${row.status}\n`;
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

/**
 * US-HR-04: List all users with trainer role
 */
async function listAllTrainers(req, res) {
    const client = await pool.connect();
    try {
        await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);
        const result = await client.query(
            `SELECT id, email, full_name FROM users WHERE role = 'trainer' ORDER BY full_name ASC`
        );
        return res.json({ trainers: result.rows });
    } catch (err) {
        console.error('LIST TRAINERS ERROR:', err.message);
        return res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
}

module.exports = {
  listEnrollments, getEnrollmentDetail, getRegistrationReport, exportRegistrationsCSV, listAllTrainers
};
