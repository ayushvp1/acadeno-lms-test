// ==========================================================================
// ACADENO LMS — Registration Controller
// ==========================================================================
// Handles all student registration endpoints: draft CRUD, step updates,
// final submit, list, and edit.
// All SQL queries are parameterized. No string concatenation in SQL.
// ==========================================================================

const crypto = require('crypto');
const { pool } = require('../db/index');
const { lookupPinCode } = require('../services/pinCodeService');
<<<<<<< HEAD
const { 
  sendPaymentLinkEmail, 
  sendWelcomeCredentialsEmail,
  sendEnrollmentSuccessEmail
} = require('../services/emailService');
const { generateTokens } = require('../utils/jwt');
const redis = require('../utils/redis');
=======
const { sendPaymentLinkEmail } = require('../services/emailService');
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
const { getUploadedFilePath } = require('../services/fileService');
const bcrypt = require('bcrypt');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MIN_AGE = 16;
const ADULT_AGE = 18;
const GST_RATE = 0.18;
const BCRYPT_ROUNDS = 12;

<<<<<<< HEAD
// Refresh token cookie options (matches authController)
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path:     '/api/auth', // Important: must match the refresh route mount point
  maxAge:   (parseInt(process.env.JWT_REFRESH_EXPIRY, 10) || 604800) * 1000,
};

=======
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
// ---------------------------------------------------------------------------
// Helper: calculate age from DOB
// ---------------------------------------------------------------------------
function calculateAge(dob) {
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

// ---------------------------------------------------------------------------
// Helper: generate registration number
// ---------------------------------------------------------------------------
function generateRegistrationNumber() {
  const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const randomPart = crypto.randomInt(1000, 9999).toString();
  return `REG-${datePart}-${randomPart}`;
}

// ---------------------------------------------------------------------------
// POST /api/registration/draft  (US-REG-01 + US-REG-09)
// ---------------------------------------------------------------------------
async function createDraft(req, res) {
  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const {
      first_name, last_name, date_of_birth, gender, phone, email,
      emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
      lead_id,
    } = req.body;

    // ---- Input validation ----
    if (!first_name || !date_of_birth || !gender || !phone || !email) {
      return res.status(400).json({
        error: 'First name, date of birth, gender, phone, and email are required',
        code:  'VALIDATION_ERROR',
      });
    }

    // ---- Email format validation ----
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format',
        code:  'VALIDATION_ERROR',
      });
    }

    // ---- Age validation (US-REG-01: minimum 16 years) ----
    const age = calculateAge(date_of_birth);
    if (age < MIN_AGE) {
      return res.status(400).json({
        error: 'Minimum age is 16 years',
        code:  'MIN_AGE_16',
      });
    }

    // ---- Emergency contact for minors (US-REG-09) ----
    if (age < ADULT_AGE) {
      if (!emergency_contact_name || !emergency_contact_relationship || !emergency_contact_phone) {
        return res.status(400).json({
          error: 'Emergency contact (name, relationship, phone) is required for students under 18',
          code:  'EMERGENCY_CONTACT_REQUIRED',
        });
      }
    }

    // ---- Duplicate email check ----
    const existingUser = await client.query(
      `SELECT id FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: 'This email already belongs to an existing user',
        code:  'EMAIL_DUPLICATE',
      });
    }

    // ---- Build personal details JSONB ----
    const personalDetails = {
      first_name,
      last_name: last_name || null,
      date_of_birth,
      gender,
      phone,
      email: email.toLowerCase().trim(),
      emergency_contact_name:         emergency_contact_name || null,
      emergency_contact_relationship: emergency_contact_relationship || null,
      emergency_contact_phone:        emergency_contact_phone || null,
    };

    // Handle profile photo if uploaded
    if (req.file) {
      personalDetails.profile_photo_path = getUploadedFilePath(req.file);
    }

    // ---- Generate registration number ----
    const registrationNumber = generateRegistrationNumber();

<<<<<<< HEAD
    // ---- Resolve lead_id ----
    // For converted leads (lead_registrant role), the lead_id is embedded in the
    // wizard JWT so they cannot forge a different lead's ID.  For staff users, it
    // may optionally be supplied in the request body.
    const effectiveLeadId = req.user.role === 'lead_registrant'
      ? req.user.lead_id
      : (lead_id || null);

=======
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
    // ---- Insert draft ----
    const result = await client.query(
      `INSERT INTO registration_drafts
         (registration_number, personal_details, registered_by, lead_id, status)
       VALUES ($1, $2, $3, $4, 'draft')
       RETURNING id, registration_number, created_at`,
<<<<<<< HEAD
      [registrationNumber, JSON.stringify(personalDetails), req.user.user_id, effectiveLeadId]
=======
      [registrationNumber, JSON.stringify(personalDetails), req.user.user_id, lead_id || null]
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
    );

    return res.status(201).json({
      draft_id:            result.rows[0].id,
      registration_number: result.rows[0].registration_number,
      created_at:          result.rows[0].created_at,
    });
  } catch (err) {
    console.error('CREATE DRAFT ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// PUT /api/registration/draft/:id/personal  (US-REG-01 update + US-REG-09)
// ---------------------------------------------------------------------------
async function updatePersonal(req, res) {
  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const { id } = req.params;
    const {
      first_name, last_name, date_of_birth, gender, phone, email,
      emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
    } = req.body;

    // ---- Fetch existing draft ----
    const draftResult = await client.query(
      `SELECT id, status FROM registration_drafts WHERE id = $1`,
      [id]
    );

    if (draftResult.rows.length === 0) {
      return res.status(404).json({ error: 'Draft not found', code: 'NOT_FOUND' });
    }

    if (draftResult.rows[0].status !== 'draft') {
      return res.status(400).json({
        error: 'Only drafts can be updated',
        code:  'INVALID_STATUS',
      });
    }

    // ---- Input validation ----
    if (!first_name || !date_of_birth || !gender || !phone || !email) {
      return res.status(400).json({
        error: 'First name, date of birth, gender, phone, and email are required',
        code:  'VALIDATION_ERROR',
      });
    }

    // ---- Age validation ----
    const age = calculateAge(date_of_birth);
    if (age < MIN_AGE) {
      return res.status(400).json({
        error: 'Minimum age is 16 years',
        code:  'MIN_AGE_16',
      });
    }

    // ---- Emergency contact for minors ----
    if (age < ADULT_AGE) {
      if (!emergency_contact_name || !emergency_contact_relationship || !emergency_contact_phone) {
        return res.status(400).json({
          error: 'Emergency contact (name, relationship, phone) is required for students under 18',
          code:  'EMERGENCY_CONTACT_REQUIRED',
        });
      }
    }

    // ---- Build personal details JSONB ----
    const personalDetails = {
      first_name,
      last_name: last_name || null,
      date_of_birth,
      gender,
      phone,
      email: email.toLowerCase().trim(),
      emergency_contact_name:         emergency_contact_name || null,
      emergency_contact_relationship: emergency_contact_relationship || null,
      emergency_contact_phone:        emergency_contact_phone || null,
    };

    if (req.file) {
      personalDetails.profile_photo_path = getUploadedFilePath(req.file);
    }

<<<<<<< HEAD
    const effectiveLeadId = req.user.role === 'lead_registrant' ? req.user.lead_id : null;

    await client.query(
      `UPDATE registration_drafts
          SET personal_details = $1,
              lead_id = COALESCE(lead_id, $2),
              updated_at = NOW()
        WHERE id = $3`,
      [JSON.stringify(personalDetails), effectiveLeadId, id]
=======
    await client.query(
      `UPDATE registration_drafts
          SET personal_details = $1,
              updated_at       = NOW()
        WHERE id = $2`,
      [JSON.stringify(personalDetails), id]
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
    );

    return res.status(200).json({ message: 'Personal details updated' });
  } catch (err) {
    console.error('UPDATE PERSONAL ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// PUT /api/registration/draft/:id/address  (US-REG-02)
// ---------------------------------------------------------------------------
async function updateAddress(req, res) {
  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const { id } = req.params;
    const {
      address_line1, address_line2, city, state, pin_code,
      aadhaar_number, pan_number,
    } = req.body;

    // ---- Fetch draft ----
    const draftResult = await client.query(
      `SELECT id, status, personal_details FROM registration_drafts WHERE id = $1`,
      [id]
    );

    if (draftResult.rows.length === 0) {
      return res.status(404).json({ error: 'Draft not found', code: 'NOT_FOUND' });
    }

    if (draftResult.rows[0].status !== 'draft') {
      return res.status(400).json({
        error: 'Only drafts can be updated',
        code:  'INVALID_STATUS',
      });
    }

    // ---- Validate required fields ----
    if (!address_line1 || !pin_code) {
      return res.status(400).json({
        error: 'Address line 1 and PIN code are required',
        code:  'VALIDATION_ERROR',
      });
    }

    // ---- Validate PIN code format ----
    if (!/^\d{6}$/.test(pin_code)) {
      return res.status(400).json({
        error: 'PIN code must be exactly 6 digits',
        code:  'VALIDATION_ERROR',
      });
    }

    // ---- ID document validation for adults (US-REG-02) ----
    const personalDetails = draftResult.rows[0].personal_details;
    if (personalDetails && personalDetails.date_of_birth) {
      const age = calculateAge(personalDetails.date_of_birth);
      if (age >= ADULT_AGE && !aadhaar_number && !pan_number) {
        return res.status(400).json({
          error: 'ID document required for adults',
          code:  'ID_REQUIRED',
        });
      }
    }

    // ---- Build address/documents JSONB ----
    const addressDocuments = {
      address_line1,
      address_line2: address_line2 || null,
      city:          city || null,
      state:         state || null,
      pin_code,
      aadhaar_number: aadhaar_number || null,
      pan_number:     pan_number || null,
    };

<<<<<<< HEAD
    const effectiveLeadId = req.user.role === 'lead_registrant' ? req.user.lead_id : null;

    await client.query(
      `UPDATE registration_drafts
          SET address_documents = $1,
              lead_id = COALESCE(lead_id, $2),
              updated_at        = NOW()
        WHERE id = $3`,
      [JSON.stringify(addressDocuments), effectiveLeadId, id]
=======
    await client.query(
      `UPDATE registration_drafts
          SET address_documents = $1,
              updated_at        = NOW()
        WHERE id = $2`,
      [JSON.stringify(addressDocuments), id]
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
    );

    return res.status(200).json({ message: 'Address and documents updated' });
  } catch (err) {
    console.error('UPDATE ADDRESS ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// PUT /api/registration/draft/:id/academic  (US-REG-03)
// ---------------------------------------------------------------------------
async function updateAcademic(req, res) {
  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const { id } = req.params;
    const { qualification, institution, year_of_passing, score } = req.body;

    // ---- Fetch draft ----
    const draftResult = await client.query(
      `SELECT id, status FROM registration_drafts WHERE id = $1`,
      [id]
    );

    if (draftResult.rows.length === 0) {
      return res.status(404).json({ error: 'Draft not found', code: 'NOT_FOUND' });
    }

    if (draftResult.rows[0].status !== 'draft') {
      return res.status(400).json({
        error: 'Only drafts can be updated',
        code:  'INVALID_STATUS',
      });
    }

    // ---- Field validation ----
    if (!qualification || !institution || !year_of_passing) {
      return res.status(400).json({
        error: 'Qualification, institution, and year of passing are required',
        code:  'VALIDATION_ERROR',
      });
    }

    // ---- Year of passing validation ----
    const currentYear = new Date().getFullYear();
    if (parseInt(year_of_passing, 10) > currentYear) {
      return res.status(400).json({
        error: 'Year of passing cannot be in the future',
        code:  'INVALID_YEAR',
      });
    }

    // ---- Build academic JSONB ----
    const academic = {
      qualification,
      institution,
      year_of_passing: parseInt(year_of_passing, 10),
      score: score || null,
    };

    // Handle uploaded marksheet
    if (req.file) {
      academic.marksheet_path = getUploadedFilePath(req.file);
    }

<<<<<<< HEAD
    const effectiveLeadId = req.user.role === 'lead_registrant' ? req.user.lead_id : null;

    await client.query(
      `UPDATE registration_drafts
          SET academic = $1,
              lead_id = COALESCE(lead_id, $2),
              updated_at = NOW()
        WHERE id = $3`,
      [JSON.stringify(academic), effectiveLeadId, id]
=======
    await client.query(
      `UPDATE registration_drafts
          SET academic   = $1,
              updated_at = NOW()
        WHERE id = $2`,
      [JSON.stringify(academic), id]
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
    );

    return res.status(200).json({ message: 'Academic details updated' });
  } catch (err) {
    console.error('UPDATE ACADEMIC ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// PUT /api/registration/draft/:id/course  (US-REG-04)
// ---------------------------------------------------------------------------
async function updateCourse(req, res) {
  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const { id } = req.params;
    const { course_id, batch_id } = req.body;

    // ---- Fetch draft ----
    const draftResult = await client.query(
      `SELECT id, status FROM registration_drafts WHERE id = $1`,
      [id]
    );

    if (draftResult.rows.length === 0) {
      return res.status(404).json({ error: 'Draft not found', code: 'NOT_FOUND' });
    }

    if (draftResult.rows[0].status !== 'draft') {
      return res.status(400).json({
        error: 'Only drafts can be updated',
        code:  'INVALID_STATUS',
      });
    }

    // ---- Validate input ----
    if (!course_id || !batch_id) {
      return res.status(400).json({
        error: 'Course and batch selection are required',
        code:  'VALIDATION_ERROR',
      });
    }

    // ---- Validate course exists and is active ----
    const courseResult = await client.query(
      `SELECT id, name, base_fee FROM courses WHERE id = $1 AND is_active = TRUE`,
      [course_id]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Course not found or inactive',
        code:  'COURSE_NOT_FOUND',
      });
    }

    // ---- Validate batch exists and has capacity ----
    const batchResult = await client.query(
      `SELECT id, name, schedule, capacity, enrolled_count, trainer_id
         FROM batches
        WHERE id = $1 AND course_id = $2 AND is_active = TRUE`,
      [batch_id, course_id]
    );

    if (batchResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Batch not found or inactive',
        code:  'BATCH_NOT_FOUND',
      });
    }

    const batch = batchResult.rows[0];

    if (batch.enrolled_count >= batch.capacity) {
      return res.status(400).json({
        error: 'This batch is full',
        code:  'BATCH_FULL',
      });
    }

    // ---- Calculate fee summary ----
    const course = courseResult.rows[0];
    const baseFee   = parseFloat(course.base_fee);
    const gstAmount = Math.round(baseFee * GST_RATE * 100) / 100;
    const totalFee  = Math.round((baseFee + gstAmount) * 100) / 100;

    const courseBatch = {
      course_id:   course.id,
      course_name: course.name,
      batch_id:    batch.id,
      batch_name:  batch.name,
      schedule:    batch.schedule,
      base_fee:    baseFee,
      gst_amount:  gstAmount,
      total_fee:   totalFee,
    };

<<<<<<< HEAD
    const effectiveLeadId = req.user.role === 'lead_registrant' ? req.user.lead_id : null;

    await client.query(
      `UPDATE registration_drafts
          SET course_batch = $1,
              lead_id = COALESCE(lead_id, $2),
              updated_at = NOW()
        WHERE id = $3`,
      [JSON.stringify(courseBatch), effectiveLeadId, id]
=======
    await client.query(
      `UPDATE registration_drafts
          SET course_batch = $1,
              updated_at   = NOW()
        WHERE id = $2`,
      [JSON.stringify(courseBatch), id]
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
    );

    return res.status(200).json({
      message:     'Course and batch selected',
      fee_summary: {
        base_fee:   baseFee,
        gst_amount: gstAmount,
        total_fee:  totalFee,
      },
    });
  } catch (err) {
    console.error('UPDATE COURSE ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// POST /api/registration/draft/:id/submit  (US-REG-05 + US-REG-07)
// ---------------------------------------------------------------------------
async function submitRegistration(req, res) {
  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const { id } = req.params;
    const { privacy_consent } = req.body;

    // ---- Privacy consent validation (US-REG-07) ----
    if (!privacy_consent) {
      return res.status(400).json({
        error: 'Privacy consent is required',
        code:  'CONSENT_REQUIRED',
      });
    }

    // ---- Fetch the full draft ----
    const draftResult = await client.query(
      `SELECT * FROM registration_drafts WHERE id = $1`,
      [id]
    );

    if (draftResult.rows.length === 0) {
      return res.status(404).json({ error: 'Draft not found', code: 'NOT_FOUND' });
    }

    const draft = draftResult.rows[0];

    if (draft.status !== 'draft') {
      return res.status(400).json({
        error: 'This registration has already been submitted',
        code:  'ALREADY_SUBMITTED',
      });
    }

    // ---- Validate all steps are complete ----
    if (!draft.personal_details) {
      return res.status(400).json({
        error: 'Personal details are incomplete',
        code:  'STEP_INCOMPLETE',
      });
    }
    if (!draft.address_documents) {
      return res.status(400).json({
        error: 'Address and documents are incomplete',
        code:  'STEP_INCOMPLETE',
      });
    }
    if (!draft.academic) {
      return res.status(400).json({
        error: 'Academic details are incomplete',
        code:  'STEP_INCOMPLETE',
      });
    }
    if (!draft.course_batch) {
      return res.status(400).json({
        error: 'Course and batch selection is incomplete',
        code:  'STEP_INCOMPLETE',
      });
    }

    // ---- Begin transaction ----
    await client.query('BEGIN');

    try {
      const pd = draft.personal_details;
      const ad = draft.address_documents;
      const ac = draft.academic;
      const cb = draft.course_batch;

<<<<<<< HEAD
      // 1. Create user account
      // Use user-provided password if available (e.g., from wizard final step), 
      // else auto-generate a secure temporary one.
      let finalPassword = req.body.password;
      let isAutoGenerated = !finalPassword;

      if (isAutoGenerated) {
        finalPassword = crypto.randomBytes(16).toString('hex');
      } else {
        // Simple complexity check if user provides it
        if (finalPassword.length < 8) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }
      }

      const passwordHash = await bcrypt.hash(finalPassword, BCRYPT_ROUNDS);

      // Use xmax trick: xmax = 0 means the row was freshly INSERTed;
      // xmax > 0 means ON CONFLICT triggered an UPDATE (existing user).
      // We only send welcome credentials when a brand-new account is created.
=======
      // 1. Create user account (role = student, random temporary password)
      const tempPassword = crypto.randomBytes(16).toString('hex');
      const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, role, is_active, mfa_enabled)
         VALUES ($1, $2, 'student', TRUE, FALSE)
         ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
<<<<<<< HEAD
         RETURNING id, (xmax = 0) AS is_new_user`,
=======
         RETURNING id`,
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
        [pd.email, passwordHash]
      );

      const userId = userResult.rows[0].id;
<<<<<<< HEAD
      
      // Store temporary password in Redis for 24 hours so it can be sent after payment
      // Key format: temp_password:{user_id}
      await redis.set(`temp_password:${userId}`, finalPassword, 'EX', 86400);
=======
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906

      // 2. Create students record
      const studentResult = await client.query(
        `INSERT INTO students (
           user_id, registration_number, first_name, last_name,
           date_of_birth, gender, phone, email, profile_photo_path,
           address_line1, address_line2, city, state, pin_code,
           aadhaar_number, pan_number,
           qualification, institution, year_of_passing, score, marksheet_path,
           emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
           privacy_consent, privacy_consent_at,
           registered_by, lead_id
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9,
           $10, $11, $12, $13, $14, $15, $16,
           $17, $18, $19, $20, $21,
           $22, $23, $24,
           $25, NOW(),
           $26, $27
         ) RETURNING id`,
        [
          userId, draft.registration_number, pd.first_name, pd.last_name,
          pd.date_of_birth, pd.gender, pd.phone, pd.email, pd.profile_photo_path || null,
          ad.address_line1, ad.address_line2, ad.city, ad.state, ad.pin_code,
          ad.aadhaar_number, ad.pan_number,
          ac.qualification, ac.institution, ac.year_of_passing, ac.score, ac.marksheet_path || null,
          pd.emergency_contact_name, pd.emergency_contact_relationship, pd.emergency_contact_phone,
          true,
          req.user.user_id, draft.lead_id,
        ]
      );

      const studentId = studentResult.rows[0].id;

      // 3. Create enrollment record
      const enrollmentResult = await client.query(
        `INSERT INTO enrollments (student_id, batch_id, course_id, base_fee, gst_amount, total_fee, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending_payment')
         RETURNING id`,
        [studentId, cb.batch_id, cb.course_id, cb.base_fee, cb.gst_amount, cb.total_fee]
      );

      const enrollmentId = enrollmentResult.rows[0].id;

      // 4. Increment batch enrolled_count
      await client.query(
        `UPDATE batches SET enrolled_count = enrolled_count + 1 WHERE id = $1`,
        [cb.batch_id]
      );

      // 5. Update draft status
      await client.query(
        `UPDATE registration_drafts
            SET status             = 'pending_payment',
                privacy_consent    = TRUE,
                privacy_consent_at = NOW(),
                updated_at         = NOW()
          WHERE id = $1`,
        [id]
      );

<<<<<<< HEAD
      // 5b. Update Lead Status if applicable
      if (draft.lead_id) {
        await client.query(
          `UPDATE leads SET status = 'registration_completed', last_activity_at = NOW() WHERE id = $1`,
          [draft.lead_id]
        );
        await client.query(
          `INSERT INTO lead_status_history (lead_id, changed_by, from_status, to_status, reason)
           VALUES ($1, $2, 'converted', 'registration_completed', 'Student Registration Submitted')`,
          [draft.lead_id, req.user.user_id]
        );
      }

      // ---- Commit transaction ----
      await client.query('COMMIT');

      const loginUrl   = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;
      const paymentUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/${enrollmentId}`;
      const isNewUser  = userResult.rows[0].is_new_user;

      // 6a. Fire-and-forget: send payment link email only
      // Login credentials will be sent after successful payment
      sendPaymentLinkEmail(pd.email, pd.first_name, paymentUrl, draft.registration_number).catch((err) => {
        console.error('Failed to send payment link email:', err.message);
      });

      // 6c. Invalidate the one-time invite token from Redis (if this was a lead-originated
      //     registration).  Both the forward key (token → data) and the reverse lookup
      //     (lead_id → token) are deleted so the link cannot be reused.
      if (draft.lead_id) {
        try {
          const inviteToken = await redis.get(`reg:lead_invite:${draft.lead_id}`);
          if (inviteToken) {
            await redis.del(`reg:invite:${inviteToken}`);
            await redis.del(`reg:lead_invite:${draft.lead_id}`);
          }
        } catch (redisErr) {
          console.error('Failed to invalidate invite token:', redisErr.message);
        }
      }

      // 6d. Update Redis Caches (per requirements)
      try {
        if (draft.lead_id) {
          await redis.set(`lead_status:${draft.lead_id}`, 'registration_completed', 'EX', 86400); // 1 day
        }
        await redis.set(`student_profile:${studentId}`, JSON.stringify(pd), 'EX', 86400);
        await redis.set(`payment_status:${enrollmentId}`, 'pending_payment', 'EX', 86400);
      } catch (redisErr) {
        console.error('Redis cache error:', redisErr.message);
      }

      // TODO: SMS (Twilio/MSG91) — send payment link via SMS alongside email
=======
      // ---- Commit transaction ----
      await client.query('COMMIT');

      // 6. Fire-and-forget: send payment link email
      const paymentUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/${enrollmentId}`;
      sendPaymentLinkEmail(pd.email, pd.first_name, paymentUrl, draft.registration_number).catch((err) => {
        console.error('Failed to send payment link email:', err.message);
      });
      // TODO: SMS (Twilio/MSG91) — Send payment link via SMS alongside email
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906

      return res.status(201).json({
        message:             'Registration submitted successfully',
        registration_number: draft.registration_number,
        student_id:          studentId,
        enrollment_id:       enrollmentId,
<<<<<<< HEAD
        credentials_sent:    isNewUser,  // Let the frontend know if a credentials email was sent
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      console.error('SUBMIT REGISTRATION ERROR (Transaction):', txErr.message);
      console.error('STACK:', txErr.stack);
      return res.status(500).json({
        error: 'Internal server error',
        details: txErr.message,
        stack: process.env.NODE_ENV === 'development' ? txErr.stack : undefined
      });
    }
  } catch (err) {
    console.error('SUBMIT REGISTRATION ERROR (Outer):', err.message);
    console.error('STACK:', err.stack);
    return res.status(500).json({
      error: 'Internal server error',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
=======
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    }
  } catch (err) {
    console.error('SUBMIT REGISTRATION ERROR:', err.message);
    console.error('STACK:', err.stack);
    return res.status(500).json({ error: 'Internal server error' });
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/registration  (US-REG-08)
// ---------------------------------------------------------------------------
async function listRegistrations(req, res) {
  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = `
      SELECT
        rd.id,
        rd.registration_number,
        rd.personal_details,
        rd.course_batch,
        rd.status,
        rd.created_at,
        rd.updated_at
      FROM registration_drafts rd
    `;

    const params = [];
    const conditions = [];

    // ---- Filter by BDA's own records if role is BDA ----
    if (req.user.role === 'bda') {
      conditions.push(`rd.registered_by = $${params.length + 1}`);
      params.push(req.user.user_id);
    }

    // ---- Search filter ----
    if (search) {
      conditions.push(`(
        rd.registration_number ILIKE $${params.length + 1}
        OR rd.personal_details->>'first_name' ILIKE $${params.length + 1}
        OR rd.personal_details->>'last_name' ILIKE $${params.length + 1}
        OR rd.personal_details->>'email' ILIKE $${params.length + 1}
      )`);
      params.push(`%${search}%`);
    }

    // ---- Status filter ----
    if (status) {
      conditions.push(`rd.status = $${params.length + 1}`);
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ` ORDER BY rd.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit, 10), offset);

    const result = await client.query(query, params);

    // ---- Get total count ----
    let countQuery = `SELECT COUNT(*) FROM registration_drafts rd`;
    const countParams = [];
    const countConditions = [];

    if (req.user.role === 'bda') {
      countConditions.push(`rd.registered_by = $${countParams.length + 1}`);
      countParams.push(req.user.user_id);
    }
    if (search) {
      countConditions.push(`(
        rd.registration_number ILIKE $${countParams.length + 1}
        OR rd.personal_details->>'first_name' ILIKE $${countParams.length + 1}
        OR rd.personal_details->>'last_name' ILIKE $${countParams.length + 1}
        OR rd.personal_details->>'email' ILIKE $${countParams.length + 1}
      )`);
      countParams.push(`%${search}%`);
    }
    if (status) {
      countConditions.push(`rd.status = $${countParams.length + 1}`);
      countParams.push(status);
    }

    if (countConditions.length > 0) {
      countQuery += ' WHERE ' + countConditions.join(' AND ');
    }

    const countResult = await client.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    // ---- Format response ----
    const registrations = result.rows.map((row) => ({
      id:                  row.id,
      registration_number: row.registration_number,
      student_name:        row.personal_details
        ? `${row.personal_details.first_name || ''} ${row.personal_details.last_name || ''}`.trim()
        : 'N/A',
      email:       row.personal_details?.email || 'N/A',
      course_name: row.course_batch?.course_name || 'Not selected',
      batch_name:  row.course_batch?.batch_name || 'Not selected',
      status:      row.status,
      created_at:  row.created_at,
      updated_at:  row.updated_at,
    }));

    return res.status(200).json({
      registrations,
      pagination: {
        page:  parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (err) {
    console.error('LIST REGISTRATIONS ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/registration/:id  (US-REG-08)
// ---------------------------------------------------------------------------
async function getRegistration(req, res) {
  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const { id } = req.params;

    const result = await client.query(
      `SELECT * FROM registration_drafts WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Registration not found', code: 'NOT_FOUND' });
    }

    const draft = result.rows[0];

    // ---- BDA can only see own registrations ----
    if (req.user.role === 'bda' && draft.registered_by !== req.user.user_id) {
      return res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
    }

<<<<<<< HEAD
    // ---- Guest (Lead) can only see their own registration ----
    if (req.user.role === 'lead_registrant' && String(draft.lead_id) !== String(req.user.lead_id)) {
      return res.status(403).json({ error: 'Insufficient permissions (Lead mismatch)', code: 'FORBIDDEN' });
    }

=======
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
    return res.status(200).json(draft);
  } catch (err) {
    console.error('GET REGISTRATION ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// PUT /api/registration/:id  (US-REG-08 — edit pending_payment)
// ---------------------------------------------------------------------------
async function editRegistration(req, res) {
  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const { id } = req.params;
    const { personal_details, address_documents, academic } = req.body;

    const draftResult = await client.query(
      `SELECT id, status FROM registration_drafts WHERE id = $1`,
      [id]
    );

    if (draftResult.rows.length === 0) {
      return res.status(404).json({ error: 'Registration not found', code: 'NOT_FOUND' });
    }

    const draft = draftResult.rows[0];

<<<<<<< HEAD
    // ---- Authorization Check ----
    if (req.user.role === 'bda' && draft.registered_by !== req.user.user_id) {
      return res.status(403).json({ error: 'Insufficient permissions', code: 'FORBIDDEN' });
    }
    if (req.user.role === 'lead_registrant' && String(draft.lead_id) !== String(req.user.lead_id)) {
      return res.status(403).json({ error: 'Insufficient permissions (Lead mismatch)', code: 'FORBIDDEN' });
    }

=======
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
    // ---- Status-based edit lock (US-REG-08) ----
    if (draft.status === 'active' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        error: 'Active registrations can only be edited by Super Admin',
        code:  'EDIT_LOCKED',
      });
    }

    if (draft.status !== 'pending_payment' && draft.status !== 'active') {
      return res.status(400).json({
        error: 'This registration cannot be edited in its current status',
        code:  'INVALID_STATUS',
      });
    }

    // ---- Build update query dynamically ----
    const updates = [];
    const params  = [];
    let paramIndex = 1;

    if (personal_details) {
      updates.push(`personal_details = $${paramIndex}`);
      params.push(JSON.stringify(personal_details));
      paramIndex++;
    }

    if (address_documents) {
      updates.push(`address_documents = $${paramIndex}`);
      params.push(JSON.stringify(address_documents));
      paramIndex++;
    }

    if (academic) {
      updates.push(`academic = $${paramIndex}`);
      params.push(JSON.stringify(academic));
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        error: 'No fields to update',
        code:  'VALIDATION_ERROR',
      });
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    await client.query(
      `UPDATE registration_drafts SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params
    );

    // ---- Also update the students table if status is pending_payment or active ----
    if (draft.status === 'pending_payment' || draft.status === 'active') {
      const updatedDraft = await client.query(
        `SELECT * FROM registration_drafts WHERE id = $1`,
        [id]
      );

      if (updatedDraft.rows.length > 0) {
        const d = updatedDraft.rows[0];
        const pd = d.personal_details || {};
        const ad = d.address_documents || {};
        const ac = d.academic || {};

        await client.query(
          `UPDATE students SET
             first_name = $1, last_name = $2, phone = $3,
             address_line1 = $4, address_line2 = $5, city = $6, state = $7, pin_code = $8,
             aadhaar_number = $9, pan_number = $10,
             qualification = $11, institution = $12, year_of_passing = $13, score = $14,
             emergency_contact_name = $15, emergency_contact_relationship = $16, emergency_contact_phone = $17,
             updated_at = NOW()
           WHERE registration_number = $18`,
          [
            pd.first_name, pd.last_name, pd.phone,
            ad.address_line1, ad.address_line2, ad.city, ad.state, ad.pin_code,
            ad.aadhaar_number, ad.pan_number,
            ac.qualification, ac.institution, ac.year_of_passing, ac.score,
            pd.emergency_contact_name, pd.emergency_contact_relationship, pd.emergency_contact_phone,
            d.registration_number,
          ]
        );
      }
    }

    return res.status(200).json({ message: 'Registration updated successfully' });
  } catch (err) {
    console.error('EDIT REGISTRATION ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

<<<<<<< HEAD
// ---------------------------------------------------------------------------
// POST /api/registration/payment-webhook
// Payment success webhook handler
// ---------------------------------------------------------------------------
async function handlePaymentSuccess(req, res) {
  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const { enrollment_id } = req.body;
    if (!enrollment_id) return res.status(400).json({ error: 'enrollment_id is required' });

    await client.query('BEGIN');

    // Update enrollment status to active
    const enrollRes = await client.query(
      `UPDATE enrollments SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING student_id`,
      [enrollment_id]
    );

    if (enrollRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    const studentId = enrollRes.rows[0].student_id;

    // Get the student to check if there is a lead_id
    const studentRes = await client.query(
      `SELECT s.lead_id, s.registered_by, s.first_name, s.email, rd.course_batch, rd.personal_details 
       FROM students s 
       LEFT JOIN registration_drafts rd ON s.registration_number = rd.registration_number 
       WHERE s.id = $1`, 
      [studentId]
    );

    const leadId = studentRes.rows[0]?.lead_id;
    const registeredBy = studentRes.rows[0]?.registered_by;
    const studentFirstName = studentRes.rows[0]?.first_name;
    const studentEmail = studentRes.rows[0]?.email;
    const courseBatch = studentRes.rows[0]?.course_batch;
    const pd = studentRes.rows[0]?.personal_details;

    if (leadId && registeredBy) {
      // Update lead status to onboarded
      await client.query(
        `UPDATE leads SET status = 'onboarded', last_activity_at = NOW() WHERE id = $1`,
        [leadId]
      );
      // History event
      await client.query(
        `INSERT INTO lead_status_history (lead_id, changed_by, from_status, to_status, reason)
         VALUES ($1, $2, 'registration_completed', 'onboarded', 'Payment Successful')`,
        [leadId, registeredBy]
      );
    }
    // Fetch student's user record for token generation
    const userRes = await client.query(
      `SELECT u.id, u.role, u.email 
       FROM users u 
       JOIN students s ON u.id = s.user_id 
       WHERE s.id = $1`,
      [studentId]
    );

    let tokens = null;
    if (userRes.rows.length > 0) {
      const studentUser = userRes.rows[0];
      if (studentUser.id && studentUser.role && studentUser.email) {
        tokens = generateTokens({
          id: studentUser.id,
          role: studentUser.role,
          email: studentUser.email
        });
        
        // Use res.cookie to set the refreshToken so AuthProvider's /api/auth/me can work
        res.cookie('refreshToken', tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
      }
    }

    await client.query('COMMIT');

    // Send Enrollment Success Email with credentials (Fire-and-forget)
    if (studentEmail) {
      const logUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;
      const courseName = courseBatch?.course_name || 'your chosen course';
      
      // Retrieve the temporary password from Redis
      let tempPassword = '';
      try {
        const userRes = await client.query(
          `SELECT u.id FROM users u JOIN students s ON u.id = s.user_id WHERE s.id = $1`,
          [studentId]
        );
        if (userRes.rows.length > 0) {
          const userId = userRes.rows[0].id;
          tempPassword = await redis.get(`temp_password:${userId}`);
          // Clean up the temporary password from Redis after retrieving it
          if (tempPassword) {
            await redis.del(`temp_password:${userId}`);
          }
        }
      } catch (redisErr) {
        console.error('Failed to retrieve temporary password:', redisErr.message);
      }
      
      sendEnrollmentSuccessEmail(studentEmail, studentFirstName, courseName, logUrl, tempPassword || '').catch(err => {
        console.error('Failed to send enrollment success email:', err.message);
      });
    }

    // Update Redis cache keys (non-blocking)
    try {
      if (leadId) {
        await redis.set(`lead_status:${leadId}`, 'onboarded', 'EX', 86400).catch(()=>{}); 
      }
      await redis.set(`payment_status:${enrollment_id}`, 'paid', 'EX', 86400).catch(()=>{});
      if (pd) {
        await redis.set(`student_profile:${studentId}`, JSON.stringify(pd), 'EX', 86400).catch(()=>{});
      }
    } catch (redisErr) {
      console.error('Redis update error:', redisErr.message);
    }

    return res.status(200).json({ 
      success: true,
      message: 'Payment success registered', 
      student_id: studentId,
      accessToken: tokens?.accessToken,
      refreshToken: tokens?.refreshToken
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('PAYMENT WEBHOOK ERROR:', err.message);
    console.error('Stack:', err.stack);
    return res.status(500).json({ 
      error: 'Internal server error during payment processing',
      details: err.message
    });
  } finally {
    if (client) client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/courses
// ---------------------------------------------------------------------------
async function listCourses(req, res) {
  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");
  try {
    const result = await client.query('SELECT * FROM courses WHERE is_active = TRUE ORDER BY name ASC');
    return res.status(200).json({ courses: result.rows });
  } catch (err) {
    console.error('LIST COURSES ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/courses/:courseId/batches
// ---------------------------------------------------------------------------
async function listBatches(req, res) {
  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");
  try {
    const { courseId } = req.params;
    const result = await client.query(
      `SELECT *, (capacity - enrolled_count) as seats_remaining, (enrolled_count >= capacity) as is_full 
       FROM batches 
       WHERE course_id = $1 AND is_active = TRUE 
       ORDER BY start_date ASC`,
      [courseId]
    );
    return res.status(200).json({ batches: result.rows });
  } catch (err) {
    console.error('LIST BATCHES ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/pincode/:pin
// ---------------------------------------------------------------------------
async function listPinCode(req, res) {
  try {
    const { pin } = req.params;
    const result = await lookupPinCode(pin);
    return res.status(200).json(result);
  } catch (err) {
    console.error('PINCODE LOOKUP ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/registration/batches/:id
// Update batch details (capacity, schedule, status)
// ---------------------------------------------------------------------------
async function updateBatch(req, res) {
  const client = await pool.connect();
  
  // Set the role dynamically to enforce RLS
  await client.query("SELECT set_config('app.current_user_id', $1::text, false)", [req.user.user_id]);
  await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);

  try {
    const { id } = req.params;
    const { capacity, schedule, is_active } = req.body;

    await client.query('BEGIN');

    // 1. Fetch current state to check existence & RLS
    const checkRes = await client.query('SELECT enrolled_count FROM batches WHERE id = $1 FOR UPDATE', [id]);
    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Batch not found or permission denied' });
    }

    const { enrolled_count } = checkRes.rows[0];

    // 2. Validate capacity if provided
    if (capacity !== undefined) {
      if (capacity < enrolled_count) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Cannot reduce capacity below current enrollment (${enrolled_count} students already in batch)` 
        });
      }
    }

    // 3. Coordinate Update
    const updateRes = await client.query(
      `UPDATE batches 
       SET capacity = COALESCE($2, capacity),
           schedule = COALESCE($3, schedule),
           is_active = COALESCE($4, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, capacity, schedule, is_active]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      message: 'Batch updated successfully',
      batch: updateRes.rows[0]
    });

  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('UPDATE BATCH ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error during batch update' });
  } finally {
    if (client) client.release();
  }
}



=======
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
module.exports = {
  createDraft,
  updatePersonal,
  updateAddress,
  updateAcademic,
  updateCourse,
  submitRegistration,
  listRegistrations,
  getRegistration,
  editRegistration,
<<<<<<< HEAD
  handlePaymentSuccess,
  listCourses,
  listBatches,
  listPinCode,
  updateBatch,
=======
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
};
