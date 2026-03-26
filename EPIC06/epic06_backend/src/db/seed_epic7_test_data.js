const { pool } = require('./index');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_role', 'super_admin', false)");

    // 1. Get or Create a Trainer
    let trainerRes = await client.query("SELECT id, email FROM users WHERE role = 'trainer' LIMIT 1");
    let trainer;
    if (trainerRes.rows.length === 0) {
      console.log('No trainer found, creating one...');
      const neu = await client.query(`
        INSERT INTO users (email, password_hash, full_name, role, is_active)
        VALUES ('trainer@acadeno.com', '$2b$12$K7.pX3P5p.U4pP0/P7z.9.O.X.I.E.F.G.H.I.J.K.L.M.N.O.P', 'Test Trainer', 'trainer', true)
        RETURNING id, email, full_name
      `);
      trainer = neu.rows[0];
    } else {
      trainer = trainerRes.rows[0];
    }
    console.log(`Using Trainer: ${trainer.email} (${trainer.id})`);

    // 2. Get or Create a Course
    let courseRes = await client.query("SELECT id, name FROM courses LIMIT 1");
    let course;
    if (courseRes.rows.length === 0) {
      console.log('No course found, creating one...');
      const neu = await client.query(`
        INSERT INTO courses (name, description, duration_weeks, base_fee, is_active)
        VALUES ('Full Stack Web Development', 'Master HTML, CSS, JS, and Backend', 12, 15000, true)
        RETURNING id, name
      `);
      course = neu.rows[0];
    } else {
      course = courseRes.rows[0];
    }

    // 3. Create a Batch
    const batchCode = `FS-${Math.floor(Math.random() * 9000) + 1000}`;
    const batchRes = await client.query(`
      INSERT INTO batches (
        course_id, name, batch_code, schedule, schedule_type, 
        class_days, class_time_start, class_time_end,
        trainer_id, capacity, start_date, end_date, is_active, status
      ) VALUES ($1, $2, $3, 'Mon/Wed/Fri 10:00-12:00', 'weekday', 
        '["Mon", "Wed", "Fri"]', '10:00:00', '12:00:00',
        $4, 30, CURRENT_DATE, CURRENT_DATE + INTERVAL '90 days', true, 'active')
      RETURNING id, name
    `, [course.id, `Premium Full Stack ${batchCode}`, batchCode, trainer.id]);
    
    const batch = batchRes.rows[0];
    console.log(`Created Batch: ${batch.name} (${batch.id})`);

    // 4. Create a student and enroll them
    let studentUserRes = await client.query("SELECT id FROM users WHERE role = 'student' LIMIT 1");
    if (studentUserRes.rows.length === 0) {
        console.log('Creating test student user...');
        const stuUser = await client.query(`
            INSERT INTO users (email, password_hash, full_name, role, is_active)
            VALUES ('student@test.com', '$2b$12$K7.pX3P5p.U4pP0/P7z.9.O.X.I.E.F.G.H.I.J.K.L.M.N.O.P', 'Test Student', 'student', true)
            RETURNING id
        `);
        const stuProfile = await client.query(`
            INSERT INTO students (user_id, registration_number, first_name, last_name, date_of_birth, gender, phone, email)
            VALUES ($1, 'REG123', 'Test', 'Student', '2000-01-01', 'male', '1234567890', 'student@test.com')
            RETURNING id
        `, [stuUser.rows[0].id]);
        
        await client.query(`
            INSERT INTO enrollments (student_id, batch_id, course_id, base_fee, gst_amount, total_fee, status)
            VALUES ($1, $2, $3, 15000, 2700, 17700, 'active')
        `, [stuProfile.rows[0].id, batch.id, course.id]);
        console.log('Test student created and enrolled.');
    } else {
        // Find student profile
        const stuId = studentUserRes.rows[0].id;
        const profileRes = await client.query("SELECT id FROM students WHERE user_id = $1", [stuId]);
        if (profileRes.rows.length > 0) {
            await client.query(`
                INSERT INTO enrollments (student_id, batch_id, course_id, base_fee, gst_amount, total_fee, status)
                VALUES ($1, $2, $3, 15000, 2700, 17700, 'active')
                ON CONFLICT DO NOTHING
            `, [profileRes.rows[0].id, batch.id, course.id]);
            console.log('Existing student enrolled into new batch.');
        }
    }

    await client.query('COMMIT');
    console.log('Seed completed successfully!');
    console.log('--- TEST DETAILS ---');
    console.log(`Trainer Email: ${trainer.email || 'trainer@test.com'}`);
    console.log(`Batch Code: ${batchCode}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed error:', err);
  } finally {
    client.release();
    process.exit();
  }
}

seed();
