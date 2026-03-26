// ==========================================================================
// ACADENO LMS — Certificate Generation Job (EPIC-06)
// ==========================================================================
// Triggered on-demand when a student's course completion_pct reaches the
// certificate threshold (100%).  Idempotent: if a certificate already exists
// for the (student_id, enrollment_id) pair it exits silently.
//
// Patterns followed (EPIC-01 baseline):
//   - pool.connect() + SET app.current_user_role for every query
//   - Hungarian notation for all local variables
//   - Bouncer Pattern: guard checks at the top of each function
//   - Zero magic values: all constants declared at top of module
//
// Usage:
//   const certificateJob = require('../jobs/certificateJob');
//   await certificateJob.generateCertificate({ studentId, enrollmentId, courseId });
// ==========================================================================

const crypto               = require('crypto');
const { pool }             = require('../db/index');
const certificateGenerator = require('../utils/certificateGenerator');

// ---------------------------------------------------------------------------
// Constants (Zero Magic Values Rule)
// ---------------------------------------------------------------------------
const STR_ROLE_SUPER_ADMIN  = 'super_admin';

// ---------------------------------------------------------------------------
// generateCertificate({ studentId, enrollmentId, courseId })
// ---------------------------------------------------------------------------
// Orchestrates the full certificate lifecycle:
//   1. Guard — skip if certificate already exists (idempotency).
//   2. Fetch student name and course name.
//   3. Generate a UUID verification token.
//   4. Write the certificate file via certificateGenerator.
//   5. Persist the certificate record to the `certificates` table.
//
// @param {object} opts
// @param {string} opts.studentId    - users.id of the student
// @param {string} opts.enrollmentId - enrollments.id
// @param {string} opts.courseId     - courses.id
// ---------------------------------------------------------------------------
async function generateCertificate({ studentId, enrollmentId, courseId }) {
  // Bouncer: all three IDs are required
  if (!studentId || !enrollmentId || !courseId) {
    throw new Error('generateCertificate: studentId, enrollmentId, and courseId are required');
  }

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    // ---- 1. Idempotency guard — skip if already generated ----
    const objExistingResult = await client.query(
      `SELECT id
         FROM certificates
        WHERE student_id    = $1
          AND enrollment_id = $2`,
      [studentId, enrollmentId]
    );

    if (objExistingResult.rows.length > 0) {
      // Certificate already exists — nothing to do
      return;
    }

    // ---- 2. Fetch student name and course name ----
    const objDetailsResult = await client.query(
      `SELECT
           s.first_name,
           s.last_name,
           c.name AS course_name
         FROM students    s
         JOIN enrollments e ON e.student_id = s.id
         JOIN courses     c ON e.course_id  = c.id
        WHERE s.user_id = $1
          AND e.id      = $2`,
      [studentId, enrollmentId]
    );

    if (objDetailsResult.rows.length === 0) {
      // Student or enrollment record not found — abort silently
      console.error(
        `certificateJob: could not resolve student/enrollment details for ` +
        `studentId=${studentId}, enrollmentId=${enrollmentId}`
      );
      return;
    }

    const objDetails     = objDetailsResult.rows[0];
    const strStudentName = `${objDetails.first_name} ${objDetails.last_name || ''}`.trim();
    const strCourseName  = objDetails.course_name;

    // ---- 3. Generate a unique verification token ----
    const strVerificationToken = crypto.randomUUID();
    const strCompletedAt       = new Date().toISOString();

    // ---- 4. Write certificate file to local disk ----
    const strCertUrl = await certificateGenerator.generateCertificate({
      studentName:       strStudentName,
      courseName:        strCourseName,
      completedAt:       strCompletedAt,
      verificationToken: strVerificationToken,
    });

    // ---- 5. Persist certificate record ----
    await client.query(
      `INSERT INTO certificates
           (student_id, enrollment_id, certificate_url, public_verification_token, generated_at)
         VALUES ($1, $2, $3, $4, NOW())`,
      [studentId, enrollmentId, strCertUrl, strVerificationToken]
    );

    console.log(
      `certificateJob: certificate generated for studentId=${studentId}, ` +
      `enrollmentId=${enrollmentId}, token=${strVerificationToken}`
    );

  } catch (err) {
    console.error('certificateJob generateCertificate error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Constants for checkAndGenerateCertificate
// ---------------------------------------------------------------------------
const INT_CERTIFICATE_COMPLETION_THRESHOLD = 100; // percent
const STR_CONTENT_STATUS_PUBLISHED         = 'published';
const STR_ENROLLMENT_STATUS_ACTIVE         = 'active';
const INT_COMPLETION_PCT_SCALE             = 100;

// ---------------------------------------------------------------------------
// checkAndGenerateCertificate({ studentId, enrollmentId }) → { generated, certificateUrl }
// ---------------------------------------------------------------------------
// Called on-demand (e.g. after content progress update).
// 1. Calculates current completion_pct for the enrollment.
// 2. If >= CERTIFICATE_COMPLETION_THRESHOLD:
//    a. Checks idempotency (certificate already exists?)
//    b. Calls generateCertificate() to write the file
//    c. INSERTs certificate record
//    d. Sends certificate email to the student
// Returns { generated: boolean, certificateUrl: string|null }
// ---------------------------------------------------------------------------
async function checkAndGenerateCertificate({ studentId, enrollmentId }) {
  // Bouncer: required params
  if (!studentId || !enrollmentId) {
    throw new Error('checkAndGenerateCertificate: studentId and enrollmentId are required');
  }

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    // ---- 1. Resolve course for this enrollment ----
    const objEnrollResult = await client.query(
      `SELECT e.course_id
         FROM enrollments e
        WHERE e.id     = $1
          AND e.status = $2
        LIMIT 1`,
      [enrollmentId, STR_ENROLLMENT_STATUS_ACTIVE]
    );

    if (objEnrollResult.rows.length === 0) {
      return { generated: false, certificateUrl: null };
    }

    const strCourseId = objEnrollResult.rows[0].course_id;

    // ---- 2. Calculate current completion_pct ----
    const objCountResult = await client.query(
      `SELECT
           COUNT(ci.id)  AS total_items,
           COUNT(cp.content_item_id) FILTER (WHERE cp.is_completed = TRUE) AS completed_items
         FROM content_items ci
         JOIN sub_modules   sm ON ci.sub_module_id = sm.id
         JOIN modules        m ON sm.module_id     = m.id
         LEFT JOIN content_progress cp
               ON  cp.content_item_id = ci.id
               AND cp.student_id      = $2
        WHERE m.course_id = $1
          AND ci.status   = $3`,
      [strCourseId, studentId, STR_CONTENT_STATUS_PUBLISHED]
    );

    const intTotal = parseInt(objCountResult.rows[0].total_items,     10) || 0;
    const intDone  = parseInt(objCountResult.rows[0].completed_items, 10) || 0;
    const intPct   = intTotal > 0
      ? Math.round((intDone / intTotal) * INT_COMPLETION_PCT_SCALE)
      : 0;

    if (intPct < INT_CERTIFICATE_COMPLETION_THRESHOLD) {
      return { generated: false, certificateUrl: null };
    }

    // ---- 3. Idempotency: skip if already generated ----
    const objExistResult = await client.query(
      `SELECT id, certificate_url, public_verification_token
         FROM certificates
        WHERE student_id    = $1
          AND enrollment_id = $2
        LIMIT 1`,
      [studentId, enrollmentId]
    );

    if (objExistResult.rows.length > 0) {
      return {
        generated:      false,
        certificateUrl: objExistResult.rows[0].certificate_url,
      };
    }

    // ---- 4. Fetch student + trainer details for certificate content ----
    const objDetailsResult = await client.query(
      `SELECT
           s.first_name,
           s.last_name,
           s.email,
           c.name    AS course_name,
           u.email   AS trainer_email
         FROM students    s
         JOIN enrollments e  ON e.student_id  = s.id
         JOIN courses     c  ON e.course_id   = c.id
         JOIN batches     b  ON e.batch_id    = b.id
         JOIN users       u  ON b.trainer_id  = u.id
        WHERE s.user_id = $1
          AND e.id      = $2
        LIMIT 1`,
      [studentId, enrollmentId]
    );

    if (objDetailsResult.rows.length === 0) {
      console.error(
        `checkAndGenerateCertificate: could not resolve details for ` +
        `studentId=${studentId}, enrollmentId=${enrollmentId}`
      );
      return { generated: false, certificateUrl: null };
    }

    const objDetails     = objDetailsResult.rows[0];
    const strStudentName = `${objDetails.first_name} ${objDetails.last_name || ''}`.trim();
    const strCourseName  = objDetails.course_name;
    const strTrainerName = objDetails.trainer_email;
    const strStudentEmail = objDetails.email;
    const strCompletedAt  = new Date().toISOString();
    const strVerificationToken = crypto.randomUUID();

    // ---- 5. Generate the certificate file ----
    const strCertUrl = await certificateGenerator.generateCertificate({
      studentName:       strStudentName,
      courseName:        strCourseName,
      completedAt:       strCompletedAt,
      verificationToken: strVerificationToken,
    });

    // ---- 6. Persist certificate record ----
    await client.query(
      `INSERT INTO certificates
           (student_id, enrollment_id, certificate_url, public_verification_token, generated_at)
         VALUES ($1, $2, $3, $4, NOW())`,
      [studentId, enrollmentId, strCertUrl, strVerificationToken]
    );

    // ---- 7. Send certificate email (non-blocking on failure) ----
    const strFrontendUrl   = process.env.FRONTEND_URL || 'http://localhost:3002';
    const strVerifyUrl     = `${strFrontendUrl}/api/student/certificates/verify/${strVerificationToken}`;
    const strCompletionDate = new Date(strCompletedAt).toLocaleDateString('en-IN', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    try {
      const emailService = require('../services/emailService');
      await emailService.sendCertificateEmail(
        strStudentEmail,
        strStudentName,
        strCourseName,
        strCompletionDate,
        strVerifyUrl
      );
    } catch (emailErr) {
      // Email failure must never block certificate generation
      console.error('checkAndGenerateCertificate: email send failed:', emailErr.message);
    }

    console.log(
      `checkAndGenerateCertificate: certificate generated for studentId=${studentId}, ` +
      `enrollmentId=${enrollmentId}, token=${strVerificationToken}`
    );

    return { generated: true, certificateUrl: strCertUrl };

  } catch (err) {
    console.error('checkAndGenerateCertificate error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { generateCertificate, checkAndGenerateCertificate };
