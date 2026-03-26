const { pool } = require('./src/db/index');
const bcrypt = require('bcrypt');

async function seedVisualTestData() {
    console.log('--- Seeding Data for Visual Verification ---');
    const client = await pool.connect();

    try {
        await client.query("SELECT set_config('app.current_user_role', 'super_admin', false)");
        const passwordHash = await bcrypt.hash('Password123!', 10);

        // 1. Create Super Admin
        console.log('Creating Super Admin: admin@example.com / Password123!');
        await client.query(`
            INSERT INTO users (email, password_hash, role, is_active, full_name)
            VALUES ($1, $2, 'super_admin', TRUE, 'System Administrator')
            ON CONFLICT (email) DO UPDATE SET role = 'super_admin'
        `, ['admin@example.com', passwordHash]);

        // 2. Create HR
        console.log('Creating HR: hr@example.com / Password123!');
        await client.query(`
            INSERT INTO users (email, password_hash, role, is_active, full_name)
            VALUES ($1, $2, 'hr', TRUE, 'HR Manager')
            ON CONFLICT (email) DO UPDATE SET role = 'hr'
        `, ['hr@example.com', passwordHash]);

        // 3. Create Trainer
        console.log('Creating Trainer: trainer@example.com / Password123!');
        const trainerRes = await client.query(`
            INSERT INTO users (email, password_hash, role, is_active, full_name)
            VALUES ($1, $2, 'trainer', TRUE, 'Senior Trainer')
            ON CONFLICT (email) DO UPDATE SET role = 'trainer'
            RETURNING id
        `, ['trainer@example.com', passwordHash]);
        const trainerId = trainerRes.rows[0].id;

        // 4. Create Student
        console.log('Creating Student: student@example.com / Password123!');
        const studentRes = await client.query(`
            INSERT INTO users (email, password_hash, role, is_active, full_name)
            VALUES ($1, $2, 'student', TRUE, 'Test Student')
            ON CONFLICT (email) DO UPDATE SET role = 'student'
            RETURNING id
        `, ['student@example.com', passwordHash]);
        const studentId = studentRes.rows[0].id;

        // 5. Create some Audit Logs
        console.log('Seeding initial Audit Logs...');
        await client.query(`
            INSERT INTO audit_logs (actor_id, action_type, resource_type, status, details, ip_address)
            VALUES 
            ($1, 'LOGIN', 'auth', 'success', '{"browser": "Chrome"}', '127.0.0.1'),
            ($2, 'COURSE_UPDATE', 'courses', 'success', '{"courseId": "all"}', '127.0.0.1')
        `, [trainerId, studentId]);

        console.log('--- Visual Test Seeding Complete! ---');
        console.log('Login credentials for all roles: Password123!');

    } catch (err) {
        console.error('SEEDING FAILED:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

seedVisualTestData();
