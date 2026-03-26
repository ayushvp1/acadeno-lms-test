// ==========================================================================
// ACADENO LMS — Admin Controller (EPIC-08 Integrated)
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
    
    // Total Students
    const studentCount = await client.query('SELECT COUNT(*) FROM students');
    
    // Revenue this month 
    const revenueRes = await client.query(
        "SELECT SUM(amount) FROM payments WHERE created_at >= date_trunc('month', now())"
    );
    
    // Active batches 
    const batchRes = await client.query("SELECT COUNT(*) FROM batches WHERE status = 'active'");
    
    // Mock trends and chart data for demo
    const analytics = {
        total_students: parseInt(studentCount.rows[0].count),
        revenue_this_month: parseFloat(revenueRes.rows[0].sum || 0),
        active_batches: parseInt(batchRes.rows[0].count),
        enrollments_by_course: [
            { course: 'Full Stack Dev', count: 42 },
            { course: 'UI/UX Design', count: 35 },
            { course: 'Data Science', count: 18 }
        ],
        monthly_trend: [
            { month: 'Jan', registrations: 45 },
            { month: 'Feb', registrations: 52 },
            { month: 'Mar', registrations: 38 }
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

/**
 * US-NOT-06: List audit logs with filters
 */
async function getAuditLogs(req, res) {
    const { userId, actionType, startDate, endDate } = req.query;
    const client = await pool.connect();
    try {
        await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);

        let queryStr = `
            SELECT 
                a.id, a.action_type, a.resource_type, a.resource_id, a.status, 
                a.details, a.ip_address, a.created_at,
                u.email as actor_email,
                u.role as actor_role,
                u.full_name as actor_name
            FROM audit_logs a
            JOIN users u ON a.actor_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (userId) {
            params.push(userId);
            queryStr += ` AND a.actor_id = $${params.length}`;
        }
        if (actionType) {
            params.push(actionType);
            queryStr += ` AND a.action_type = $${params.length}`;
        }
        if (startDate) {
            params.push(startDate);
            queryStr += ` AND a.created_at >= $${params.length}`;
        }
        if (endDate) {
            params.push(endDate);
            queryStr += ` AND a.created_at <= $${params.length}`;
        }

        queryStr += ` ORDER BY a.created_at DESC LIMIT 100`;

        const result = await client.query(queryStr, params);
        return res.json({ logs: result.rows });
    } catch (err) {
        console.error('GET AUDIT LOGS ERROR:', err.message);
        return res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
}

/**
 * US-NOT-06: Strict DELETE protection (403)
 */
async function deleteAuditLog(req, res) {
    return res.status(403).json({ 
        error: 'Forbidden', 
        message: 'Audit records are immutable and cannot be deleted.' 
    });
}

module.exports = {
  listSettings, updateSetting, getAnalytics, getAuditLogs, deleteAuditLog
};
