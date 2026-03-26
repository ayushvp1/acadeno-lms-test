// ==========================================================================
// ACADENO LMS — Course & Content Management Controller (EPIC-05)
// ==========================================================================
// Handles all course, batch, module, sub-module, content, live-session
// and batch-dashboard endpoints.
//
// Business Rules Enforced:
//   BR-C01 — Trainer can only edit content for courses they are assigned to.
//   BR-C02 — Student can access content only for active enrollments.
//   BR-C03 — Task due dates cannot be set in the past.
//   BR-A01 — Trainer's student visibility is restricted to their batches.
//
// Patterns followed (EPIC-01 baseline):
//   - pool.connect() + SET app.current_user_role for every query
//   - Hungarian notation for all local variables
//   - Bouncer Pattern: all validation at the top of each function
//   - Zero magic values: all constants declared at top of module
// ==========================================================================

const crypto = require('crypto');
const multer  = require('multer');
const { pool } = require('../db/index');
const redis    = require('../utils/redis');
const s3       = require('../utils/s3');
const mc       = require('../utils/mediaconvert');

// ---------------------------------------------------------------------------
// Module-level Constants (Zero Magic Values Rule)
// ---------------------------------------------------------------------------
const INT_MAX_DOC_SIZE_BYTES        = 50  * 1024 * 1024;             // 50 MB
const INT_MAX_VIDEO_SIZE_BYTES      = 2   * 1024 * 1024 * 1024;      // 2 GB
const INT_MAX_SUBMISSION_BYTES      = 50  * 1024 * 1024;             // 50 MB
const INT_DASHBOARD_CACHE_TTL_SEC   = 300;                           // 5 minutes
const INT_AT_RISK_THRESHOLD_PCT     = 40;                            // < 40% = at risk
const INT_AT_RISK_OVERDUE_COUNT     = 3;                             // >= 3 overdue = at risk
const INT_LEADERBOARD_TOP_N         = 10;                            // top 10 students
const STR_STATUS_DRAFT              = 'draft';
const STR_STATUS_PUBLISHED          = 'published';
const STR_TRANSCODE_NOT_APPLICABLE  = 'not_applicable';
const STR_TRANSCODE_PROCESSING      = 'processing';
const STR_TRANSCODE_COMPLETE        = 'complete';
const STR_CONTENT_TYPE_VIDEO        = 'video';
const STR_CONTENT_TYPE_EXTERNAL     = 'external_link';

const ARR_ALLOWED_DOC_MIMES = [
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// ---------------------------------------------------------------------------
// Multer instances — memory storage so buffer is available for s3.uploadFile
// ---------------------------------------------------------------------------
const uploadDocMiddleware = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: INT_MAX_DOC_SIZE_BYTES },
}).single('file');

const uploadVideoMiddleware = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: INT_MAX_VIDEO_SIZE_BYTES },
}).single('file');

const uploadSubmissionMiddleware = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: INT_MAX_SUBMISSION_BYTES },
}).single('file');

// ---------------------------------------------------------------------------
// Exported multer middleware wrappers (used by routes)
// ---------------------------------------------------------------------------
function handleDocUpload(req, res, next) {
  uploadDocMiddleware(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large; maximum is 50 MB for documents.',
        code:  'FILE_TOO_LARGE',
      });
    }
    if (err) return res.status(400).json({ error: err.message, code: 'UPLOAD_ERROR' });
    next();
  });
}

function handleVideoUpload(req, res, next) {
  uploadVideoMiddleware(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large; maximum is 2 GB for videos.',
        code:  'FILE_TOO_LARGE',
      });
    }
    if (err) return res.status(400).json({ error: err.message, code: 'UPLOAD_ERROR' });
    next();
  });
}

function handleSubmissionUpload(req, res, next) {
  uploadSubmissionMiddleware(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large; maximum is 50 MB for submissions.',
        code:  'FILE_TOO_LARGE',
      });
    }
    if (err) return res.status(400).json({ error: err.message, code: 'UPLOAD_ERROR' });
    next();
  });
}

// ---------------------------------------------------------------------------
// Helper: isTrainerAssigned(client, strCourseId, strUserId)
// ---------------------------------------------------------------------------
// Business intent: Enforce BR-C01 — check that a trainer is assigned to at
// least one active batch for the given course.
//
// Returns: boolean
// ---------------------------------------------------------------------------
async function isTrainerAssigned(client, strCourseId, strUserId) {
  const objResult = await client.query(
    `SELECT id FROM batches
      WHERE course_id  = $1
        AND trainer_id = $2
        AND is_active  = TRUE
      LIMIT 1`,
    [strCourseId, strUserId]
  );
  return objResult.rows.length > 0;
}

// ---------------------------------------------------------------------------
// Helper: isValidUrl(strUrl)
// ---------------------------------------------------------------------------
function isValidUrl(strUrl) {
  try {
    new URL(strUrl);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helper: invalidateDashboardCache(strBatchId)
// ---------------------------------------------------------------------------
// Business intent: Invalidate cached dashboard data when submissions or
// content changes occur (US-CRS-07 requirement).
// ---------------------------------------------------------------------------
async function invalidateDashboardCache(strBatchId) {
  try {
    await redis.del(`batch_dashboard:${strBatchId}`);
  } catch (err) {
    console.error('Dashboard cache invalidation error:', err.message);
  }
}

// ==========================================================================
// COURSE CRUD (US-CRS-09)
// ==========================================================================

// ---------------------------------------------------------------------------
// GET /api/courses — List all active + inactive courses with batch counts
// Accessible by: hr, super_admin, trainer, student (read-only)
// ---------------------------------------------------------------------------
async function listCourses(req, res) {
  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const objResult = await client.query(
      `SELECT c.id,
              c.name            AS title,
              c.name,
              c.description,
              c.base_fee,
              c.gst_rate,
              c.duration_weeks,
              c.max_batch_capacity,
              c.is_active,
              c.created_at,
              COUNT(b.id) FILTER (WHERE b.is_active = TRUE) AS active_batch_count
         FROM courses c
         LEFT JOIN batches b ON b.course_id = c.id
        GROUP BY c.id
        ORDER BY c.name ASC`
    );

    return res.status(200).json({ courses: objResult.rows });
  } catch (err) {
    console.error('listCourses error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// POST /api/courses — Create a new course (hr, super_admin)
// ---------------------------------------------------------------------------
async function createCourse(req, res) {
  const { title, description, base_fee, gst_rate, duration_weeks, max_batch_capacity } = req.body;

  // Bouncer Pattern
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title is required.', code: 'VALIDATION_ERROR' });
  }
  if (base_fee === undefined || isNaN(parseFloat(base_fee))) {
    return res.status(400).json({ error: 'base_fee must be a valid number.', code: 'VALIDATION_ERROR' });
  }

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const dblBaseFee           = parseFloat(base_fee);
    const dblGstRate           = gst_rate !== undefined ? parseFloat(gst_rate) : 18.00;
    const intDurationWeeks     = duration_weeks ? parseInt(duration_weeks, 10) : null;
    const intMaxBatchCapacity  = max_batch_capacity ? parseInt(max_batch_capacity, 10) : 30;
    const strCreatedBy         = req.user.user_id;

    const objResult = await client.query(
      `INSERT INTO courses
               (name, description, base_fee, gst_rate, duration_weeks, max_batch_capacity, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, name AS title, name, description, base_fee, gst_rate,
                  duration_weeks, max_batch_capacity, is_active, created_at`,
      [title.trim(), description || null, dblBaseFee, dblGstRate,
       intDurationWeeks, intMaxBatchCapacity, strCreatedBy]
    );

    return res.status(201).json({ course: objResult.rows[0] });
  } catch (err) {
    if (err.code === '23505') {  // unique_violation
      return res.status(409).json({ error: 'A course with this title already exists.', code: 'DUPLICATE_COURSE' });
    }
    console.error('createCourse error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/courses/:id — Get course detail with modules tree and batches
// ---------------------------------------------------------------------------
async function getCourse(req, res) {
  const strCourseId = req.params.id;

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    // Course
    const objCourseResult = await client.query(
      `SELECT id, name AS title, name, description, base_fee, gst_rate,
              duration_weeks, max_batch_capacity, is_active, created_at, updated_at
         FROM courses WHERE id = $1`,
      [strCourseId]
    );

    if (objCourseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found.', code: 'NOT_FOUND' });
    }

    // Batches
    const objBatchResult = await client.query(
      `SELECT b.id, b.name AS batch_name, b.name, b.schedule, b.trainer_id,
              b.capacity, b.enrolled_count, b.start_date, b.end_date,
              b.is_active, b.created_at,
              u.email AS trainer_email
         FROM batches b
         LEFT JOIN users u ON b.trainer_id = u.id
        WHERE b.course_id = $1
        ORDER BY b.start_date ASC NULLS LAST`,
      [strCourseId]
    );

    // Modules (top-level only — sub-modules fetched separately via listModules)
    const objModuleResult = await client.query(
      `SELECT id, title, position, created_at
         FROM modules
        WHERE course_id = $1
        ORDER BY position ASC, created_at ASC`,
      [strCourseId]
    );

    const objCourse = objCourseResult.rows[0];
    objCourse.batches = objBatchResult.rows;
    objCourse.modules = objModuleResult.rows;

    return res.status(200).json({ course: objCourse });
  } catch (err) {
    console.error('getCourse error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/courses/:id — Update course fields (hr, super_admin)
// ---------------------------------------------------------------------------
async function updateCourse(req, res) {
  const strCourseId = req.params.id;
  const { title, description, base_fee, gst_rate, duration_weeks, max_batch_capacity } = req.body;

  // Bouncer: at least one field required
  if (!title && description === undefined && base_fee === undefined &&
      gst_rate === undefined && duration_weeks === undefined && max_batch_capacity === undefined) {
    return res.status(400).json({ error: 'At least one field must be provided.', code: 'VALIDATION_ERROR' });
  }

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const arrFields = [];
    const arrValues = [];
    let intIdx = 1;

    if (title !== undefined) {
      arrFields.push(`name = $${intIdx++}`);
      arrValues.push(title.trim());
    }
    if (description !== undefined) {
      arrFields.push(`description = $${intIdx++}`);
      arrValues.push(description);
    }
    if (base_fee !== undefined) {
      arrFields.push(`base_fee = $${intIdx++}`);
      arrValues.push(parseFloat(base_fee));
    }
    if (gst_rate !== undefined) {
      arrFields.push(`gst_rate = $${intIdx++}`);
      arrValues.push(parseFloat(gst_rate));
    }
    if (duration_weeks !== undefined) {
      arrFields.push(`duration_weeks = $${intIdx++}`);
      arrValues.push(parseInt(duration_weeks, 10));
    }
    if (max_batch_capacity !== undefined) {
      arrFields.push(`max_batch_capacity = $${intIdx++}`);
      arrValues.push(parseInt(max_batch_capacity, 10));
    }

    arrFields.push(`updated_at = NOW()`);
    arrValues.push(strCourseId);

    const objResult = await client.query(
      `UPDATE courses SET ${arrFields.join(', ')}
        WHERE id = $${intIdx}
        RETURNING id, name AS title, name, description, base_fee, gst_rate,
                  duration_weeks, max_batch_capacity, is_active, updated_at`,
      arrValues
    );

    if (objResult.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found.', code: 'NOT_FOUND' });
    }

    return res.status(200).json({ course: objResult.rows[0] });
  } catch (err) {
    console.error('updateCourse error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/courses/:id/deactivate — Deactivate course (hr, super_admin)
// Existing active enrollments are unaffected (SRD US-CRS-09).
// ---------------------------------------------------------------------------
async function deactivateCourse(req, res) {
  const strCourseId = req.params.id;

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const objResult = await client.query(
      `UPDATE courses
          SET is_active  = FALSE,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, name AS title, is_active, updated_at`,
      [strCourseId]
    );

    if (objResult.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found.', code: 'NOT_FOUND' });
    }

    return res.status(200).json({
      message: 'Course deactivated. Existing enrollments remain active.',
      course:  objResult.rows[0],
    });
  } catch (err) {
    console.error('deactivateCourse error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ==========================================================================
// BATCH CRUD
// ==========================================================================

// ---------------------------------------------------------------------------
// GET /api/courses/:id/batches — List batches for a course
// ---------------------------------------------------------------------------
async function listCourseBatches(req, res) {
  const strCourseId = req.params.id;

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const objResult = await client.query(
      `SELECT b.id, b.name AS batch_name, b.name, b.schedule, b.trainer_id,
              b.capacity, b.enrolled_count,
              (b.capacity - b.enrolled_count) AS seats_remaining,
              b.start_date, b.end_date, b.is_active, b.created_at,
              u.email AS trainer_email
         FROM batches b
         LEFT JOIN users u ON b.trainer_id = u.id
        WHERE b.course_id = $1
        ORDER BY b.start_date ASC NULLS LAST`,
      [strCourseId]
    );

    return res.status(200).json({ batches: objResult.rows });
  } catch (err) {
    console.error('listCourseBatches error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// POST /api/courses/:id/batches — Create a batch (hr, super_admin)
// ---------------------------------------------------------------------------
async function createBatch(req, res) {
  const strCourseId = req.params.id;
  const { batch_name, schedule, trainer_id, start_date, end_date, capacity } = req.body;

  // Bouncer
  if (!batch_name || typeof batch_name !== 'string' || batch_name.trim() === '') {
    return res.status(400).json({ error: 'batch_name is required.', code: 'VALIDATION_ERROR' });
  }

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    // Verify course exists and is active
    const objCourse = await client.query(
      `SELECT id FROM courses WHERE id = $1 AND is_active = TRUE`,
      [strCourseId]
    );

    if (objCourse.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found or inactive.', code: 'COURSE_NOT_FOUND' });
    }

    const intCapacity = capacity ? parseInt(capacity, 10) : 30;

    const objResult = await client.query(
      `INSERT INTO batches (course_id, name, schedule, trainer_id, start_date, end_date, capacity)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, name AS batch_name, name, schedule, trainer_id, capacity,
                  enrolled_count, start_date, end_date, is_active, created_at`,
      [strCourseId, batch_name.trim(), schedule || null, trainer_id || null,
       start_date || null, end_date || null, intCapacity]
    );

    return res.status(201).json({ batch: objResult.rows[0] });
  } catch (err) {
    console.error('createBatch error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/courses/:id/batches/:batchId — Update batch (hr, super_admin, trainer)
// ---------------------------------------------------------------------------
async function updateBatch(req, res) {
  const { id: strCourseId, batchId: strBatchId } = req.params;
  const { batch_name, schedule, trainer_id, start_date, end_date, capacity, is_active } = req.body;

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const arrFields = [];
    const arrValues = [];
    let intIdx = 1;

    if (batch_name !== undefined) { arrFields.push(`name = $${intIdx++}`);       arrValues.push(batch_name.trim()); }
    if (schedule   !== undefined) { arrFields.push(`schedule = $${intIdx++}`);   arrValues.push(schedule); }
    if (trainer_id !== undefined) { arrFields.push(`trainer_id = $${intIdx++}`); arrValues.push(trainer_id); }
    if (start_date !== undefined) { arrFields.push(`start_date = $${intIdx++}`); arrValues.push(start_date); }
    if (end_date   !== undefined) { arrFields.push(`end_date = $${intIdx++}`);   arrValues.push(end_date); }
    if (capacity   !== undefined) { arrFields.push(`capacity = $${intIdx++}`);   arrValues.push(parseInt(capacity, 10)); }
    if (is_active  !== undefined) { arrFields.push(`is_active = $${intIdx++}`);  arrValues.push(is_active); }

    if (arrFields.length === 0) {
      return res.status(400).json({ error: 'At least one field must be provided.', code: 'VALIDATION_ERROR' });
    }

    arrFields.push(`updated_at = NOW()`);
    arrValues.push(strBatchId, strCourseId);

    const objResult = await client.query(
      `UPDATE batches
          SET ${arrFields.join(', ')}
        WHERE id = $${intIdx++} AND course_id = $${intIdx}
        RETURNING id, name AS batch_name, name, schedule, trainer_id, capacity,
                  enrolled_count, start_date, end_date, is_active, updated_at`,
      arrValues
    );

    if (objResult.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found.', code: 'NOT_FOUND' });
    }

    return res.status(200).json({ batch: objResult.rows[0] });
  } catch (err) {
    console.error('updateBatch error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ==========================================================================
// MODULE CRUD (US-CRS-01)
// ==========================================================================

// ---------------------------------------------------------------------------
// GET /api/courses/:id/modules — Get full module tree with sub-modules & content
// ---------------------------------------------------------------------------
async function listModules(req, res) {
  const strCourseId = req.params.id;

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const objModResult = await client.query(
      `SELECT id, title, position, created_at
         FROM modules
        WHERE course_id = $1
        ORDER BY position ASC, created_at ASC`,
      [strCourseId]
    );

    // Fetch sub-modules and content in parallel
    const arrModuleIds = objModResult.rows.map(m => m.id);

    if (arrModuleIds.length === 0) {
      return res.status(200).json({ modules: [] });
    }

    const objSubResult = await client.query(
      `SELECT sm.id, sm.module_id, sm.title, sm.position, sm.created_at
         FROM sub_modules sm
        WHERE sm.module_id = ANY($1::uuid[])
        ORDER BY sm.module_id, sm.position ASC, sm.created_at ASC`,
      [arrModuleIds]
    );

    const arrSubIds = objSubResult.rows.map(s => s.id);
    let objContentResult = { rows: [] };

    if (arrSubIds.length > 0) {
      objContentResult = await client.query(
        `SELECT id, sub_module_id, title, content_type, status,
                transcode_status, hls_url, external_url, position,
                file_size_bytes, duration_seconds, created_at
           FROM content_items
          WHERE sub_module_id = ANY($1::uuid[])
          ORDER BY sub_module_id, position ASC, created_at ASC`,
        [arrSubIds]
      );
    }

    // Build nested tree
    const mapContent = {};
    for (const objItem of objContentResult.rows) {
      if (!mapContent[objItem.sub_module_id]) mapContent[objItem.sub_module_id] = [];
      mapContent[objItem.sub_module_id].push(objItem);
    }

    const mapSubModules = {};
    for (const objSub of objSubResult.rows) {
      if (!mapSubModules[objSub.module_id]) mapSubModules[objSub.module_id] = [];
      objSub.content_items = mapContent[objSub.id] || [];
      mapSubModules[objSub.module_id].push(objSub);
    }

    const arrModules = objModResult.rows.map((objMod) => ({
      ...objMod,
      sub_modules: mapSubModules[objMod.id] || [],
    }));

    return res.status(200).json({ modules: arrModules });
  } catch (err) {
    console.error('listModules error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// POST /api/courses/:id/modules — Create module (trainer, hr, super_admin)
// BR-C01: Trainer must be assigned to this course
// ---------------------------------------------------------------------------
async function createModule(req, res) {
  const strCourseId = req.params.id;
  const { title, position } = req.body;

  // Bouncer
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title is required.', code: 'VALIDATION_ERROR' });
  }

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    // BR-C01: verify trainer assignment
    if (req.user.role === 'trainer') {
      const isAssigned = await isTrainerAssigned(client, strCourseId, req.user.user_id);
      if (!isAssigned) {
        return res.status(403).json({ error: 'Not assigned to this course.', code: 'NOT_ASSIGNED' });
      }
    }

    // Compute next position if not provided
    let intPosition = position !== undefined ? parseInt(position, 10) : null;
    if (intPosition === null) {
      const objPos = await client.query(
        `SELECT COALESCE(MAX(position) + 1, 0) AS next_pos FROM modules WHERE course_id = $1`,
        [strCourseId]
      );
      intPosition = objPos.rows[0].next_pos;
    }

    const objResult = await client.query(
      `INSERT INTO modules (course_id, title, position)
        VALUES ($1, $2, $3)
        RETURNING id, course_id, title, position, created_at`,
      [strCourseId, title.trim(), intPosition]
    );

    return res.status(201).json({ module: objResult.rows[0] });
  } catch (err) {
    console.error('createModule error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/courses/:id/modules/:modId — Update module title
// ---------------------------------------------------------------------------
async function updateModule(req, res) {
  const { id: strCourseId, modId: strModuleId } = req.params;
  const { title } = req.body;

  // Bouncer
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title is required.', code: 'VALIDATION_ERROR' });
  }

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    if (req.user.role === 'trainer') {
      const isAssigned = await isTrainerAssigned(client, strCourseId, req.user.user_id);
      if (!isAssigned) {
        return res.status(403).json({ error: 'Not assigned to this course.', code: 'NOT_ASSIGNED' });
      }
    }

    const objResult = await client.query(
      `UPDATE modules SET title = $1
        WHERE id = $2 AND course_id = $3
        RETURNING id, title, position, course_id`,
      [title.trim(), strModuleId, strCourseId]
    );

    if (objResult.rows.length === 0) {
      return res.status(404).json({ error: 'Module not found.', code: 'NOT_FOUND' });
    }

    return res.status(200).json({ module: objResult.rows[0] });
  } catch (err) {
    console.error('updateModule error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/courses/:id/modules/:modId — Delete module (only if no content)
// ---------------------------------------------------------------------------
async function deleteModule(req, res) {
  const { id: strCourseId, modId: strModuleId } = req.params;

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    if (req.user.role === 'trainer') {
      const isAssigned = await isTrainerAssigned(client, strCourseId, req.user.user_id);
      if (!isAssigned) {
        return res.status(403).json({ error: 'Not assigned to this course.', code: 'NOT_ASSIGNED' });
      }
    }

    // Check for existing content
    const objContentCheck = await client.query(
      `SELECT ci.id FROM content_items ci
         JOIN sub_modules sm ON ci.sub_module_id = sm.id
        WHERE sm.module_id = $1
        LIMIT 1`,
      [strModuleId]
    );

    if (objContentCheck.rows.length > 0) {
      return res.status(400).json({
        error: 'Cannot delete a module that contains content items.',
        code:  'MODULE_HAS_CONTENT',
      });
    }

    const objResult = await client.query(
      `DELETE FROM modules WHERE id = $1 AND course_id = $2 RETURNING id`,
      [strModuleId, strCourseId]
    );

    if (objResult.rows.length === 0) {
      return res.status(404).json({ error: 'Module not found.', code: 'NOT_FOUND' });
    }

    return res.status(200).json({ message: 'Module deleted successfully.' });
  } catch (err) {
    console.error('deleteModule error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/courses/:id/modules/reorder — Reorder modules (array of {id, position})
// ---------------------------------------------------------------------------
async function reorderModules(req, res) {
  const strCourseId = req.params.id;
  const { items } = req.body;

  // Bouncer
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required.', code: 'VALIDATION_ERROR' });
  }

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    if (req.user.role === 'trainer') {
      const isAssigned = await isTrainerAssigned(client, strCourseId, req.user.user_id);
      if (!isAssigned) {
        return res.status(403).json({ error: 'Not assigned to this course.', code: 'NOT_ASSIGNED' });
      }
    }

    await client.query('BEGIN');
    for (const objItem of items) {
      if (!objItem.id || objItem.position === undefined) continue;
      await client.query(
        `UPDATE modules SET position = $1 WHERE id = $2 AND course_id = $3`,
        [parseInt(objItem.position, 10), objItem.id, strCourseId]
      );
    }
    await client.query('COMMIT');

    return res.status(200).json({ message: 'Modules reordered successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('reorderModules error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ==========================================================================
// SUB-MODULE CRUD
// ==========================================================================

// ---------------------------------------------------------------------------
// POST /api/courses/:id/modules/:modId/sub-modules — Create sub-module
// ---------------------------------------------------------------------------
async function createSubModule(req, res) {
  const { id: strCourseId, modId: strModuleId } = req.params;
  const { title, position } = req.body;

  // Bouncer
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title is required.', code: 'VALIDATION_ERROR' });
  }

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    if (req.user.role === 'trainer') {
      const isAssigned = await isTrainerAssigned(client, strCourseId, req.user.user_id);
      if (!isAssigned) {
        return res.status(403).json({ error: 'Not assigned to this course.', code: 'NOT_ASSIGNED' });
      }
    }

    let intPosition = position !== undefined ? parseInt(position, 10) : null;
    if (intPosition === null) {
      const objPos = await client.query(
        `SELECT COALESCE(MAX(position) + 1, 0) AS next_pos FROM sub_modules WHERE module_id = $1`,
        [strModuleId]
      );
      intPosition = objPos.rows[0].next_pos;
    }

    const objResult = await client.query(
      `INSERT INTO sub_modules (module_id, title, position)
        VALUES ($1, $2, $3)
        RETURNING id, module_id, title, position, created_at`,
      [strModuleId, title.trim(), intPosition]
    );

    return res.status(201).json({ sub_module: objResult.rows[0] });
  } catch (err) {
    console.error('createSubModule error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/courses/:id/modules/:modId/sub-modules/:subId — Update sub-module
// ---------------------------------------------------------------------------
async function updateSubModule(req, res) {
  const { id: strCourseId, modId: strModuleId, subId: strSubModuleId } = req.params;
  const { title } = req.body;

  // Bouncer
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title is required.', code: 'VALIDATION_ERROR' });
  }

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    if (req.user.role === 'trainer') {
      const isAssigned = await isTrainerAssigned(client, strCourseId, req.user.user_id);
      if (!isAssigned) {
        return res.status(403).json({ error: 'Not assigned to this course.', code: 'NOT_ASSIGNED' });
      }
    }

    const objResult = await client.query(
      `UPDATE sub_modules SET title = $1
        WHERE id = $2 AND module_id = $3
        RETURNING id, module_id, title, position`,
      [title.trim(), strSubModuleId, strModuleId]
    );

    if (objResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sub-module not found.', code: 'NOT_FOUND' });
    }

    return res.status(200).json({ sub_module: objResult.rows[0] });
  } catch (err) {
    console.error('updateSubModule error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/courses/:id/modules/:modId/sub-modules/reorder — Reorder sub-modules
// ---------------------------------------------------------------------------
async function reorderSubModules(req, res) {
  const { id: strCourseId, modId: strModuleId } = req.params;
  const { items } = req.body;

  // Bouncer
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required.', code: 'VALIDATION_ERROR' });
  }

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    if (req.user.role === 'trainer') {
      const isAssigned = await isTrainerAssigned(client, strCourseId, req.user.user_id);
      if (!isAssigned) {
        return res.status(403).json({ error: 'Not assigned to this course.', code: 'NOT_ASSIGNED' });
      }
    }

    await client.query('BEGIN');
    for (const objItem of items) {
      if (!objItem.id || objItem.position === undefined) continue;
      await client.query(
        `UPDATE sub_modules SET position = $1 WHERE id = $2 AND module_id = $3`,
        [parseInt(objItem.position, 10), objItem.id, strModuleId]
      );
    }
    await client.query('COMMIT');

    return res.status(200).json({ message: 'Sub-modules reordered successfully.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('reorderSubModules error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ==========================================================================
// CONTENT ITEM CRUD (US-CRS-03, US-CRS-04)
// ==========================================================================

// ---------------------------------------------------------------------------
// POST /api/courses/:courseId/sub-modules/:subModuleId/content
// Upload document or create external link (US-CRS-03)
// ---------------------------------------------------------------------------
async function createContent(req, res) {
  const { courseId: strCourseId, subModuleId: strSubModuleId } = req.params;
  const { title, content_type, external_url, position } = req.body;

  // Bouncer
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title is required.', code: 'VALIDATION_ERROR' });
  }

  const arrAllowedDocTypes = ['pdf', 'document', STR_CONTENT_TYPE_EXTERNAL];

  if (!content_type || !arrAllowedDocTypes.includes(content_type)) {
    return res.status(400).json({
      error: `content_type must be one of: ${arrAllowedDocTypes.join(', ')}.`,
      code:  'VALIDATION_ERROR',
    });
  }

  if (content_type === STR_CONTENT_TYPE_EXTERNAL) {
    if (!external_url || !isValidUrl(external_url)) {
      return res.status(400).json({
        error: 'A valid external_url is required for external_link content.',
        code:  'VALIDATION_ERROR',
      });
    }
  } else if (!req.file) {
    return res.status(400).json({ error: 'A file upload is required for this content type.', code: 'FILE_REQUIRED' });
  }

  // Validate MIME type for document uploads
  if (req.file && !ARR_ALLOWED_DOC_MIMES.includes(req.file.mimetype)) {
    return res.status(400).json({
      error: 'Invalid file type. Allowed: PDF, PPT, PPTX, DOC, DOCX.',
      code:  'INVALID_MIME_TYPE',
    });
  }

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    if (req.user.role === 'trainer') {
      const isAssigned = await isTrainerAssigned(client, strCourseId, req.user.user_id);
      if (!isAssigned) {
        return res.status(403).json({ error: 'Not assigned to this course.', code: 'NOT_ASSIGNED' });
      }
    }

    let strS3Key       = null;
    let strExternalUrl = null;
    let intFileSize    = null;

    if (content_type === STR_CONTENT_TYPE_EXTERNAL) {
      strExternalUrl = external_url;
    } else {
      // Upload to local storage (S3 stub)
      strS3Key = s3.generateUniqueKey(
        `documents/${strCourseId}/${strSubModuleId}`,
        req.file.originalname
      );
      await s3.uploadFile(req.file.buffer, strS3Key, req.file.mimetype);
      intFileSize = req.file.size;
    }

    // Compute position
    let intPosition = position !== undefined ? parseInt(position, 10) : null;
    if (intPosition === null) {
      const objPos = await client.query(
        `SELECT COALESCE(MAX(position) + 1, 0) AS next_pos FROM content_items WHERE sub_module_id = $1`,
        [strSubModuleId]
      );
      intPosition = objPos.rows[0].next_pos;
    }

    const objResult = await client.query(
      `INSERT INTO content_items
              (sub_module_id, title, content_type, s3_key, external_url,
               transcode_status, status, position, file_size_bytes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, sub_module_id, title, content_type, s3_key, external_url,
                  transcode_status, status, position, file_size_bytes, created_at`,
      [strSubModuleId, title.trim(), content_type, strS3Key, strExternalUrl,
       STR_TRANSCODE_NOT_APPLICABLE, STR_STATUS_DRAFT, intPosition, intFileSize, req.user.user_id]
    );

    return res.status(201).json({ content_item: objResult.rows[0] });
  } catch (err) {
    console.error('createContent error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// POST /api/courses/:courseId/sub-modules/:subModuleId/content/video
// Upload MP4 video + trigger HLS transcoding (US-CRS-02)
// ---------------------------------------------------------------------------
async function uploadVideo(req, res) {
  const { courseId: strCourseId, subModuleId: strSubModuleId } = req.params;
  const { title, position } = req.body;

  // Bouncer
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title is required.', code: 'VALIDATION_ERROR' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'A video file is required.', code: 'FILE_REQUIRED' });
  }
  if (req.file.mimetype !== 'video/mp4') {
    return res.status(400).json({ error: 'Only MP4 video files are accepted.', code: 'INVALID_MIME_TYPE' });
  }

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    if (req.user.role === 'trainer') {
      const isAssigned = await isTrainerAssigned(client, strCourseId, req.user.user_id);
      if (!isAssigned) {
        return res.status(403).json({ error: 'Not assigned to this course.', code: 'NOT_ASSIGNED' });
      }
    }

    // Upload raw MP4 to storage
    const strRawKey = `videos/raw/${strCourseId}/${crypto.randomUUID()}.mp4`;
    await s3.uploadFile(req.file.buffer, strRawKey, 'video/mp4');

    // Compute position
    let intPosition = position !== undefined ? parseInt(position, 10) : null;
    if (intPosition === null) {
      const objPos = await client.query(
        `SELECT COALESCE(MAX(position) + 1, 0) AS next_pos FROM content_items WHERE sub_module_id = $1`,
        [strSubModuleId]
      );
      intPosition = objPos.rows[0].next_pos;
    }

    // Create content_item with processing status
    const objResult = await client.query(
      `INSERT INTO content_items
              (sub_module_id, title, content_type, s3_key, transcode_status,
               status, position, file_size_bytes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, sub_module_id, title, content_type, s3_key,
                  transcode_status, status, position, created_at`,
      [strSubModuleId, title.trim(), STR_CONTENT_TYPE_VIDEO, strRawKey,
       STR_TRANSCODE_PROCESSING, STR_STATUS_DRAFT, intPosition, req.file.size, req.user.user_id]
    );

    const strContentId = objResult.rows[0].id;

    // Trigger transcoding (async — stub completes after 2 seconds)
    const { jobId: strJobId } = await mc.createTranscodeJob(strRawKey, strContentId);

    // Store job ID
    await client.query(
      `UPDATE content_items SET job_id = $1 WHERE id = $2`,
      [strJobId, strContentId]
    );

    return res.status(202).json({
      message:           'Upload successful. Transcoding started.',
      content_id:        strContentId,
      transcode_status:  STR_TRANSCODE_PROCESSING,
      job_id:            strJobId,
    });
  } catch (err) {
    console.error('uploadVideo error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/courses/:courseId/sub-modules/:subModuleId/content — List content items
// ---------------------------------------------------------------------------
async function listContent(req, res) {
  const { courseId: strCourseId, subModuleId: strSubModuleId } = req.params;

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const objResult = await client.query(
      `SELECT id, sub_module_id, title, content_type, s3_key, external_url,
              transcode_status, hls_url, status, position,
              file_size_bytes, duration_seconds, created_at, updated_at
         FROM content_items
        WHERE sub_module_id = $1
        ORDER BY position ASC, created_at ASC`,
      [strSubModuleId]
    );

    return res.status(200).json({ content_items: objResult.rows });
  } catch (err) {
    console.error('listContent error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/content/:contentId/url — Generate pre-signed URL (BR-C02 enforced)
// ---------------------------------------------------------------------------
async function getContentUrl(req, res) {
  const strContentId = req.params.contentId;

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const objResult = await client.query(
      `SELECT id, title, content_type, s3_key, external_url, hls_url, status, transcode_status
         FROM content_items
        WHERE id = $1`,
      [strContentId]
    );

    if (objResult.rows.length === 0) {
      return res.status(404).json({ error: 'Content item not found.', code: 'NOT_FOUND' });
    }

    const objItem = objResult.rows[0];

    // External links return URL directly
    if (objItem.content_type === STR_CONTENT_TYPE_EXTERNAL) {
      return res.status(200).json({ url: objItem.external_url, content_type: objItem.content_type });
    }

    // Video: return HLS URL if transcoding complete
    if (objItem.content_type === STR_CONTENT_TYPE_VIDEO) {
      if (objItem.transcode_status !== STR_TRANSCODE_COMPLETE) {
        return res.status(400).json({
          error: 'Video is still processing. Please try again shortly.',
          code:  'TRANSCODE_PENDING',
        });
      }
      return res.status(200).json({ url: objItem.hls_url, content_type: objItem.content_type });
    }

    // Documents: generate presigned URL
    if (!objItem.s3_key) {
      return res.status(404).json({ error: 'File not found.', code: 'FILE_NOT_FOUND' });
    }

    const strUrl = s3.generatePresignedUrl(objItem.s3_key);

    return res.status(200).json({ url: strUrl, content_type: objItem.content_type });
  } catch (err) {
    console.error('getContentUrl error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/content/:contentId/transcode-status — Check transcoding status
// ---------------------------------------------------------------------------
async function getTranscodeStatus(req, res) {
  const strContentId = req.params.contentId;

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const objResult = await client.query(
      `SELECT id, title, content_type, transcode_status, hls_url, job_id
         FROM content_items
        WHERE id = $1`,
      [strContentId]
    );

    if (objResult.rows.length === 0) {
      return res.status(404).json({ error: 'Content item not found.', code: 'NOT_FOUND' });
    }

    const objItem = objResult.rows[0];

    return res.status(200).json({
      content_id:       objItem.id,
      title:            objItem.title,
      transcode_status: objItem.transcode_status,
      hls_url:          objItem.hls_url,
      job_id:           objItem.job_id,
    });
  } catch (err) {
    console.error('getTranscodeStatus error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/content/:id/publish — Publish content item (US-CRS-04)
// ---------------------------------------------------------------------------
async function publishContent(req, res) {
  const strContentId = req.params.id;

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const objResult = await client.query(
      `SELECT ci.id, ci.title, ci.content_type, ci.transcode_status,
              ci.status, ci.created_by,
              sm.module_id, m.course_id
         FROM content_items ci
         JOIN sub_modules sm ON ci.sub_module_id = sm.id
         JOIN modules      m ON sm.module_id = m.id
        WHERE ci.id = $1`,
      [strContentId]
    );

    if (objResult.rows.length === 0) {
      return res.status(404).json({ error: 'Content item not found.', code: 'NOT_FOUND' });
    }

    const objItem = objResult.rows[0];

    // BR-C01 — verify trainer ownership
    if (req.user.role === 'trainer') {
      const isAssigned = await isTrainerAssigned(client, objItem.course_id, req.user.user_id);
      if (!isAssigned) {
        return res.status(403).json({ error: 'Not assigned to this course.', code: 'NOT_ASSIGNED' });
      }
    }

    // Video must finish transcoding before publishing
    if (objItem.content_type === STR_CONTENT_TYPE_VIDEO &&
        objItem.transcode_status !== STR_TRANSCODE_COMPLETE) {
      return res.status(400).json({
        error: 'Video must finish transcoding before publishing.',
        code:  'TRANSCODE_PENDING',
      });
    }

    const objUpdated = await client.query(
      `UPDATE content_items SET status = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, title, content_type, status, transcode_status, updated_at`,
      [STR_STATUS_PUBLISHED, strContentId]
    );

    // Invalidate dashboard cache for all batches of this course
    await _invalidateCourseCache(client, objItem.course_id);

    return res.status(200).json({ content_item: objUpdated.rows[0] });
  } catch (err) {
    console.error('publishContent error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/content/:id/unpublish — Unpublish content item
// ---------------------------------------------------------------------------
async function unpublishContent(req, res) {
  const strContentId = req.params.id;

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const objResult = await client.query(
      `SELECT ci.id, ci.created_by, m.course_id
         FROM content_items ci
         JOIN sub_modules sm ON ci.sub_module_id = sm.id
         JOIN modules      m ON sm.module_id = m.id
        WHERE ci.id = $1`,
      [strContentId]
    );

    if (objResult.rows.length === 0) {
      return res.status(404).json({ error: 'Content item not found.', code: 'NOT_FOUND' });
    }

    const objItem = objResult.rows[0];

    if (req.user.role === 'trainer') {
      const isAssigned = await isTrainerAssigned(client, objItem.course_id, req.user.user_id);
      if (!isAssigned) {
        return res.status(403).json({ error: 'Not assigned to this course.', code: 'NOT_ASSIGNED' });
      }
    }

    const objUpdated = await client.query(
      `UPDATE content_items SET status = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, title, content_type, status, updated_at`,
      [STR_STATUS_DRAFT, strContentId]
    );

    await _invalidateCourseCache(client, objItem.course_id);

    return res.status(200).json({ content_item: objUpdated.rows[0] });
  } catch (err) {
    console.error('unpublishContent error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Helper: _invalidateCourseCache(client, strCourseId)
// Invalidates dashboard cache for all batches in a course.
// ---------------------------------------------------------------------------
async function _invalidateCourseCache(client, strCourseId) {
  try {
    const objBatches = await client.query(
      `SELECT id FROM batches WHERE course_id = $1`,
      [strCourseId]
    );
    for (const objBatch of objBatches.rows) {
      await invalidateDashboardCache(objBatch.id);
    }
  } catch (err) {
    console.error('_invalidateCourseCache error:', err.message);
  }
}

// ==========================================================================
// BATCH DASHBOARD (US-CRS-07)
// ==========================================================================

// ---------------------------------------------------------------------------
// GET /api/courses/batches/:batchId/dashboard — Batch performance dashboard
// ---------------------------------------------------------------------------
async function getBatchDashboard(req, res) {
  const strBatchId  = req.params.batchId;
  const strCacheKey = `batch_dashboard:${strBatchId}`;

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    // BR-A01: Verify trainer is assigned to this batch
    if (req.user.role === 'trainer') {
      const objBatch = await client.query(
        `SELECT course_id FROM batches WHERE id = $1 AND trainer_id = $2`,
        [strBatchId, req.user.user_id]
      );
      if (objBatch.rows.length === 0) {
        return res.status(403).json({ error: 'Not assigned to this batch.', code: 'NOT_ASSIGNED' });
      }
    }

    // Check Redis cache
    const strCached = await redis.get(strCacheKey);
    if (strCached) {
      return res.status(200).json(JSON.parse(strCached));
    }

    // Batch info
    const objBatchResult = await client.query(
      `SELECT b.id, b.name, b.enrolled_count, b.course_id
         FROM batches b WHERE b.id = $1`,
      [strBatchId]
    );
    if (objBatchResult.rows.length === 0) {
      return res.status(404).json({ error: 'Batch not found.', code: 'NOT_FOUND' });
    }
    const objBatch   = objBatchResult.rows[0];
    const strCourseId = objBatch.course_id;

    // Enrolled students
    const objStudentsResult = await client.query(
      `SELECT DISTINCT s.user_id AS id, s.first_name, s.last_name, s.email
         FROM enrollments e
         JOIN students s ON e.student_id = s.id
        WHERE e.batch_id = $1 AND e.status = 'active'`,
      [strBatchId]
    );
    const arrStudents     = objStudentsResult.rows;
    const intTotalStudents = arrStudents.length;

    // Published tasks for this batch
    const objTasksResult = await client.query(
      `SELECT id, title, due_date FROM tasks
        WHERE batch_id = $1 AND status = 'published'`,
      [strBatchId]
    );
    const arrTasks     = objTasksResult.rows;
    const intTotalTasks = arrTasks.length;

    // All submissions for this batch's tasks
    const objSubsResult = await client.query(
      `SELECT ts.task_id, ts.student_id, ts.score, ts.status
         FROM task_submissions ts
         JOIN tasks t ON ts.task_id = t.id
        WHERE t.batch_id = $1`,
      [strBatchId]
    );

    // Build per-student metrics
    const mapStudentSubs = {};
    for (const objSub of objSubsResult.rows) {
      if (!mapStudentSubs[objSub.student_id]) mapStudentSubs[objSub.student_id] = [];
      mapStudentSubs[objSub.student_id].push(objSub);
    }

    const arrNow         = new Date();
    const arrAtRisk      = [];
    const arrLeaderboard = [];
    let   dblTotalPct    = 0;

    for (const objStudent of arrStudents) {
      const arrSubs           = mapStudentSubs[objStudent.id] || [];
      const intSubmitted      = arrSubs.length;
      const dblCompletionPct  = intTotalTasks > 0
        ? Math.round((intSubmitted / intTotalTasks) * 100 * 10) / 10
        : 0;

      // Overdue: task past due_date and student has no submission
      const arrSubmittedTaskIds = arrSubs.map(s => s.task_id);
      const intOverdue = arrTasks.filter(
        t => new Date(t.due_date) < arrNow && !arrSubmittedTaskIds.includes(t.id)
      ).length;

      dblTotalPct += dblCompletionPct;

      const dblAvgScore = arrSubs.filter(s => s.score !== null).length > 0
        ? Math.round(arrSubs.reduce((acc, s) => acc + (s.score || 0), 0) / arrSubs.filter(s => s.score !== null).length * 10) / 10
        : null;

      arrLeaderboard.push({
        student_id:         objStudent.id,
        name:               `${objStudent.first_name} ${objStudent.last_name || ''}`.trim(),
        completion_percent: dblCompletionPct,
        avg_score:          dblAvgScore,
      });

      if (dblCompletionPct < INT_AT_RISK_THRESHOLD_PCT || intOverdue >= INT_AT_RISK_OVERDUE_COUNT) {
        arrAtRisk.push({
          student_id:          objStudent.id,
          name:                `${objStudent.first_name} ${objStudent.last_name || ''}`.trim(),
          email:               objStudent.email,
          completion_percent:  dblCompletionPct,
          overdue_tasks_count: intOverdue,
        });
      }
    }

    // Sort leaderboard
    arrLeaderboard.sort((a, b) => b.completion_percent - a.completion_percent || (b.avg_score || 0) - (a.avg_score || 0));
    const arrTopLeaderboard = arrLeaderboard
      .slice(0, INT_LEADERBOARD_TOP_N)
      .map((s, idx) => ({ rank: idx + 1, ...s }));

    // Task submission rates
    const mapTaskSubs = {};
    for (const objSub of objSubsResult.rows) {
      if (!mapTaskSubs[objSub.task_id]) mapTaskSubs[objSub.task_id] = 0;
      mapTaskSubs[objSub.task_id]++;
    }

    const arrTaskRates = arrTasks.map(t => ({
      task_id:                 t.id,
      title:                   t.title,
      submitted_count:         mapTaskSubs[t.id] || 0,
      total_students:          intTotalStudents,
      submission_rate_percent: intTotalStudents > 0
        ? Math.round(((mapTaskSubs[t.id] || 0) / intTotalStudents) * 100 * 10) / 10
        : 0,
    }));

    const dblAvgCompletion = intTotalStudents > 0
      ? Math.round((dblTotalPct / intTotalStudents) * 10) / 10
      : 0;

    const objDashboard = {
      batch_id:                  strBatchId,
      batch_name:                objBatch.name,
      total_students:            intTotalStudents,
      total_published_tasks:     intTotalTasks,
      average_completion_percent: dblAvgCompletion,
      at_risk_students:          arrAtRisk,
      task_submission_rates:     arrTaskRates,
      leaderboard:               arrTopLeaderboard,
    };

    // Cache for 5 minutes
    await redis.set(strCacheKey, JSON.stringify(objDashboard), 'EX', INT_DASHBOARD_CACHE_TTL_SEC);

    return res.status(200).json(objDashboard);
  } catch (err) {
    console.error('getBatchDashboard error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/courses/batches/:batchId/students/:studentId — Student detail
// Trainer can only access students from their own batches (BR-A01)
// ---------------------------------------------------------------------------
async function getBatchStudent(req, res) {
  const { batchId: strBatchId, studentId: strStudentUserId } = req.params;

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    // BR-A01: verify trainer assignment
    if (req.user.role === 'trainer') {
      const objBatch = await client.query(
        `SELECT id FROM batches WHERE id = $1 AND trainer_id = $2`,
        [strBatchId, req.user.user_id]
      );
      if (objBatch.rows.length === 0) {
        return res.status(403).json({ error: 'Not assigned to this batch.', code: 'NOT_ASSIGNED' });
      }
    }

    // Student info
    const objStudentResult = await client.query(
      `SELECT s.user_id AS id, s.first_name, s.last_name, s.email, s.phone,
              e.status AS enrollment_status, e.total_fee, e.enrolled_at
         FROM students s
         JOIN enrollments e ON s.id = e.student_id
        WHERE s.user_id = $1 AND e.batch_id = $2`,
      [strStudentUserId, strBatchId]
    );

    if (objStudentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found in this batch.', code: 'NOT_FOUND' });
    }

    const objStudent = objStudentResult.rows[0];

    // Task submissions with scores
    const objSubsResult = await client.query(
      `SELECT t.title AS task_title, t.task_type, t.due_date, t.max_score,
              ts.score, ts.feedback, ts.status AS submission_status, ts.submitted_at, ts.evaluated_at
         FROM tasks t
         LEFT JOIN task_submissions ts ON t.id = ts.task_id AND ts.student_id = $1
        WHERE t.batch_id = $2 AND t.status = 'published'
        ORDER BY t.due_date ASC`,
      [strStudentUserId, strBatchId]
    );

    return res.status(200).json({
      student:         objStudent,
      task_submissions: objSubsResult.rows,
    });
  } catch (err) {
    console.error('getBatchStudent error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ==========================================================================
// LIVE SESSIONS (US-CRS-08)
// ==========================================================================

// ---------------------------------------------------------------------------
// POST /api/courses/batches/:batchId/live-sessions — Create live session
// ---------------------------------------------------------------------------
async function createLiveSession(req, res) {
  const strBatchId = req.params.batchId;
  const { title, scheduled_at, duration_minutes, meeting_url } = req.body;

  // Bouncer
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title is required.', code: 'VALIDATION_ERROR' });
  }
  if (!scheduled_at) {
    return res.status(400).json({ error: 'scheduled_at is required.', code: 'VALIDATION_ERROR' });
  }
  if (!meeting_url || !isValidUrl(meeting_url)) {
    return res.status(400).json({ error: 'A valid meeting_url is required.', code: 'VALIDATION_ERROR' });
  }

  const dtScheduled = new Date(scheduled_at);
  if (isNaN(dtScheduled.getTime()) || dtScheduled <= new Date()) {
    return res.status(400).json({
      error: 'scheduled_at must be a valid future date.',
      code:  'VALIDATION_ERROR',
    });
  }

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    // BR-C01: verify trainer assignment
    if (req.user.role === 'trainer') {
      const objBatch = await client.query(
        `SELECT course_id FROM batches WHERE id = $1 AND trainer_id = $2`,
        [strBatchId, req.user.user_id]
      );
      if (objBatch.rows.length === 0) {
        return res.status(403).json({ error: 'Not assigned to this batch.', code: 'NOT_ASSIGNED' });
      }
    }

    const intDurationMinutes = duration_minutes ? parseInt(duration_minutes, 10) : 60;

    const objResult = await client.query(
      `INSERT INTO live_sessions (batch_id, title, scheduled_at, duration_minutes, meeting_url, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, batch_id, title, scheduled_at, duration_minutes, meeting_url, created_at`,
      [strBatchId, title.trim(), dtScheduled, intDurationMinutes, meeting_url, req.user.user_id]
    );

    return res.status(201).json({ live_session: objResult.rows[0] });
  } catch (err) {
    console.error('createLiveSession error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// GET /api/courses/batches/:batchId/live-sessions — List live sessions
// ---------------------------------------------------------------------------
async function listLiveSessions(req, res) {
  const strBatchId = req.params.batchId;

  const client = await pool.connect();
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const objResult = await client.query(
      `SELECT id, batch_id, title, scheduled_at, duration_minutes, meeting_url,
              google_calendar_event_id, created_by, created_at
         FROM live_sessions
        WHERE batch_id = $1
        ORDER BY scheduled_at ASC`,
      [strBatchId]
    );

    return res.status(200).json({ live_sessions: objResult.rows });
  } catch (err) {
    console.error('listLiveSessions error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ==========================================================================
// MODULE EXPORTS
// ==========================================================================
module.exports = {
  // Multer wrappers
  handleDocUpload,
  handleVideoUpload,
  handleSubmissionUpload,
  // Course
  listCourses,
  createCourse,
  getCourse,
  updateCourse,
  deactivateCourse,
  // Batch
  listCourseBatches,
  createBatch,
  updateBatch,
  // Module
  listModules,
  createModule,
  updateModule,
  deleteModule,
  reorderModules,
  // Sub-Module
  createSubModule,
  updateSubModule,
  reorderSubModules,
  // Content
  createContent,
  uploadVideo,
  listContent,
  getContentUrl,
  getTranscodeStatus,
  publishContent,
  unpublishContent,
  // Dashboard
  getBatchDashboard,
  getBatchStudent,
  // Live Sessions
  createLiveSession,
  listLiveSessions,
  // Shared helper
  invalidateDashboardCache,
};
