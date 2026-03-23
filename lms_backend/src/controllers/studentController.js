const { pool } = require('../db/index');
const redis = require('../utils/redis');

async function getStudentDashboard(req, res) {
  const client = await pool.connect();
  // Elevate for internal queries
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const userId = req.user.user_id;

    // Fetch student and enrollment data
    const result = await client.query(`
      SELECT 
        s.id as student_id,
        s.first_name,
        s.last_name,
        s.email,
        s.registration_number,
        e.id as enrollment_id,
        e.status as enrollment_status,
        e.total_fee,
        c.name as course_name,
        b.name as batch_name
      FROM students s
      JOIN enrollments e ON s.id = e.student_id
      JOIN courses c ON e.course_id = c.id
      JOIN batches b ON e.batch_id = b.id
      WHERE s.user_id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student record not found' });
    }

    const dashboardData = result.rows[0];

    // Sync with Redis (Requirement 7)
    try {
      await redis.set(`student_profile:${dashboardData.student_id}`, JSON.stringify({
        first_name: dashboardData.first_name,
        last_name: dashboardData.last_name,
        email: dashboardData.email
      }), 'EX', 86400);
      
      await redis.set(`payment_status:${dashboardData.enrollment_id}`, dashboardData.enrollment_status === 'active' ? 'paid' : 'pending_payment', 'EX', 86400);
      
      // Track dashboard access in Redis
      await redis.set(`dashboard_access:${dashboardData.student_id}`, new Date().toISOString(), 'EX', 86400);
    } catch (redisErr) {
      console.error('Redis sync error in dashboard:', redisErr.message);
    }

    return res.status(200).json(dashboardData);
  } catch (err) {
    console.error('getStudentDashboard error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

module.exports = {
  getStudentDashboard
};
