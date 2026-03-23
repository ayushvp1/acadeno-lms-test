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
const { sendPaymentLinkEmail } = require('../services/emailService');
const { getUploadedFilePath } = require('../services/fileService');
const bcrypt = require('bcrypt');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MIN_AGE = 16;
const ADULT_AGE = 18;
const GST_RATE = 0.18;
const BCRYPT_ROUNDS = 12;

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

    // ---- Insert draft ----
    const result = await client.query(
      `INSERT INTO registration_drafts
         (registration_number, personal_details, registered_by, lead_id, status)
       VALUES ($1, $2, $3, $4, 'draft')
       RETURNING id, registration_number, created_at`,
      [registrationNumber, JSON.stringify(personalDetails), req.user.user_id, lead_id || null]
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

    await client.query(
      `UPDATE registration_drafts
          SET personal_details = $1,
              updated_at       = NOW()
        WHERE id = $2`,
      [JSON.stringify(personalDetails), id]
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

    await client.query(
      `UPDATE registration_drafts
          SET address_documents = $1,
              updated_at        = NOW()
        WHERE id = $2`,
      [JSON.stringify(addressDocuments), id]
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

    await client.query(
      `UPDATE registration_drafts
          SET academic   = $1,
              updated_at = NOW()
        WHERE id = $2`,
      [JSON.stringify(academic), id]
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

    await client.query(
      `UPDATE registration_drafts
          SET course_batch = $1,
              updated_at   = NOW()
        WHERE id = $2`,
      [JSON.stringify(courseBatch), id]
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

      // 1. Create user account (role = student, random temporary password)
      const tempPassword = crypto.randomBytes(16).toString('hex');
      const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, role, is_active, mfa_enabled)
         VALUES ($1, $2, 'student', TRUE, FALSE)
         ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [pd.email, passwordHash]
      );

      const userId = userResult.rows[0].id;

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

      // ---- Commit transaction ----
      await client.query('COMMIT');

      // 6. Fire-and-forget: send payment link email
      const paymentUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/${enrollmentId}`;
      sendPaymentLinkEmail(pd.email, pd.first_name, paymentUrl, draft.registration_number).catch((err) => {
        console.error('Failed to send payment link email:', err.message);
      });
      // TODO: SMS (Twilio/MSG91) — Send payment link via SMS alongside email

      return res.status(201).json({
        message:             'Registration submitted successfully',
        registration_number: draft.registration_number,
        student_id:          studentId,
        enrollment_id:       enrollmentId,
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    }
  } catch (err) {
    console.error('SUBMIT REGISTRATION ERROR:', err.message);
    console.error('STACK:', err.stack);
    return res.status(500).json({ error: 'Internal server error' });
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
};
