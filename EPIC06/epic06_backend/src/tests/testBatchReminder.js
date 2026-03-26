// ==========================================================================
// ACADENO LMS — Batch Start Reminder Verification (US-NOT-05)
// ==========================================================================
const { pool } = require('../db/index');
const { processBatchStartReminders } = require('../jobs/batchStartJob');

async function verifyBatchStartReminders() {
    console.log('--- Starting Batch Start Reminder Verification ---');
    const client = await pool.connect();

    try {
        await client.query("SET app.current_user_role = 'super_admin'");
        // 1. Setup Mock Data
        // Find or create an active course
        let resCourse = await client.query('SELECT id, name FROM courses LIMIT 1');
        let courseId;
        if (resCourse.rows.length === 0) {
            const resNewCourse = await client.query(`
                INSERT INTO courses (name, description, duration_weeks, is_active)
                VALUES ('Test Course', 'Description', 4, TRUE)
                RETURNING id
            `);
            courseId = resNewCourse.rows[0].id;
        } else {
            courseId = resCourse.rows[0].id;
        }

        // Find or create a trainer
        let resTrainer = await client.query("SELECT id, email FROM users WHERE role = 'trainer' LIMIT 1");
        let trainerId;
        if (resTrainer.rows.length === 0) {
            const resNewTrainer = await client.query(`
                INSERT INTO users (email, password_hash, role, is_verified)
                VALUES ('test_trainer@acadeno.com', 'hash', 'trainer', TRUE)
                RETURNING id
            `);
            trainerId = resNewTrainer.rows[0].id;
        } else {
            trainerId = resTrainer.rows[0].id;
        }

        // Create a batch starting in 2 days
        const startDate = new Date();
        startDate.setDate(startDate.getDate() + 2);
        
        const batchName = `Test Batch ${Date.now()}`;
        const resBatch = await client.query(`
            INSERT INTO batches (name, course_id, trainer_id, start_date, is_active, schedule_type, class_days, class_time_start)
            VALUES ($1, $2, $3, $4, TRUE, 'weekday', $5, '10:00:00')
            RETURNING id
        `, [batchName, courseId, trainerId, startDate, JSON.stringify(['Mon', 'Wed', 'Fri'])]);
        const batchId = resBatch.rows[0].id;

        // Find or create a student
        let resStudent = await client.query("SELECT s.id, u.email, u.id as user_id FROM students s JOIN users u ON s.user_id = u.id LIMIT 1");
        let studentId;
        if (resStudent.rows.length === 0) {
             const resUser = await client.query(`INSERT INTO users (email, password_hash, role, is_verified) VALUES ('test_student@acadeno.com', 'hash', 'student', TRUE) RETURNING id`);
             const resNewStudent = await client.query(`INSERT INTO students (user_id, first_name, last_name) VALUES ($1, 'Test', 'Student') RETURNING id`, [resUser.rows[0].id]);
             studentId = resNewStudent.rows[0].id;
        } else {
            studentId = resStudent.rows[0].id;
        }

        await client.query(`
            INSERT INTO enrollments (student_id, batch_id, course_id, base_fee, gst_amount, total_fee, status) 
            VALUES ($1, $2, $3, 1000.00, 180.00, 1180.00, 'active') 
            ON CONFLICT DO NOTHING
        `, [studentId, batchId, courseId]);

        console.log(`Mock batch created: ${batchName} starting on ${startDate.toISOString().split('T')[0]}`);

        // 2. Execute Job
        await processBatchStartReminders();

        console.log('SUCCESS: Batch start reminder job executed logically.');
        
        // 3. Cleanup
        await client.query('DELETE FROM enrollments WHERE batch_id = $1', [batchId]);
        await client.query('DELETE FROM batches WHERE id = $1', [batchId]);

    } catch (err) {
        console.error('VERIFICATION FAILED:', err.message);
    } finally {
        console.log('--- Verification Finished ---');
        client.release();
        process.exit();
    }
}

verifyBatchStartReminders();
