// ==========================================================================
// ACADENO LMS — EPIC-03 Seed Data
// ==========================================================================
// Seeds courses, batches, and test users (BDA, HR) for registration testing.
// Run: node seed_registration.js
// ==========================================================================

require('dotenv').config();
const { pool } = require('./src/db/index');
const bcrypt = require('bcrypt');

(async () => {
  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    console.log('--- Seeding EPIC-03 Registration Data ---\n');

    // ---- 1. Create test users (BDA, HR) ----
    const passwordHash = await bcrypt.hash('Password123!', 12);

    // HR user
    await client.query(
      `INSERT INTO users (email, password_hash, role, is_active, mfa_enabled)
       VALUES ($1, $2, 'hr', TRUE, FALSE)
       ON CONFLICT (email) DO NOTHING`,
      ['hr@acadeno.com', passwordHash]
    );
    console.log('✓ HR user: hr@acadeno.com / Password123!');

    // BDA user
    await client.query(
      `INSERT INTO users (email, password_hash, role, is_active, mfa_enabled)
       VALUES ($1, $2, 'bda', TRUE, FALSE)
       ON CONFLICT (email) DO NOTHING`,
      ['bda@acadeno.com', passwordHash]
    );
    console.log('✓ BDA user: bda@acadeno.com / Password123!');

    // Trainer user
    await client.query(
      `INSERT INTO users (email, password_hash, role, is_active, mfa_enabled)
       VALUES ($1, $2, 'trainer', TRUE, FALSE)
       ON CONFLICT (email) DO NOTHING`,
      ['trainer@acadeno.com', passwordHash]
    );
    console.log('✓ Trainer user: trainer@acadeno.com / Password123!');

    // Get trainer ID for batch assignment
    const trainerResult = await client.query(
      `SELECT id FROM users WHERE email = 'trainer@acadeno.com'`
    );
    const trainerId = trainerResult.rows[0]?.id;

    // ---- 2. Seed courses ----
    const courses = [
      { name: 'Full Stack Web Development', description: 'Learn React, Node.js, PostgreSQL, and DevOps in 16 weeks.', duration_weeks: 16, base_fee: 49999.00 },
      { name: 'Data Science with Python',   description: 'Master Python, Pandas, ML, and Deep Learning in 12 weeks.', duration_weeks: 12, base_fee: 39999.00 },
      { name: 'Cloud & DevOps Engineering', description: 'AWS, Docker, Kubernetes, CI/CD pipelines in 10 weeks.',    duration_weeks: 10, base_fee: 44999.00 },
    ];

    for (const course of courses) {
      await client.query(
        `INSERT INTO courses (name, description, duration_weeks, base_fee, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (name) DO NOTHING`,
        [course.name, course.description, course.duration_weeks, course.base_fee]
      );
      console.log(`✓ Course: ${course.name} (₹${course.base_fee})`);
    }

    // ---- 3. Seed batches ----
    const courseResults = await client.query(
      `SELECT id, name FROM courses WHERE is_active = TRUE ORDER BY name ASC`
    );

    for (const course of courseResults.rows) {
      // Batch A — with capacity
      await client.query(
        `INSERT INTO batches (course_id, name, schedule, trainer_id, capacity, enrolled_count, start_date, end_date, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
         ON CONFLICT DO NOTHING`,
        [
          course.id,
          `${course.name.split(' ')[0]}-Batch-A`,
          'Mon/Wed/Fri 10:00 AM - 12:00 PM',
          trainerId,
          30,
          5,
          '2026-04-01',
          '2026-07-31',
        ]
      );

      // Batch B — nearly full
      await client.query(
        `INSERT INTO batches (course_id, name, schedule, trainer_id, capacity, enrolled_count, start_date, end_date, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
         ON CONFLICT DO NOTHING`,
        [
          course.id,
          `${course.name.split(' ')[0]}-Batch-B`,
          'Tue/Thu/Sat 2:00 PM - 4:00 PM',
          trainerId,
          25,
          24,
          '2026-05-01',
          '2026-08-31',
        ]
      );

      // Batch C — full (for testing BATCH_FULL error)
      await client.query(
        `INSERT INTO batches (course_id, name, schedule, trainer_id, capacity, enrolled_count, start_date, end_date, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
         ON CONFLICT DO NOTHING`,
        [
          course.id,
          `${course.name.split(' ')[0]}-Batch-C`,
          'Weekdays 6:00 PM - 8:00 PM',
          trainerId,
          20,
          20,
          '2026-04-15',
          '2026-07-15',
        ]
      );

      console.log(`✓ 3 batches seeded for: ${course.name}`);
    }

    console.log('\n--- Seeding Complete ---');
    console.log('You can now log in as:');
    console.log('  HR:      hr@acadeno.com / Password123!');
    console.log('  BDA:     bda@acadeno.com / Password123!');
    console.log('  Admin:   admin@acadeno.com / Admin123!');

  } catch (e) {
    console.error('Error running seed:', e.message);
  } finally {
    client.release();
    pool.end();
  }
})();
