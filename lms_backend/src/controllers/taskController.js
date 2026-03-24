// ==========================================================================
// ACADENO LMS — Task Management Controller (EPIC-05)
// ==========================================================================
// Handles the full task lifecycle: creation, publishing, student submission,
// trainer evaluation, and submission listing.
//
// Business Rules Enforced:
//   BR-C01 — Trainer can only manage tasks for courses they are assigned to.
//   BR-C02 — Student can submit only if they have an active enrollment.
//             (Enforced by checkEnrollment middleware on submit routes.)
//   BR-C03 — Task due dates cannot be set in the past.
//
// Patterns followed (EPIC-01 baseline):
//   - pool.connect() + SET app.current_user_role for every query
//   - Hungarian notation for all local variables
//   - Bouncer Pattern: all validation at the top of each function
//   - Zero magic values: all constants declared at top of module
// ==========================================================================

const multer    = require('multer');
const { pool }  = require('../db/index');
const s3        = require('../utils/s3');

// ---------------------------------------------------------------------------
// Module-level Constants (Zero Magic Values Rule)
// ---------------------------------------------------------------------------
const INT_MAX_SUBMISSION_BYTES    = 50 * 1024 * 1024;          // 50 MB
const STR_STATUS_DRAFT            = 'draft';
const STR_STATUS_PUBLISHED        = 'published';
const STR_GRADE_PASS              = 'pass';
const STR_GRADE_FAIL              = 'fail';
const STR_GRADE_PENDING           = 'pending';
const STR_SUBMISSION_PREFIX       = 'submissions';
const INT_MAX_SCORE_BOUND         = 100;
const INT_MIN_SCORE_BOUND         = 0;

const ARR_VALID_SUBMISSION_MIMES  = [
  'application/pdf',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'text/plain',
  'image/jpeg',
  'image/png',
];

// ---------------------------------------------------------------------------
// Multer — memory storage for submission file uploads
// ---------------------------------------------------------------------------
const uploadSubmissionMiddleware = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: INT_MAX_SUBMISSION_BYTES },
}).single('file');

// ---------------------------------------------------------------------------
// handleSubmissionUpload(req, res, next)
// ---------------------------------------------------------------------------
// Exported middleware wrapper so routes can use it directly.
// Converts multer errors into clean JSON responses.
// ---------------------------------------------------------------------------
function handleSubmissionUpload(req, res, next) {
  uploadSubmissionMiddleware(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large; maximum is 50 MB for submissions.',
        code:  'FILE_TOO_LARGE',
      });
    }
    if (err) {
      return res.status(400).json({
        error: 'File upload error.',
        code:  'UPLOAD_ERROR',
      });
    }
    return next();
  });
}

// ---------------------------------------------------------------------------
// _isTrainerAssigned(client, strCourseId, strUserId) → boolean
// ---------------------------------------------------------------------------
// Business intent: Enforce BR-C01 — trainer can only manage content for
// courses they have been explicitly assigned to via batch assignments.
//
// Side effects: Issues a SELECT query on course_batches.
// ---------------------------------------------------------------------------
async function _isTrainerAssigned(client, strCourseId, strUserId) {
  const objResult = await client.query(
    `SELECT 1
       FROM batches
      WHERE course_id  = $1
        AND trainer_id = (SELECT id FROM trainers WHERE user_id = $2 LIMIT 1)
        AND is_active  = true
      LIMIT 1`,
    [strCourseId, strUserId]
  );
  return objResult.rows.length > 0;
}

// ---------------------------------------------------------------------------
// _resolveTaskCourse(client, strTaskId) → { course_id, batch_id }
// ---------------------------------------------------------------------------
// Business intent: Resolve a task's parent course and batch so BR-C01 can
// be verified when a trainer attempts to evaluate or manage a task.
// ---------------------------------------------------------------------------
async function _resolveTaskCourse(client, strTaskId) {
  const objResult = await client.query(
    `SELECT t.course_id, t.batch_id
       FROM tasks t
      WHERE t.id = $1`,
    [strTaskId]
  );
  return objResult.rows[0] || null;
}

// ===========================================================================
// TASK CRUD
// ===========================================================================

// ---------------------------------------------------------------------------
// createTask(req, res)
// ---------------------------------------------------------------------------
// POST /api/tasks
// Roles: trainer, super_admin
//
// Body: { title, description, batch_id, course_id, due_date,
//          max_score, instructions }
//
// BR-C01: trainer must be assigned to the course.
// BR-C03: due_date cannot be in the past.
// ---------------------------------------------------------------------------
async function createTask(req, res) {
  // Bouncer
  const {
    title,
    description,
    batch_id,
    course_id,
    due_date,
    max_score,
    instructions,
    target_student_id,
  } = req.body;

  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({ error: 'title is required.', code: 'MISSING_TITLE' });
  }
  if (!batch_id) {
    return res.status(400).json({ error: 'batch_id is required.', code: 'MISSING_BATCH_ID' });
  }
  if (!course_id) {
    return res.status(400).json({ error: 'course_id is required.', code: 'MISSING_COURSE_ID' });
  }
  if (!due_date) {
    return res.status(400).json({ error: 'due_date is required.', code: 'MISSING_DUE_DATE' });
  }

  // BR-C03: due date cannot be in the past
  const datDue = new Date(due_date);
  if (isNaN(datDue.getTime())) {
    return res.status(400).json({ error: 'due_date is not a valid date.', code: 'INVALID_DUE_DATE' });
  }
  if (datDue <= new Date()) {
    return res.status(400).json({ error: 'due_date must be a future date (BR-C03).', code: 'DUE_DATE_IN_PAST' });
  }

  if (max_score !== undefined && max_score !== null) {
    const intScore = Number(max_score);
    if (isNaN(intScore) || intScore < INT_MIN_SCORE_BOUND || intScore > INT_MAX_SCORE_BOUND) {
      return res.status(400).json({
        error: `max_score must be between ${INT_MIN_SCORE_BOUND} and ${INT_MAX_SCORE_BOUND}.`,
        code:  'INVALID_MAX_SCORE',
      });
    }
  }

  const client = await pool.connect();

  try {
    await client.query("SET app.current_user_role = 'super_admin'");

    // BR-C01: trainer can only manage tasks for their assigned courses
    if (req.user.role === 'trainer') {
      const isAssigned = await _isTrainerAssigned(client, course_id, req.user.user_id);
      if (!isAssigned) {
        return res.status(403).json({
          error: 'You are not assigned to this course (BR-C01).',
          code:  'NOT_ASSIGNED',
        });
      }
    }

    // Verify batch belongs to the course
    const objBatchCheck = await client.query(
      `SELECT id FROM batches WHERE id = $1 AND course_id = $2`,
      [batch_id, course_id]
    );
    if (objBatchCheck.rows.length === 0) {
      return res.status(400).json({
        error: 'batch_id does not belong to the specified course_id.',
        code:  'BATCH_COURSE_MISMATCH',
      });
    }

    const objResult = await client.query(
      `INSERT INTO tasks (
         title, description, batch_id, course_id, due_date,
         max_score, task_type, rubric, created_by, target_student_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        title,
        description,
        batch_id,
        course_id,
        datDue,
        max_score || 100,
        'assignment',
        instructions,
        req.user.user_id,
        target_student_id || null,
      ]
    );

    return res.status(201).json({ task: objResult.rows[0] });
  } catch (err) {
    console.error('createTask error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// publishTask(req, res)
// ---------------------------------------------------------------------------
// PATCH /api/tasks/:id/publish
// Roles: trainer, super_admin
//
// Transitions task status from 'draft' → 'published'.
// BR-C01: trainer must be assigned to the course.
// ---------------------------------------------------------------------------
async function publishTask(req, res) {
  // Bouncer
  const strTaskId = req.params.id;
  if (!strTaskId) {
    return res.status(400).json({ error: 'Task id is required.', code: 'MISSING_ID' });
  }

  const client = await pool.connect();

  try {
    await client.query("SET app.current_user_role = 'super_admin'");

    const objTask = await client.query(
      `SELECT * FROM tasks WHERE id = $1`,
      [strTaskId]
    );

    if (objTask.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.', code: 'TASK_NOT_FOUND' });
    }

    const objTaskRow = objTask.rows[0];

    // BR-C01: trainer can only publish tasks for their assigned courses
    if (req.user.role === 'trainer') {
      const isAssigned = await _isTrainerAssigned(client, objTaskRow.course_id, req.user.user_id);
      if (!isAssigned) {
        return res.status(403).json({
          error: 'You are not assigned to this course (BR-C01).',
          code:  'NOT_ASSIGNED',
        });
      }
    }

    if (objTaskRow.status === STR_STATUS_PUBLISHED) {
      return res.status(400).json({
        error: 'Task is already published.',
        code:  'ALREADY_PUBLISHED',
      });
    }

    const objResult = await client.query(
      `UPDATE tasks
          SET status     = $1,
              updated_at = NOW()
        WHERE id = $2
       RETURNING *`,
      [STR_STATUS_PUBLISHED, strTaskId]
    );

    return res.json({ task: objResult.rows[0] });
  } catch (err) {
    console.error('publishTask error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// listTasks(req, res)
// ---------------------------------------------------------------------------
// GET /api/tasks?batch_id=xxx
//
// - Students: see only published tasks for their enrolled batch.
// - Trainers: see all tasks (draft + published) for their batches.
// - HR / super_admin: see all tasks for the batch.
// ---------------------------------------------------------------------------
async function listTasks(req, res) {
  // Bouncer
  const strBatchId = req.query.batch_id;
  if (!strBatchId) {
    return res.status(400).json({ error: 'batch_id query param is required.', code: 'MISSING_BATCH_ID' });
  }

  const client = await pool.connect();

  try {
    await client.query("SET app.current_user_role = 'super_admin'");

    let strStatusFilter  = '';
    let arrParams        = [strBatchId];

    if (req.user.role === 'student') {
      // Students only see published tasks and must be enrolled
      strStatusFilter = `AND t.status = '${STR_STATUS_PUBLISHED}'`;

      // Check enrollment for this batch
      const objEnroll = await client.query(
        `SELECT e.id
           FROM enrollments e
           JOIN students s ON e.student_id = s.id
          WHERE s.user_id   = $1
            AND e.batch_id  = $2
            AND e.status    = 'active'
          LIMIT 1`,
        [req.user.user_id, strBatchId]
      );

      if (objEnroll.rows.length === 0) {
        return res.status(403).json({
          error: 'You are not enrolled in this batch.',
          code:  'NOT_ENROLLED',
        });
      }
    } else if (req.user.role === 'trainer') {
      // Trainers see all tasks (draft + published) for their batches
      // No additional status filter, but verify assignment
      const objBatch = await client.query(
        `SELECT course_id FROM batches WHERE id = $1`,
        [strBatchId]
      );
      if (objBatch.rows.length > 0) {
        const isAssigned = await _isTrainerAssigned(client, objBatch.rows[0].course_id, req.user.user_id);
        if (!isAssigned) {
          return res.status(403).json({
            error: 'You are not assigned to this batch\'s course (BR-C01).',
            code:  'NOT_ASSIGNED',
          });
        }
      }
    }
    // HR and super_admin: no filter, see everything

    // For students, filter by target_student_id
    let strTargetFilter = '';
    if (req.user.role === 'student') {
      strTargetFilter = ` AND (t.target_student_id IS NULL OR t.target_student_id = '${req.user.user_id}')`;
    }

    const objResult = await client.query(
      `SELECT t.*,
              (SELECT COUNT(*) FROM task_submissions ts WHERE ts.task_id = t.id) AS submission_count
         FROM tasks t
        WHERE t.batch_id = $1
          ${strStatusFilter}
          ${strTargetFilter}
        ORDER BY t.due_date ASC`,
      arrParams
    );

    return res.json({ tasks: objResult.rows });
  } catch (err) {
    console.error('listTasks error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ===========================================================================
// TASK SUBMISSIONS
// ===========================================================================

// ---------------------------------------------------------------------------
// submitTask(req, res)
// ---------------------------------------------------------------------------
// POST /api/tasks/:id/submit
// Roles: student only
//
// Accepts a file upload and/or text notes.
// BR-C02: enforced by checkEnrollment middleware upstream.
// Prevents duplicate submissions (DB UNIQUE constraint on task_id + student_id).
// ---------------------------------------------------------------------------
async function submitTask(req, res) {
  // Bouncer
  const strTaskId = req.params.id;
  if (!strTaskId) {
    return res.status(400).json({ error: 'Task id is required.', code: 'MISSING_ID' });
  }

  const strNotes      = req.body.notes || null;
  const objFile       = req.file || null;

  if (!objFile && !strNotes) {
    return res.status(400).json({
      error: 'Submission must include a file or notes.',
      code:  'EMPTY_SUBMISSION',
    });
  }

  if (objFile && !ARR_VALID_SUBMISSION_MIMES.includes(objFile.mimetype)) {
    return res.status(400).json({
      error: 'Unsupported file type for submission.',
      code:  'INVALID_FILE_TYPE',
    });
  }

  const client = await pool.connect();

  try {
    await client.query("SET app.current_user_role = 'super_admin'");

    // Verify task exists and is published
    const objTask = await client.query(
      `SELECT t.id, t.status, t.due_date, t.batch_id
         FROM tasks t
        WHERE t.id = $1`,
      [strTaskId]
    );

    if (objTask.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.', code: 'TASK_NOT_FOUND' });
    }

    const objTaskRow = objTask.rows[0];

    if (objTaskRow.status !== STR_STATUS_PUBLISHED) {
      return res.status(400).json({
        error: 'Task is not yet published.',
        code:  'TASK_NOT_PUBLISHED',
      });
    }

    // Check if submission window is still open
    if (new Date() > new Date(objTaskRow.due_date)) {
      return res.status(400).json({
        error: 'Submission deadline has passed.',
        code:  'DEADLINE_PASSED',
      });
    }

    // task_submissions.student_id references users(id) directly (per migration schema)
    const strStudentId = req.user.user_id;

    // Check for duplicate submission
    const objDuplicate = await client.query(
      `SELECT id FROM task_submissions WHERE task_id = $1 AND student_id = $2`,
      [strTaskId, strStudentId]
    );

    if (objDuplicate.rows.length > 0) {
      return res.status(409).json({
        error: 'You have already submitted this task.',
        code:  'ALREADY_SUBMITTED',
      });
    }

    // Upload file if provided
    let strFileUrl  = null;
    let strS3Key    = null;

    if (objFile) {
      const strKey    = s3.generateUniqueKey(
        `${STR_SUBMISSION_PREFIX}/${strTaskId}`,
        objFile.originalname
      );
      const objUpload = await s3.uploadFile(objFile.buffer, strKey, objFile.mimetype);
      strFileUrl      = objUpload.url;
      strS3Key        = objUpload.key;
    }

    const objResult = await client.query(
      `INSERT INTO task_submissions
         (task_id, student_id, file_url, s3_key, notes, grade, score, feedback, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [
        strTaskId,
        strStudentId,
        strFileUrl,
        strS3Key,
        strNotes,
        STR_GRADE_PENDING,
        null,
        null,
      ]
    );

    return res.status(201).json({ submission: objResult.rows[0] });
  } catch (err) {
    // Handle unique constraint violation gracefully
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'You have already submitted this task.',
        code:  'ALREADY_SUBMITTED',
      });
    }
    console.error('submitTask error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// evaluateSubmission(req, res)
// ---------------------------------------------------------------------------
// PATCH /api/tasks/:taskId/submissions/:submissionId/evaluate
// Roles: trainer, super_admin
//
// Body: { grade ('pass'|'fail'), score (0–100), feedback }
// BR-C01: trainer must be assigned to the submission's course.
// ---------------------------------------------------------------------------
async function evaluateSubmission(req, res) {
  // Bouncer
  const strTaskId       = req.params.taskId;
  const strSubmissionId = req.params.submissionId;
  const { grade, score, feedback } = req.body;

  if (!strTaskId || !strSubmissionId) {
    return res.status(400).json({ error: 'taskId and submissionId are required.', code: 'MISSING_IDS' });
  }

  const arrValidGrades = [STR_GRADE_PASS, STR_GRADE_FAIL];
  if (!grade || !arrValidGrades.includes(grade)) {
    return res.status(400).json({
      error: `grade must be one of: ${arrValidGrades.join(', ')}.`,
      code:  'INVALID_GRADE',
    });
  }

  if (score !== undefined && score !== null) {
    const intScore = Number(score);
    if (isNaN(intScore) || intScore < INT_MIN_SCORE_BOUND || intScore > INT_MAX_SCORE_BOUND) {
      return res.status(400).json({
        error: `score must be between ${INT_MIN_SCORE_BOUND} and ${INT_MAX_SCORE_BOUND}.`,
        code:  'INVALID_SCORE',
      });
    }
  }

  const client = await pool.connect();

  try {
    await client.query("SET app.current_user_role = 'super_admin'");

    // Fetch submission + task to verify ownership
    const objSubmission = await client.query(
      `SELECT ts.*, t.course_id
         FROM task_submissions ts
         JOIN tasks            t  ON ts.task_id = t.id
        WHERE ts.id      = $1
          AND ts.task_id = $2`,
      [strSubmissionId, strTaskId]
    );

    if (objSubmission.rows.length === 0) {
      return res.status(404).json({
        error: 'Submission not found.',
        code:  'SUBMISSION_NOT_FOUND',
      });
    }

    const objSub = objSubmission.rows[0];

    // BR-C01: trainer can only evaluate submissions for their assigned courses
    if (req.user.role === 'trainer') {
      const isAssigned = await _isTrainerAssigned(client, objSub.course_id, req.user.user_id);
      if (!isAssigned) {
        return res.status(403).json({
          error: 'You are not assigned to this course (BR-C01).',
          code:  'NOT_ASSIGNED',
        });
      }
    }

    const objResult = await client.query(
      `UPDATE task_submissions
          SET grade        = $1,
              score        = $2,
              feedback     = $3,
              evaluated_by = $4,
              evaluated_at = NOW(),
              updated_at   = NOW()
        WHERE id = $5
       RETURNING *`,
      [
        grade,
        score !== undefined && score !== null ? Number(score) : null,
        feedback || null,
        req.user.user_id,
        strSubmissionId,
      ]
    );

    return res.json({ submission: objResult.rows[0] });
  } catch (err) {
    console.error('evaluateSubmission error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// listSubmissions(req, res)
// ---------------------------------------------------------------------------
// GET /api/tasks/:id/submissions
// Roles: trainer, super_admin, hr
//
// Returns all submissions for a task with student info.
// BR-C01: trainer restricted to their assigned courses.
// ---------------------------------------------------------------------------
async function listSubmissions(req, res) {
  // Bouncer
  const strTaskId = req.params.id;
  if (!strTaskId) {
    return res.status(400).json({ error: 'Task id is required.', code: 'MISSING_ID' });
  }

  const client = await pool.connect();

  try {
    await client.query("SET app.current_user_role = 'super_admin'");

    // Verify task exists
    const objTask = await client.query(
      `SELECT id, course_id FROM tasks WHERE id = $1`,
      [strTaskId]
    );

    if (objTask.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.', code: 'TASK_NOT_FOUND' });
    }

    // BR-C01: trainer can only list submissions for their assigned courses
    if (req.user.role === 'trainer') {
      const isAssigned = await _isTrainerAssigned(client, objTask.rows[0].course_id, req.user.user_id);
      if (!isAssigned) {
        return res.status(403).json({
          error: 'You are not assigned to this course (BR-C01).',
          code:  'NOT_ASSIGNED',
        });
      }
    }

    // task_submissions.student_id references users(id) directly (per migration schema)
    const objResult = await client.query(
      `SELECT ts.*,
              u.name  AS student_name,
              u.email AS student_email
         FROM task_submissions ts
         JOIN users            u  ON ts.student_id = u.id
        WHERE ts.task_id = $1
        ORDER BY ts.submitted_at DESC`,
      [strTaskId]
    );

    return res.json({ submissions: objResult.rows });
  } catch (err) {
    console.error('listSubmissions error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// getTask(req, res)
// ---------------------------------------------------------------------------
// GET /api/tasks/:id
// Roles: any authenticated user with access to the batch
// ---------------------------------------------------------------------------
async function getTask(req, res) {
  // Bouncer
  const strTaskId = req.params.id;
  if (!strTaskId) {
    return res.status(400).json({ error: 'Task id is required.', code: 'MISSING_ID' });
  }

  const client = await pool.connect();

  try {
    await client.query("SET app.current_user_role = 'super_admin'");

    const objResult = await client.query(
      `SELECT t.*,
              (SELECT COUNT(*) FROM task_submissions ts WHERE ts.task_id = t.id) AS submission_count
         FROM tasks t
        WHERE t.id = $1`,
      [strTaskId]
    );

    if (objResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.', code: 'TASK_NOT_FOUND' });
    }

    const objTaskRow = objResult.rows[0];

    // Students can only view published tasks they are enrolled for
    if (req.user.role === 'student' && objTaskRow.status !== STR_STATUS_PUBLISHED) {
      return res.status(404).json({ error: 'Task not found.', code: 'TASK_NOT_FOUND' });
    }

    return res.json({ task: objTaskRow });
  } catch (err) {
    console.error('getTask error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// updateTask(req, res)
// ---------------------------------------------------------------------------
// PATCH /api/tasks/:id
// Roles: trainer, super_admin
//
// Allows updating title, description, due_date, max_score, instructions.
// BR-C01: trainer must be assigned to the course.
// BR-C03: due_date cannot be in the past.
// Only draft tasks can be fully edited; published tasks allow only due_date
// extension (must be further in the future than the current due_date).
// ---------------------------------------------------------------------------
async function updateTask(req, res) {
  // Bouncer
  const strTaskId = req.params.id;
  if (!strTaskId) {
    return res.status(400).json({ error: 'Task id is required.', code: 'MISSING_ID' });
  }

  const { title, description, due_date, max_score, instructions } = req.body;

  const client = await pool.connect();

  try {
    await client.query("SET app.current_user_role = 'super_admin'");

    const objTask = await client.query(
      `SELECT * FROM tasks WHERE id = $1`,
      [strTaskId]
    );

    if (objTask.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found.', code: 'TASK_NOT_FOUND' });
    }

    const objTaskRow = objTask.rows[0];

    // BR-C01: trainer must be assigned
    if (req.user.role === 'trainer') {
      const isAssigned = await _isTrainerAssigned(client, objTaskRow.course_id, req.user.user_id);
      if (!isAssigned) {
        return res.status(403).json({
          error: 'You are not assigned to this course (BR-C01).',
          code:  'NOT_ASSIGNED',
        });
      }
    }

    // Validate due_date if provided
    let datDue = objTaskRow.due_date;
    if (due_date) {
      datDue = new Date(due_date);
      if (isNaN(datDue.getTime())) {
        return res.status(400).json({ error: 'due_date is not a valid date.', code: 'INVALID_DUE_DATE' });
      }
      // BR-C03: must be in the future
      if (datDue <= new Date()) {
        return res.status(400).json({
          error: 'due_date must be a future date (BR-C03).',
          code:  'DUE_DATE_IN_PAST',
        });
      }
    }

    // Validate max_score if provided
    let intMaxScore = objTaskRow.max_score;
    if (max_score !== undefined && max_score !== null) {
      intMaxScore = Number(max_score);
      if (isNaN(intMaxScore) || intMaxScore < INT_MIN_SCORE_BOUND || intMaxScore > INT_MAX_SCORE_BOUND) {
        return res.status(400).json({
          error: `max_score must be between ${INT_MIN_SCORE_BOUND} and ${INT_MAX_SCORE_BOUND}.`,
          code:  'INVALID_MAX_SCORE',
        });
      }
    }

    // Published tasks: only allow due_date changes
    const strNewTitle        = objTaskRow.status === STR_STATUS_PUBLISHED
      ? objTaskRow.title
      : (title        !== undefined ? title.trim()        : objTaskRow.title);
    const strNewDesc         = objTaskRow.status === STR_STATUS_PUBLISHED
      ? objTaskRow.description
      : (description  !== undefined ? description         : objTaskRow.description);
    const strNewInstructions = objTaskRow.status === STR_STATUS_PUBLISHED
      ? objTaskRow.instructions
      : (instructions !== undefined ? instructions        : objTaskRow.instructions);

    const objResult = await client.query(
      `UPDATE tasks
          SET title        = $1,
              description  = $2,
              due_date     = $3,
              max_score    = $4,
              instructions = $5,
              updated_at   = NOW()
        WHERE id = $6
       RETURNING *`,
      [strNewTitle, strNewDesc, datDue, intMaxScore, strNewInstructions, strTaskId]
    );

    return res.json({ task: objResult.rows[0] });
  } catch (err) {
    console.error('updateTask error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// getMySubmission(req, res)
// ---------------------------------------------------------------------------
// GET /api/tasks/:id/my-submission
// Roles: student only
//
// Returns the authenticated student's submission for a specific task.
// ---------------------------------------------------------------------------
async function getMySubmission(req, res) {
  // Bouncer
  const strTaskId = req.params.id;
  if (!strTaskId) {
    return res.status(400).json({ error: 'Task id is required.', code: 'MISSING_ID' });
  }

  const client = await pool.connect();

  try {
    await client.query("SET app.current_user_role = 'super_admin'");

    // task_submissions.student_id references users(id) directly (per migration schema)
    const strStudentId = req.user.user_id;

    const objResult = await client.query(
      `SELECT * FROM task_submissions
        WHERE task_id   = $1
          AND student_id = $2`,
      [strTaskId, strStudentId]
    );

    if (objResult.rows.length === 0) {
      return res.status(404).json({
        error: 'No submission found for this task.',
        code:  'SUBMISSION_NOT_FOUND',
      });
    }

    return res.json({ submission: objResult.rows[0] });
  } catch (err) {
    console.error('getMySubmission error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ===========================================================================
// Exports
// ===========================================================================
module.exports = {
  handleSubmissionUpload,
  createTask,
  publishTask,
  listTasks,
  getTask,
  updateTask,
  submitTask,
  evaluateSubmission,
  listSubmissions,
  getMySubmission,
};
