// ==========================================================================
// ACADENO LMS — Analytics & Stats Controller (EPIC-05)
// ==========================================================================
const { pool } = require('../db/index');
const PDFDocument = require('pdfkit');

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
        await client.query("SELECT set_config('app.current_user_id', $1::text, false)", [req.user.user_id]);
        await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);

        // 1. Get task completion stats
        const statsRes = await client.query(`
            SELECT 
                COUNT(t.id) as total_tasks,
                COUNT(ts.id) as completed_tasks,
                AVG(ts.score) as avg_score
            FROM tasks t
            LEFT JOIN task_submissions ts ON t.id = ts.task_id AND ts.student_id = $1
            WHERE (t.target_student_id IS NULL OR t.target_student_id = $1)
            AND t.is_published = true
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
            AND t.is_published = true
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
        await client.query("SELECT set_config('app.current_user_id', $1::text, false)", [req.user.user_id]);
        await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);

        // Get all students in the batch and their task completion counts
        const studentsRes = await client.query(`
            SELECT 
                u.id as student_id,
                u.full_name as student_name,
                (SELECT COUNT(*) FROM tasks t 
                 WHERE t.batch_id = $1 AND t.is_published = true
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
        await client.query("SELECT set_config('app.current_user_id', $1::text, false)", [req.user.user_id]);
        await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);

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

/**
 * exportBatchPerformanceReport(req, res)
 * GET /api/analytics/batches/:batchId/export
 */
async function exportBatchPerformanceReport(req, res) {
    const { batchId } = req.params;
    const format = req.query.format || 'csv';
    const client = await pool.connect();
    
    try {
        await client.query("SELECT set_config('app.current_user_id', $1::text, false)", [req.user.user_id]);
        await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);

        // 1. Get Batch & Task Details
        const batchRes = await client.query(`
            SELECT b.name as batch_name, c.name as course_name, u.full_name as trainer_name
            FROM batches b
            JOIN courses c ON b.course_id = c.id
            JOIN users u ON b.trainer_id = u.id
            WHERE b.id = $1
        `, [batchId]);

        if (batchRes.rows.length === 0) {
            return res.status(404).json({ error: 'Batch not found' });
        }
        const batchInfo = batchRes.rows[0];

        const tasksRes = await client.query(`
            SELECT id, title, max_score, due_date
            FROM tasks
            WHERE batch_id = $1 AND is_published = true
            ORDER BY created_at ASC
        `, [batchId]);
        const tasks = tasksRes.rows;

        // 2. Get Students and their Submissions
        const studentsRes = await client.query(`
            SELECT 
                u.id as user_id, 
                u.full_name as name, 
                u.email, 
                s.registration_number
            FROM users u
            JOIN students s ON u.id = s.user_id
            JOIN enrollments e ON s.id = e.student_id
            WHERE e.batch_id = $1 AND e.status = 'active'
            ORDER BY u.full_name ASC
        `, [batchId]);
        const students = studentsRes.rows;

        const submissionsRes = await client.query(`
            SELECT ts.*
            FROM task_submissions ts
            JOIN tasks t ON ts.task_id = t.id
            WHERE t.batch_id = $1
        `, [batchId]);
        const submissions = submissionsRes.rows;

        // Build mapping for easy lookup
        const subMap = {};
        submissions.forEach(s => {
            if (!subMap[s.student_id]) subMap[s.student_id] = {};
            subMap[s.student_id][s.task_id] = s;
        });

        // 3. Prepare Report Data
        const reportData = students.map(student => {
            let completedTasks = 0;
            let totalScore = 0;
            const taskData = tasks.map(task => {
                const sub = subMap[student.user_id]?.[task.id];
                if (sub && sub.status === 'evaluated') completedTasks++;
                if (sub && sub.score) totalScore += Number(sub.score);
                return {
                    title: task.title,
                    score: sub ? sub.score : '-',
                    submitted_at: sub ? new Date(sub.submitted_at).toLocaleDateString() : 'N/A'
                };
            });

            const completionRate = tasks.length > 0 ? ((completedTasks / tasks.length) * 100).toFixed(2) : 0;

            return {
                name: student.name,
                reg_no: student.registration_number || 'N/A',
                email: student.email,
                completion_rate: `${completionRate}%`,
                tasks: taskData
            };
        });

        // 4. Generate Output
        if (format === 'pdf') {
            const doc = new PDFDocument({ margin: 50 });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=Performance_Report_${batchInfo.batch_name.replace(/\s+/g, '_')}.pdf`);
            doc.pipe(res);

            // PDF Header
            doc.fontSize(20).text('Batch Performance Report', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Course: ${batchInfo.course_name}`);
            doc.text(`Batch: ${batchInfo.batch_name}`);
            doc.text(`Trainer: ${batchInfo.trainer_name}`);
            doc.text(`Generated On: ${new Date().toLocaleString()}`);
            doc.moveDown();
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown();

            // Student Table
            reportData.forEach((s, idx) => {
                if (doc.y > 700) doc.addPage();
                doc.fontSize(11).font('Helvetica-Bold').text(`${idx + 1}. ${s.name} (${s.reg_no})`, { underline: true });
                doc.font('Helvetica').fontSize(10).text(`Email: ${s.email} | Completion: ${s.completion_rate}`);
                
                // Task brief
                let taskSummary = s.tasks.map(t => `${t.title}: ${t.score}`).join(' | ');
                doc.fontSize(9).fillColor('#4b5563').text(taskSummary);
                doc.fillColor('black');
                doc.moveDown(0.5);
            });

            doc.end();
        } else {
            // CSV Generation
            let csvHeaders = ['Student Name', 'Reg Number', 'Email', 'Completion %'];
            tasks.forEach(t => {
                csvHeaders.push(`${t.title} Score`);
                csvHeaders.push(`${t.title} Date`);
            });

            let csvRows = reportData.map(s => {
                let row = [s.name, s.reg_no, s.email, s.completion_rate];
                s.tasks.forEach(t => {
                    row.push(t.score);
                    row.push(t.submitted_at);
                });
                return row.map(cell => `"${cell}"`).join(',');
            });

            const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=Performance_Report_${batchInfo.batch_name.replace(/\s+/g, '_')}.csv`);
            res.send(csvContent);
        }

    } catch (err) {
        console.error('Export error:', err.message);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
}

/**
 * getStudentTimeline(req, res)
 * GET /api/analytics/students/:studentId/timeline
 */
async function getStudentTimeline(req, res) {
    const { studentId } = req.params;
    const client = await pool.connect();
    
    try {
        await client.query("SELECT set_config('app.current_user_id', $1::text, false)", [req.user.user_id]);
        await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);

        // 1. Get chronological activity
        const timelineRes = await client.query(`
            WITH activity AS (
                -- Content Accessed
                SELECT 
                    'content_access' as type,
                    ci.title as title,
                    cp.last_accessed_at as event_date,
                    'Accessed content item' as action,
                    ci.content_type as metadata
                FROM content_progress cp
                JOIN content_items ci ON cp.content_item_id = ci.id
                WHERE cp.student_id = $1

                UNION ALL

                -- Content Completed
                SELECT 
                    'content_completion' as type,
                    ci.title as title,
                    cp.completed_at as event_date,
                    'Finished learning item' as action,
                    ci.content_type as metadata
                FROM content_progress cp
                JOIN content_items ci ON cp.content_item_id = ci.id
                WHERE cp.student_id = $1 AND cp.is_completed = TRUE

                UNION ALL

                -- Task Submitted
                SELECT 
                    'task_submission' as type,
                    t.title as title,
                    ts.submitted_at as event_date,
                    'Submitted work' as action,
                    t.task_type as metadata
                FROM task_submissions ts
                JOIN tasks t ON ts.task_id = t.id
                WHERE ts.student_id = $1

                UNION ALL

                -- Task Evaluated
                SELECT 
                    'task_evaluation' as type,
                    t.title as title,
                    ts.evaluated_at as event_date,
                    'Graded: ' || ts.score || '/' || t.max_score as action,
                    t.task_type as metadata
                FROM task_submissions ts
                JOIN tasks t ON ts.task_id = t.id
                WHERE ts.student_id = $1 AND ts.status = 'evaluated'
            )
            SELECT * FROM activity 
            WHERE event_date IS NOT NULL
            ORDER BY event_date DESC
        `, [studentId]);

        // 2. Compute completion trend (Optional but nice for visualization)
        // Just send the raw timeline for now, UI can handle the rest.

        // 3. Get Student Info
        const infoRes = await client.query(`
            SELECT u.full_name as name, u.email, s.registration_number
            FROM users u
            JOIN students s ON u.id = s.user_id
            WHERE u.id = $1
        `, [studentId]);

        res.json({
            student: infoRes.rows[0],
            timeline: timelineRes.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
}

module.exports = {
    getStudentStats,
    getBatchAnalytics,
    getGlobalStats,
    exportBatchPerformanceReport,
    getStudentTimeline
};
