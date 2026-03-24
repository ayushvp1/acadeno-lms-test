// ==========================================================================
// ACADENO LMS — Analytics & Stats Controller (EPIC-05)
// ==========================================================================
const { pool } = require('../db/index');

/**
 * getStudentStats(req, res)
 * GET /api/analytics/students/:studentId
 * Roles: trainer, hr, super_admin
 * 
 * Returns task completion stats and trends for a specific student.
 */
async function getStudentStats(req, res) {
    const { studentId } = req.params;
    const client = await pool.connect();
    
    try {
        await client.query('SET app.current_user_id = $1', [req.user.user_id]);
        await client.query('SET app.current_user_role = $1', [req.user.role]);

        // 1. Get task completion stats
        const statsRes = await client.query(`
            SELECT 
                COUNT(t.id) as total_tasks,
                COUNT(ts.id) as completed_tasks,
                AVG(ts.score) as avg_score
            FROM tasks t
            LEFT JOIN task_submissions ts ON t.id = ts.task_id AND ts.student_id = $1
            WHERE (t.target_student_id IS NULL OR t.target_student_id = $1)
            AND t.is_published = TRUE
        `, [studentId]);

        // 2. Get task history for the graph (last 10 tasks)
        const historyRes = await client.query(`
            SELECT 
                t.title,
                t.due_date,
                CASE WHEN ts.id IS NOT NULL THEN 1 ELSE 0 END as is_completed,
                COALESCE(ts.score, 0) as score
            FROM tasks t
            LEFT JOIN task_submissions ts ON t.id = ts.task_id AND ts.student_id = $1
            WHERE (t.target_student_id IS NULL OR t.target_student_id = $1)
            AND t.is_published = TRUE
            ORDER BY t.created_at ASC
            LIMIT 10
        `, [studentId]);

        res.json({
            stats: statsRes.rows[0],
            history: historyRes.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
}

/**
 * getBatchAnalytics(req, res)
 * GET /api/analytics/batches/:batchId
 * Roles: trainer, hr, super_admin
 */
async function getBatchAnalytics(req, res) {
    const { batchId } = req.params;
    const client = await pool.connect();
    
    try {
        await client.query('SET app.current_user_id = $1', [req.user.user_id]);
        await client.query('SET app.current_user_role = $1', [req.user.role]);

        // Get all students in the batch and their task completion counts
        const studentsRes = await client.query(`
            SELECT 
                u.id as student_id,
                u.name as student_name,
                (SELECT COUNT(*) FROM tasks t 
                 WHERE t.batch_id = $1 AND t.is_published = TRUE 
                 AND (t.target_student_id IS NULL OR t.target_student_id = u.id)) as total_assigned,
                (SELECT COUNT(*) FROM task_submissions ts 
                 JOIN tasks t ON ts.task_id = t.id
                 WHERE t.batch_id = $1 AND ts.student_id = u.id) as completed_count
            FROM users u
            JOIN enrollments e ON u.id = e.student_id
            WHERE e.batch_id = $1 AND e.status = 'active'
        `, [batchId]);

        res.json({
            batch_id: batchId,
            students: studentsRes.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
}

/**
 * getGlobalStats(req, res)
 * GET /api/analytics/global
 * Roles: hr, super_admin
 */
async function getGlobalStats(req, res) {
    const client = await pool.connect();
    try {
        await client.query('SET app.current_user_id = $1', [req.user.user_id]);
        await client.query('SET app.current_user_role = $1', [req.user.role]);

        const statsRes = await client.query(`
            SELECT 
                (SELECT COUNT(*) FROM courses) as total_courses,
                (SELECT COUNT(*) FROM batches WHERE is_active = TRUE) as active_batches,
                (SELECT COUNT(*) FROM users WHERE role = 'student') as total_students,
                (SELECT COUNT(*) FROM task_submissions) as total_submissions
        `);

        res.json(statsRes.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
}

module.exports = {
    getStudentStats,
    getBatchAnalytics,
    getGlobalStats
};
