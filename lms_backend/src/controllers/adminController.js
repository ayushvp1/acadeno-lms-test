// ==========================================================================
// ACADENO LMS — Admin Controller (EPIC-08)
// Handles system configuration and analytics dashboard.
// ==========================================================================

const { pool } = require('../db/index');
const bcrypt = require('bcrypt');

/**
 * US-HR-06: List all settings
 */
async function listSettings(req, res) {
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);
    const result = await client.query('SELECT * FROM system_settings');
    const settings = result.rows.map(s => s.is_sensitive ? { ...s, value: '••••••••' } : s);
    return res.json({ settings });
  } catch (err) {
    console.error('LIST SETTINGS ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

/**
 * US-HR-06: Update setting
 */
async function updateSetting(req, res) {
    const { key } = req.params;
    const { value, current_password } = req.body;
    const client = await pool.connect();
    try {
        await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);
        
        // Find setting to check sensitivity
        const settingRes = await client.query('SELECT * FROM system_settings WHERE key = $1', [key]);
        const setting = settingRes.rows[0];

        // Re-authentication gate for sensitive keys
        if (setting.is_sensitive) {
            const userRes = await client.query('SELECT password_hash FROM users WHERE id = $1', [req.user.user_id]);
            const isMatch = await bcrypt.compare(current_password, userRes.rows[0].password_hash);
            if (!isMatch) return res.status(401).json({ error: 'Incorrect password' });
        }

        await client.query(
            `UPDATE system_settings SET value = $2, updated_by = $3, updated_at = NOW() 
             WHERE key = $1`,
            [key, value, req.user.user_id]
        );

        return res.json({ message: 'Setting updated successfully' });
    } catch (err) {
        console.error('UPDATE SETTING ERROR:', err.message);
        return res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
}

/**
 * US-HR-07: Get analytics dashboard
 */
async function getAnalytics(req, res) {
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);
    
    // 1. Total Students
    const studentCount = await client.query('SELECT COUNT(*) FROM students');
    
    // 2. Revenue this month (using enrollments since payments table is missing)
    const revenueRes = await client.query(
        "SELECT SUM(total_fee) FROM enrollments WHERE created_at >= date_trunc('month', now())"
    );
    
    // 3. Active batches 
    const batchRes = await client.query("SELECT COUNT(*) FROM batches WHERE is_active = TRUE");
    
    // 4. Enrollments by Course (for Bar Chart)
    const courseStatsRes = await client.query(`
        SELECT c.name as course, COUNT(e.id) as count
        FROM courses c
        LEFT JOIN enrollments e ON c.id = e.course_id
        GROUP BY c.name
        ORDER BY count DESC
        LIMIT 5
    `);

    // 5. Monthly Trend (for Trend Chart)
    const trendsRes = await client.query(`
        SELECT to_char(date_trunc('month', created_at), 'Mon') as month,
               COUNT(*) as registrations
        FROM enrollments
        WHERE created_at >= now() - interval '3 months'
        GROUP BY 1, date_trunc('month', created_at)
        ORDER BY date_trunc('month', created_at)
    `);

    // 6. Lead Marketing Metrics
    const totalLeadsRes = await client.query('SELECT COUNT(*) FROM leads');
    const convertedLeadsRes = await client.query("SELECT COUNT(*) FROM leads WHERE status = 'converted'");
    const leadsByStatusRes = await client.query(`
        SELECT status, COUNT(*) as count 
        FROM leads 
        GROUP BY status
        ORDER BY count DESC
    `);
    
    const totalLeads = parseInt(totalLeadsRes.rows[0].count);
    const convertedLeads = parseInt(convertedLeadsRes.rows[0].count);
    const conversionRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100).toFixed(1) : 0;

    const analytics = {
        total_students: parseInt(studentCount.rows[0].count),
        revenue_this_month: parseFloat(revenueRes.rows[0].sum || 0),
        active_batches: parseInt(batchRes.rows[0].count),
        total_leads: totalLeads,
        converted_leads: convertedLeads,
        conversion_rate: conversionRate,
        leads_by_status: leadsByStatusRes.rows,
        enrollments_by_course: courseStatsRes.rows.length > 0 ? courseStatsRes.rows : [
            { course: 'Full Stack Dev', count: 0 },
            { course: 'UI/UX Design', count: 0 }
        ],
        monthly_trend: trendsRes.rows.length > 0 ? trendsRes.rows : [
            { month: 'Jan', registrations: 0 },
            { month: 'Feb', registrations: 0 },
            { month: 'Mar', registrations: 0 }
        ]
    };

    return res.json({ analytics });
  } catch (err) {
    console.error('GET ANALYTICS ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

module.exports = {
  listSettings, updateSetting, getAnalytics
};
