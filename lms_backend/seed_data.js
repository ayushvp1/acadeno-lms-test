require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const fs = require('fs');
const logFile = './seed_log.txt';

function log(msg) {
  console.log(msg);
  fs.appendFileSync(logFile, msg + '\n');
}

async function seedData() {
  fs.writeFileSync(logFile, 'SEED START\n');
  const localPool = new Pool({ connectionString: process.env.DATABASE_URL });
  let client;
  try {
    log('Connecting to DB');
    client = await localPool.connect();
    log('DB Connected');
    
    log('Hashing password');
    const hashedPass = await bcrypt.hash('Acadeno@123', 8);
    log('Password hashed');

    await client.query("SELECT set_config('app.current_user_role', 'super_admin', false)");
    log('Admin role set in session');
    
    log('Removing old data...');
    const tables = [
        'trusted_devices', 'refresh_tokens', 'enrollments', 'students', 
        'trainer_course_pool', 'batches', 'content_items', 'sub_modules', 
        'modules', 'lead_notes', 'lead_status_history', 'leads', 'courses', 'users', 'system_settings'
    ];
    for (const table of tables) {
        try {
            await client.query(`DELETE FROM ${table} CASCADE`);
        } catch (e) {}
    }
    log('DB Cleanup finished');

    log('Seeding users...');
    const adminRes = await client.query("INSERT INTO users (email, password_hash, role) VALUES ('admin@acadeno.com', $1, 'super_admin') RETURNING id", [hashedPass]);
    const hrRes = await client.query("INSERT INTO users (email, password_hash, role) VALUES ('hr@acadeno.com', $1, 'hr') RETURNING id", [hashedPass]);
    const bdaRes = await client.query("INSERT INTO users (email, password_hash, role) VALUES ('bda@acadeno.com', $1, 'bda') RETURNING id", [hashedPass]);
    const trainer1Res = await client.query("INSERT INTO users (email, password_hash, role) VALUES ('trainer1@acadeno.com', $1, 'trainer') RETURNING id", [hashedPass]);
    const student1Res = await client.query("INSERT INTO users (email, password_hash, role) VALUES ('student@acadeno.com', $1, 'student') RETURNING id", [hashedPass]);

    const adminId = adminRes.rows[0].id;
    const hrId = hrRes.rows[0].id;
    const bdaId = bdaRes.rows[0].id;
    const trainer1Id = trainer1Res.rows[0].id;
    const studentUserId = student1Res.rows[0].id;

    log('Seeding courses...');
    const course1Res = await client.query("INSERT INTO courses (name, description, base_fee, duration_weeks) VALUES ('Full Stack Web Development', 'MERN stack training program', 45000, 24) RETURNING id");
    const course1Id = course1Res.rows[0].id;

    log('Seeding modules...');
    const mod1Res = await client.query("INSERT INTO modules (course_id, title, position) VALUES ($1, 'HTML & CSS Foundations', 1) RETURNING id", [course1Id]);
    const subMod1Res = await client.query("INSERT INTO sub_modules (module_id, title, position) VALUES ($1, 'Semantic HTML5', 1) RETURNING id", [mod1Res.rows[0].id]);
    await client.query("INSERT INTO content_items (sub_module_id, title, content_type, status, position, created_by) VALUES ($1, 'Introduction to HTML', 'pdf', 'published', 1, $2)", [subMod1Res.rows[0].id, trainer1Id]);

    log('Seeding batches...');
    const batch1Res = await client.query(`INSERT INTO batches (course_id, name, start_date, end_date, capacity, trainer_id, is_active) VALUES ($1, 'WEB-BATCH-A', '2024-03-20', '2024-09-20', 30, $2, TRUE) RETURNING id`, [course1Id, trainer1Id]);
    const batch1Id = batch1Res.rows[0].id;

    log('Seeding trainer pool...');
    await client.query("INSERT INTO trainer_course_pool (course_id, trainer_id, added_by) VALUES ($1, $2, $3)", [course1Id, trainer1Id, adminId]);

    log('Seeding students...');
    const studRes = await client.query(`
        INSERT INTO students (user_id, registration_number, first_name, last_name, date_of_birth, gender, email, phone) 
        VALUES ($1, 'AC-STUD-001', 'Aswathy', 'Nair', '2000-01-01', 'female', 'student@acadeno.com', '9876543210') 
        RETURNING id`, 
        [studentUserId]
    );
    const studentId = studRes.rows[0].id;

    log('Seeding enrollments...');
    await client.query(`
        INSERT INTO enrollments (student_id, course_id, batch_id, base_fee, gst_amount, total_fee, status) 
        VALUES ($1, $2, $3, 45000, 8100, 53100, 'active')`,
        [studentId, course1Id, batch1Id]
    );

    log('Seeding leads...');
    // Correct columns: bda_id, full_name, email, phone, course_interest, lead_source, status
    await client.query(`
        INSERT INTO leads (bda_id, full_name, email, phone, course_interest, lead_source, status) 
        VALUES ($1, 'Rohan Kumar', 'rohan@gmail.com', '9988776655', 'Full Stack', 'Web Enquiry', 'new')`, 
        [bdaId]
    );
    await client.query(`
        INSERT INTO leads (bda_id, full_name, email, phone, course_interest, lead_source, status) 
        VALUES ($1, 'Priya Shah', 'priya@outlook.com', '8877665544', 'UI/UX', 'Referral', 'interested')`, 
        [bdaId]
    );

    log('Seeding settings...');
    await client.query("INSERT INTO system_settings (key, value, description) VALUES ('gst_rate', '18', 'GST Rate'), ('invoice_prefix', 'ACAD', 'Invoice Prefix') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value");

    log('✅ FULL SEEDING COMPLETE ✅');
    log('--------------------------------------------------');
    log('Admin:    admin@acadeno.com / Acadeno@123');
    log('HR:       hr@acadeno.com / Acadeno@123');
    log('BDA:      bda@acadeno.com / Acadeno@123');
    log('Trainer:  trainer1@acadeno.com / Acadeno@123');
    log('Student:  student@acadeno.com / Acadeno@123');
    log('--------------------------------------------------');
  } catch (err) {
    log('❌ SEED ERROR: ' + err.message);
    log(err.stack);
  } finally {
    if (client) client.release();
    await localPool.end();
    process.exit();
  }
}

seedData();
