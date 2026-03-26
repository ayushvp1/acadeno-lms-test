const { pool } = require('../db/index');
const redis = require('../utils/redis');

async function getStudentDashboard(req, res) {
  const client = await pool.connect();
  // Elevate for internal queries
  await client.query("SET app.current_user_role = 'super_admin'");

  try {
    const userId = req.user.user_id;

    // Fetch student and enrollment data
    const result = await client.query(`
      SELECT 
        s.id as student_id,
        s.first_name,
        s.last_name,
        s.email,
        s.registration_number,
        e.id as enrollment_id,
        e.status as enrollment_status,
        e.batch_id,
        e.total_fee,
        c.name as course_name,
        b.name as batch_name
      FROM students s
      JOIN enrollments e ON s.id = e.student_id
      JOIN courses c ON e.course_id = c.id
      JOIN batches b ON e.batch_id = b.id
      WHERE s.user_id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Student record not found' });
    }

    const dashboardData = result.rows[0];

    // Sync with Redis (Requirement 7)
    try {
      await redis.set(`student_profile:${dashboardData.student_id}`, JSON.stringify({
        first_name: dashboardData.first_name,
        last_name: dashboardData.last_name,
        email: dashboardData.email
      }), 'EX', 86400);
      
      await redis.set(`payment_status:${dashboardData.enrollment_id}`, dashboardData.enrollment_status === 'active' ? 'paid' : 'pending_payment', 'EX', 86400);
      
      // Track dashboard access in Redis
      await redis.set(`dashboard_access:${dashboardData.student_id}`, new Date().toISOString(), 'EX', 86400);
    } catch (redisErr) {
      console.error('Redis sync error in dashboard:', redisErr.message);
    }

    return res.status(200).json(dashboardData);
  } catch (err) {
    console.error('getStudentDashboard error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ==========================================================================
// EPIC-06: Student Portal — Content Access (US-STU-01, US-STU-02, BR-C02)
// ==========================================================================

// Module-level constants (Zero Magic Values Rule)
const STR_ROLE_SUPER_ADMIN              = 'super_admin';
const STR_ROLE_STUDENT                  = 'student';
const STR_CONTENT_STATUS_PUBLISHED      = 'published';
const STR_ENROLLMENT_STATUS_ACTIVE      = 'active';
const INT_COMPLETION_PCT_SCALE          = 100;
const ARR_AUTO_COMPLETE_TYPES           = ['pdf', 'document'];
const NUM_VIDEO_COMPLETION_THRESHOLD    = 0.90;   // 90% watched → mark complete (FR-STU-04)
const INT_CERTIFICATE_THRESHOLD_PCT     = 100;    // 100% course done → generate certificate

// Lazy-loaded to avoid circular-dependency risk; only used in saveVideoProgress.
const certificateJob = require('../jobs/certificateJob');

// ---------------------------------------------------------------------------
// getCourseContent(req, res)
// ---------------------------------------------------------------------------
// Returns the full module tree for a course with per-item completion state.
// Enforces active enrollment for students (BR-C02).
// ---------------------------------------------------------------------------
async function getCourseContent(req, res) {
  const strCourseId = req.params.courseId;
  const strUserId   = req.user.user_id;
  const strRole     = req.user.role;

  // Bouncer: courseId required
  if (!strCourseId) {
    return res.status(400).json({ error: 'courseId is required', code: 'MISSING_PARAM' });
  }

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    // ---- 1. Enrollment gate for students (BR-C02) ----
    if (strRole === STR_ROLE_STUDENT) {
      const objEnrollCheck = await client.query(
        `SELECT e.id, e.batch_id
           FROM enrollments e
           JOIN students    s ON e.student_id = s.id
          WHERE s.user_id   = $1
            AND e.course_id = $2
            AND e.status    = $3`,
        [strUserId, strCourseId, STR_ENROLLMENT_STATUS_ACTIVE]
      );

      if (objEnrollCheck.rows.length === 0) {
        return res.status(403).json({
          error: 'Enroll to access this course',
          code:  'NOT_ENROLLED',
        });
      }
    }

    // ---- 2. Fetch course details ----
    const objCourseResult = await client.query(
      `SELECT id, name, description, duration_weeks
         FROM courses
        WHERE id        = $1
          AND is_active = TRUE`,
      [strCourseId]
    );

    if (objCourseResult.rows.length === 0) {
      return res.status(404).json({ error: 'Course not found', code: 'NOT_FOUND' });
    }

    const objCourse = objCourseResult.rows[0];

    // ---- 3. Fetch full module tree (published items only) with progress ----
    const objTreeResult = await client.query(
      `SELECT
           m.id            AS module_id,
           m.title         AS module_title,
           m.position      AS module_position,
           sm.id           AS sub_module_id,
           sm.title        AS sub_module_title,
           sm.position     AS sm_position,
           ci.id           AS content_item_id,
           ci.title        AS ci_title,
           ci.content_type,
           ci.external_url,
           ci.hls_url,
           ci.duration_seconds,
           ci.is_downloadable,
           ci.position     AS ci_position,
           COALESCE(cp.is_completed, FALSE) AS is_completed,
           COALESCE(cp.watch_position_seconds, 0) AS watch_position_seconds,
           cp.last_accessed_at
         FROM modules m
         JOIN sub_modules    sm ON sm.module_id      = m.id
         JOIN content_items  ci ON ci.sub_module_id  = sm.id
         LEFT JOIN content_progress cp
               ON  cp.content_item_id = ci.id
               AND cp.student_id      = $2
        WHERE m.course_id  = $1
          AND ci.status    = $3
        ORDER BY m.position, sm.position, ci.position`,
      [strCourseId, strUserId, STR_CONTENT_STATUS_PUBLISHED]
    );

    // ---- 4. Calculate overall completion_pct ----
    const intTotalItems     = objTreeResult.rows.length;
    const intCompletedItems = objTreeResult.rows.filter(r => r.is_completed).length;
    const numCompletionPct  = intTotalItems > 0
      ? Math.round((intCompletedItems / intTotalItems) * INT_COMPLETION_PCT_SCALE)
      : 0;

    // ---- 5. Build nested module → sub_module → content_items tree ----
    const objModuleMap = {};

    for (const row of objTreeResult.rows) {
      if (!objModuleMap[row.module_id]) {
        objModuleMap[row.module_id] = {
          id:          row.module_id,
          title:       row.module_title,
          position:    row.module_position,
          sub_modules: {},
        };
      }

      const objMod = objModuleMap[row.module_id];

      if (!objMod.sub_modules[row.sub_module_id]) {
        objMod.sub_modules[row.sub_module_id] = {
          id:            row.sub_module_id,
          title:         row.sub_module_title,
          position:      row.sm_position,
          content_items: [],
        };
      }

      objMod.sub_modules[row.sub_module_id].content_items.push({
        id:                    row.content_item_id,
        title:                 row.ci_title,
        content_type:          row.content_type,
        external_url:          row.external_url,
        hls_url:               row.hls_url,
        duration_seconds:      row.duration_seconds,
        is_downloadable:       row.is_downloadable,
        position:              row.ci_position,
        is_completed:          row.is_completed,
        watch_position_seconds: row.watch_position_seconds,
        last_accessed_at:      row.last_accessed_at || null,
      });
    }

    // Convert maps to position-sorted arrays
    const arrModules = Object.values(objModuleMap).map(m => ({
      ...m,
      sub_modules: Object.values(m.sub_modules),
    }));

    return res.status(200).json({
      course:         objCourse,
      modules:        arrModules,
      completion_pct: numCompletionPct,
    });

  } catch (err) {
    console.error('getCourseContent error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// getContentItem(req, res)
// ---------------------------------------------------------------------------
// Returns a single published content item.
// For students:
//   - Enforces active enrollment (BR-C02).
//   - Auto-marks PDF/document items as completed in content_progress.
//   - Records daily access in student_activity (streak tracking).
// ---------------------------------------------------------------------------
async function getContentItem(req, res) {
  const strContentId = req.params.contentId;
  const strUserId    = req.user.user_id;
  const strRole      = req.user.role;

  // Bouncer: contentId required
  if (!strContentId) {
    return res.status(400).json({ error: 'contentId is required', code: 'MISSING_PARAM' });
  }

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    // ---- 1. Fetch content item (published only) ----
    const objContentResult = await client.query(
      `SELECT ci.*,
              m.course_id
         FROM content_items ci
         JOIN sub_modules   sm ON ci.sub_module_id = sm.id
         JOIN modules        m ON sm.module_id     = m.id
        WHERE ci.id     = $1
          AND ci.status = $2`,
      [strContentId, STR_CONTENT_STATUS_PUBLISHED]
    );

    if (objContentResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Content item not found or not published',
        code:  'NOT_FOUND',
      });
    }

    const objContentItem = objContentResult.rows[0];

    // ---- 2. Enrollment gate for students (BR-C02) ----
    if (strRole === STR_ROLE_STUDENT) {
      const objEnrollCheck = await client.query(
        `SELECT e.id
           FROM enrollments e
           JOIN students    s ON e.student_id = s.id
          WHERE s.user_id   = $1
            AND e.course_id = $2
            AND e.status    = $3`,
        [strUserId, objContentItem.course_id, STR_ENROLLMENT_STATUS_ACTIVE]
      );

      if (objEnrollCheck.rows.length === 0) {
        return res.status(403).json({
          error: 'Enroll to access this course',
          code:  'NOT_ENROLLED',
        });
      }

      // ---- 3. Auto-complete PDF / document items ----
      if (ARR_AUTO_COMPLETE_TYPES.includes(objContentItem.content_type)) {
        await client.query(
          `INSERT INTO content_progress
               (student_id, content_item_id, is_completed, completed_at, last_accessed_at)
             VALUES ($1, $2, TRUE, NOW(), NOW())
             ON CONFLICT (student_id, content_item_id)
             DO UPDATE SET
               is_completed     = TRUE,
               completed_at     = COALESCE(content_progress.completed_at, NOW()),
               last_accessed_at = NOW()`,
          [strUserId, strContentId]
        );
      } else {
        // Non-auto-complete: update last_accessed_at only
        await client.query(
          `INSERT INTO content_progress
               (student_id, content_item_id, is_completed, last_accessed_at)
             VALUES ($1, $2, FALSE, NOW())
             ON CONFLICT (student_id, content_item_id)
             DO UPDATE SET last_accessed_at = NOW()`,
          [strUserId, strContentId]
        );
      }

      // ---- 4. Record daily activity for streak tracking ----
      await client.query(
        `INSERT INTO student_activity
             (student_id, activity_date, content_items_accessed)
           VALUES ($1, CURRENT_DATE, 1)
           ON CONFLICT (student_id, activity_date)
           DO UPDATE SET
             content_items_accessed = student_activity.content_items_accessed + 1`,
        [strUserId]
      );
    }

    // ---- 5. Return content item ----
    return res.status(200).json({ content_item: objContentItem });

  } catch (err) {
    console.error('getContentItem error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// saveVideoProgress(req, res)
// ---------------------------------------------------------------------------
// POST /api/student/content/:contentId/progress
// Body: { watch_position_seconds, total_duration_seconds }
//
// 1. UPSERTs content_progress with the new watch position.
// 2. Auto-marks content as completed when >= 90% watched (FR-STU-04).
// 3. Records daily activity for streak tracking.
// 4. Recalculates enrollment completion_pct.
// 5. Triggers certificate generation when completion_pct == 100%.
//
// Returns: { is_completed, completion_pct, watch_position_seconds }
// ---------------------------------------------------------------------------
async function saveVideoProgress(req, res) {
  const strContentId = req.params.contentId;
  const strUserId    = req.user.user_id;

  const { watch_position_seconds, total_duration_seconds } = req.body;

  // ---- Bouncer: validate required body fields ----
  if (strContentId === undefined || strContentId === null) {
    return res.status(400).json({ error: 'contentId is required', code: 'MISSING_PARAM' });
  }
  if (watch_position_seconds === undefined || watch_position_seconds === null) {
    return res.status(400).json({
      error: 'watch_position_seconds is required',
      code:  'MISSING_PARAM',
    });
  }
  if (!total_duration_seconds || total_duration_seconds <= 0) {
    return res.status(400).json({
      error: 'total_duration_seconds must be a positive number',
      code:  'INVALID_PARAM',
    });
  }

  // ---- Compute completion flag (SRD FR-STU-04) ----
  const numRatio         = watch_position_seconds / total_duration_seconds;
  const boolIsCompleted  = numRatio >= NUM_VIDEO_COMPLETION_THRESHOLD;

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    // ---- 1. UPSERT content_progress ----
    if (boolIsCompleted) {
      await client.query(
        `INSERT INTO content_progress
             (student_id, content_item_id, is_completed,
              watch_position_seconds, last_accessed_at, completed_at)
           VALUES ($1, $2, TRUE, $3, NOW(), NOW())
           ON CONFLICT (student_id, content_item_id)
           DO UPDATE SET
             watch_position_seconds = $3,
             last_accessed_at       = NOW(),
             is_completed           = TRUE,
             completed_at           = COALESCE(content_progress.completed_at, NOW())`,
        [strUserId, strContentId, watch_position_seconds]
      );
    } else {
      // Preserve any existing is_completed = TRUE — do NOT downgrade it
      await client.query(
        `INSERT INTO content_progress
             (student_id, content_item_id, is_completed,
              watch_position_seconds, last_accessed_at)
           VALUES ($1, $2, FALSE, $3, NOW())
           ON CONFLICT (student_id, content_item_id)
           DO UPDATE SET
             watch_position_seconds = $3,
             last_accessed_at       = NOW()`,
        [strUserId, strContentId, watch_position_seconds]
      );
    }

    // ---- 2. Record daily activity (streak tracking) ----
    await client.query(
      `INSERT INTO student_activity
           (student_id, activity_date, content_items_accessed)
         VALUES ($1, CURRENT_DATE, 1)
         ON CONFLICT (student_id, activity_date)
         DO UPDATE SET
           content_items_accessed = student_activity.content_items_accessed + 1`,
      [strUserId]
    );

    // ---- 3. Resolve enrollment (needed for completion_pct & certificate) ----
    const objEnrollResult = await client.query(
      `SELECT e.id AS enrollment_id, m.course_id
         FROM content_items ci
         JOIN sub_modules   sm ON ci.sub_module_id = sm.id
         JOIN modules        m ON sm.module_id     = m.id
         JOIN enrollments    e ON e.course_id      = m.course_id
         JOIN students       s ON e.student_id     = s.id
        WHERE ci.id    = $1
          AND s.user_id = $2
          AND e.status  = $3
        LIMIT 1`,
      [strContentId, strUserId, STR_ENROLLMENT_STATUS_ACTIVE]
    );

    // No active enrollment found — return basic progress without pct
    if (objEnrollResult.rows.length === 0) {
      return res.status(200).json({
        is_completed:          boolIsCompleted,
        completion_pct:        0,
        watch_position_seconds,
      });
    }

    const strEnrollmentId = objEnrollResult.rows[0].enrollment_id;
    const strCourseId     = objEnrollResult.rows[0].course_id;

    // ---- 4. Recalculate completion_pct for the whole course ----
    const objCountResult = await client.query(
      `SELECT
           COUNT(ci.id)                                                AS total_items,
           COUNT(cp.content_item_id) FILTER (WHERE cp.is_completed = TRUE) AS completed_items
         FROM content_items ci
         JOIN sub_modules   sm ON ci.sub_module_id = sm.id
         JOIN modules        m ON sm.module_id     = m.id
         LEFT JOIN content_progress cp
               ON  cp.content_item_id = ci.id
               AND cp.student_id      = $2
        WHERE m.course_id = $1
          AND ci.status   = $3`,
      [strCourseId, strUserId, STR_CONTENT_STATUS_PUBLISHED]
    );

    const intTotalItems     = parseInt(objCountResult.rows[0].total_items,     10) || 0;
    const intCompletedItems = parseInt(objCountResult.rows[0].completed_items, 10) || 0;

    const intCompletionPct = intTotalItems > 0
      ? Math.round((intCompletedItems / intTotalItems) * INT_COMPLETION_PCT_SCALE)
      : 0;

    // ---- 5. Trigger certificate generation when threshold is reached ----
    if (intCompletionPct >= INT_CERTIFICATE_THRESHOLD_PCT) {
      try {
        await certificateJob.generateCertificate({
          studentId:    strUserId,
          enrollmentId: strEnrollmentId,
          courseId:     strCourseId,
        });
      } catch (certErr) {
        // Certificate failure must never fail the progress save response
        console.error('saveVideoProgress: certificate generation failed:', certErr.message);
      }
    }

    return res.status(200).json({
      is_completed:          boolIsCompleted,
      completion_pct:        intCompletionPct,
      watch_position_seconds,
    });

  } catch (err) {
    console.error('saveVideoProgress error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// getVideoProgress(req, res)
// ---------------------------------------------------------------------------
// GET /api/student/content/:contentId/progress
//
// Returns the student's current watch position and completion state for a
// single content item so the video player can resume at the correct offset.
//
// Returns:
//   { watch_position_seconds, is_completed, last_accessed_at }
//   If no record exists: { watch_position_seconds: 0, is_completed: false, last_accessed_at: null }
// ---------------------------------------------------------------------------
async function getVideoProgress(req, res) {
  const strContentId = req.params.contentId;
  const strUserId    = req.user.user_id;

  if (!strContentId) {
    return res.status(400).json({ error: 'contentId is required', code: 'MISSING_PARAM' });
  }

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    const objProgressResult = await client.query(
      `SELECT watch_position_seconds, is_completed, last_accessed_at
         FROM content_progress
        WHERE student_id      = $1
          AND content_item_id = $2`,
      [strUserId, strContentId]
    );

    if (objProgressResult.rows.length === 0) {
      // No progress record yet — return safe defaults
      return res.status(200).json({
        watch_position_seconds: 0,
        is_completed:           false,
        last_accessed_at:       null,
      });
    }

    return res.status(200).json(objProgressResult.rows[0]);

  } catch (err) {
    console.error('getVideoProgress error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ==========================================================================
// EPIC-06: Student Portal Dashboard (US-STU-04, SRD FR-STU-01)
// ==========================================================================

// ---- Additional constants (Zero Magic Values Rule) ----
const INT_DASHBOARD_CACHE_TTL_SECONDS = 180;             // Redis TTL in seconds
const STR_DASHBOARD_CACHE_KEY_PREFIX  = 'student_dashboard:'; // Redis key prefix
const INT_UPCOMING_TASKS_DAYS         = 7;               // lookahead window for tasks
const INT_SECONDS_PER_DAY            = 86400;            // seconds in one day

// ---------------------------------------------------------------------------
// _calculateStreaks(arrActivityRows) → { current_streak_days, longest_streak_days }
// ---------------------------------------------------------------------------
// Pure helper. Receives an array of { activity_date } rows from student_activity.
//
// current_streak: consecutive days ending today (grace: if today is absent,
//   start from yesterday instead — covers the case where today's session
//   hasn't been recorded yet).
// longest_streak: greatest consecutive-day run in the entire history.
// ---------------------------------------------------------------------------
function _calculateStreaks(arrActivityRows) {
  if (!arrActivityRows || arrActivityRows.length === 0) {
    return { current_streak_days: 0, longest_streak_days: 0 };
  }

  // Normalise all rows to UTC 'YYYY-MM-DD' strings
  const setDates = new Set(
    arrActivityRows.map(r => {
      const d = r.activity_date instanceof Date
        ? r.activity_date
        : new Date(r.activity_date);
      return d.toISOString().slice(0, 10);
    })
  );

  // Returns the UTC date string for N days ago
  function strDateOffset(intDaysAgo) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - intDaysAgo);
    return d.toISOString().slice(0, 10);
  }

  // ---- Current streak ----
  // Start from today; fall back to yesterday if today has no entry (grace period)
  let intStartOffset = 0;
  if (!setDates.has(strDateOffset(0))) {
    intStartOffset = setDates.has(strDateOffset(1)) ? 1 : null;
  }

  let intCurrentStreak = 0;
  if (intStartOffset !== null) {
    let intOffset = intStartOffset;
    while (setDates.has(strDateOffset(intOffset))) {
      intCurrentStreak++;
      intOffset++;
    }
  }

  // ---- Longest streak (scan sorted dates for consecutive runs) ----
  const arrSorted  = [...setDates].sort(); // ISO strings sort lexicographically = chronologically
  let intLongest   = 0;
  let intRunLength = 0;
  let strPrevDate  = null;

  for (const strDate of arrSorted) {
    if (strPrevDate === null) {
      intRunLength = 1;
    } else {
      const intDiffMs   = new Date(strDate) - new Date(strPrevDate);
      const intDiffDays = Math.round(intDiffMs / (1000 * 60 * 60 * 24));
      intRunLength      = (intDiffDays === 1) ? intRunLength + 1 : 1;
    }
    if (intRunLength > intLongest) intLongest = intRunLength;
    strPrevDate = strDate;
  }

  return {
    current_streak_days: intCurrentStreak,
    longest_streak_days: intLongest,
  };
}

// ---------------------------------------------------------------------------
// getStudentPortalDashboard(req, res)
// ---------------------------------------------------------------------------
// GET /api/student/dashboard (US-STU-04, SRD FR-STU-01)
//
// Single-payload response with five sections:
//   1. enrolled_course  — active course with progress stats
//   2. upcoming_tasks   — tasks due within the next 7 days (not yet submitted)
//   3. streak           — current and longest study-day streaks
//   4. last_accessed_content — most recently accessed content item
//   5. certificate_available — true only when course is 100% complete AND
//                              a certificate record has been issued
//
// Redis cache: key = 'student_dashboard:{user_id}', TTL = 180 seconds.
// Cache is bypassed on miss and populated after assembly.
// ---------------------------------------------------------------------------
async function getStudentPortalDashboard(req, res) {
  const strUserId   = req.user.user_id;
  const strCacheKey = `${STR_DASHBOARD_CACHE_KEY_PREFIX}${strUserId}`;

  // ---- 1. Redis cache check ----
  try {
    const strCached = await redis.get(strCacheKey);
    if (strCached) {
      return res.status(200).json(JSON.parse(strCached));
    }
  } catch (redisGetErr) {
    console.error('getStudentPortalDashboard: Redis GET error:', redisGetErr.message);
  }

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    // ---- Query 1: enrolled_course ----
    // JOINs students → enrollments → courses → batches → users (trainer)
    //      → modules → sub_modules → content_items → content_progress
    const objCourseResult = await client.query(
      `SELECT
           c.id             AS course_id,
           c.name           AS title,
           b.name           AS batch_name,
           u.email          AS trainer_name,
           s.first_name     AS first_name,
           e.id             AS enrollment_id,
           COUNT(ci.id)     AS total_content_items,
           COUNT(cp.content_item_id) FILTER (WHERE cp.is_completed = TRUE)
                            AS completed_items
         FROM students        s
         JOIN enrollments     e  ON e.student_id     = s.id
         JOIN courses         c  ON e.course_id      = c.id
         JOIN batches         b  ON e.batch_id       = b.id
         JOIN users           u  ON b.trainer_id     = u.id
         JOIN modules         m  ON m.course_id      = c.id
         JOIN sub_modules     sm ON sm.module_id     = m.id
         JOIN content_items   ci ON ci.sub_module_id = sm.id
                                 AND ci.status       = $2
         LEFT JOIN content_progress cp
               ON  cp.content_item_id = ci.id
               AND cp.student_id      = $1
        WHERE s.user_id  = $1
          AND e.status   = $3
        GROUP BY c.id, c.name, b.name, u.email, s.first_name, e.id
        LIMIT 1`,
      [strUserId, STR_CONTENT_STATUS_PUBLISHED, STR_ENROLLMENT_STATUS_ACTIVE]
    );

    let objEnrolledCourse = null;
    if (objCourseResult.rows.length > 0) {
      const rowCourse = objCourseResult.rows[0];
      const intTotal  = parseInt(rowCourse.total_content_items, 10) || 0;
      const intDone   = parseInt(rowCourse.completed_items,     10) || 0;
      const intPct    = intTotal > 0
        ? Math.round((intDone / intTotal) * INT_COMPLETION_PCT_SCALE)
        : 0;

      objEnrolledCourse = {
        course_id:           rowCourse.course_id,
        title:               rowCourse.title,
        batch_name:          rowCourse.batch_name,
        trainer_name:        rowCourse.trainer_name,
        first_name:          rowCourse.first_name,
        enrollment_id:       rowCourse.enrollment_id,
        completion_pct:      intPct,
        total_content_items: intTotal,
        completed_items:     intDone,
      };
    }

    // ---- Query 2: upcoming_tasks ----
    // Tasks due within INT_UPCOMING_TASKS_DAYS days that the student has not submitted.
    const objTasksResult = await client.query(
      `SELECT
           t.id,
           t.title,
           t.due_date,
           GREATEST(0, CEIL(
             EXTRACT(EPOCH FROM (t.due_date - NOW())) / $3
           ))::int AS days_remaining
         FROM tasks           t
         JOIN enrollments     e  ON e.batch_id   = t.batch_id
         JOIN students        s  ON e.student_id  = s.id
        WHERE s.user_id   = $1
          AND e.status    = $2
          AND t.due_date  > NOW()
          AND t.due_date <= NOW() + ($4 * INTERVAL '1 day')
          AND NOT EXISTS (
            SELECT 1
              FROM task_submissions ts
             WHERE ts.task_id    = t.id
               AND ts.student_id = s.id
          )
        ORDER BY t.due_date ASC`,
      [strUserId, STR_ENROLLMENT_STATUS_ACTIVE, INT_SECONDS_PER_DAY, INT_UPCOMING_TASKS_DAYS]
    );


    const arrUpcomingTasks = objTasksResult.rows;

    // ---- Query 3: activity dates for streak calculation ----
    const objActivityResult = await client.query(
      `SELECT activity_date
         FROM student_activity
        WHERE student_id = $1
        ORDER BY activity_date DESC`,
      [strUserId]
    );

    const objStreak = _calculateStreaks(objActivityResult.rows);

    // ---- Query 4: last_accessed_content ----
    const objLastResult = await client.query(
      `SELECT
           ci.id,
           ci.title,
           ci.content_type,
           cp.last_accessed_at
         FROM content_progress cp
         JOIN content_items    ci ON cp.content_item_id = ci.id
        WHERE cp.student_id       = $1
          AND cp.last_accessed_at IS NOT NULL
        ORDER BY cp.last_accessed_at DESC
        LIMIT 1`,
      [strUserId]
    );

    const objLastContent = objLastResult.rows.length > 0
      ? objLastResult.rows[0]
      : null;

    // ---- Query 5: certificate_available ----
    // True only when pct == 100 AND the certificates table has a record
    const objCertResult = await client.query(
      `SELECT EXISTS (
         SELECT 1
           FROM certificates cert
           JOIN enrollments  e ON cert.enrollment_id = e.id
           JOIN students     s ON e.student_id       = s.id
          WHERE s.user_id = $1
       ) AS cert_exists`,
      [strUserId]
    );

    const boolCertExists    = objCertResult.rows[0].cert_exists === true;
    const intPctForCert     = objEnrolledCourse ? objEnrolledCourse.completion_pct : 0;
    const boolCertAvailable = intPctForCert >= INT_CERTIFICATE_THRESHOLD_PCT && boolCertExists;

    // ---- Assemble response ----
    // Flat fields (frontend compatibility) + nested enrolled_course (test compat)
    const objResponse = {
      // Flat aliases — used directly by StudentDashboard.jsx
      first_name:            objEnrolledCourse ? objEnrolledCourse.first_name     : null,
      enrollment_id:         objEnrolledCourse ? objEnrolledCourse.enrollment_id  : null,
      enrollment_status:     objEnrolledCourse ? STR_ENROLLMENT_STATUS_ACTIVE     : 'not_enrolled',
      completion_pct:        objEnrolledCourse ? objEnrolledCourse.completion_pct : 0,
      course_id:             objEnrolledCourse ? objEnrolledCourse.course_id      : null,
      course_name:           objEnrolledCourse ? objEnrolledCourse.title          : null,
      // Nested object — used by EPIC-06 tests
      enrolled_course:       objEnrolledCourse,
      upcoming_tasks:        arrUpcomingTasks,
      streak:                objStreak,
      last_accessed_content: objLastContent,
      certificate_available: boolCertAvailable,
    };

    // ---- Cache in Redis ----
    try {
      await redis.set(
        strCacheKey,
        JSON.stringify(objResponse),
        'EX',
        INT_DASHBOARD_CACHE_TTL_SECONDS
      );
    } catch (redisSetErr) {
      console.error('getStudentPortalDashboard: Redis SET error:', redisSetErr.message);
    }

    return res.status(200).json(objResponse);

  } catch (err) {
    console.error('getStudentPortalDashboard error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ==========================================================================
// EPIC-06: Student Task View + Submission (US-STU-05)
// ==========================================================================

// ---- US-STU-05 Constants (Zero Magic Values Rule) ----
const STR_TASK_STATUS_PUBLISHED       = 'published';   // tasks.status — visible to students
const STR_SUBMISSION_STATUS_SUBMITTED = 'submitted';   // task_submissions.status on new submit
const STR_SUBMISSION_STATUS_REOPENED  = 'reopened';    // trainer unlocks resubmission
const INT_HTTP_LOCKED                 = 423;           // HTTP 423 Locked
const STR_UPLOADS_DIR                 = 'uploads';     // local disk stub for file saves  // eslint-disable-line no-unused-vars

// ---------------------------------------------------------------------------
// getTasks(req, res)
// ---------------------------------------------------------------------------
// GET /api/student/tasks (US-STU-05)
//
// Returns all published tasks for the student's active-enrollment batch(es).
// For each task includes the student's existing submission (or null) and an
// is_overdue flag: true when due_date has passed and no submission exists.
//
// Response: { tasks: [{ task, submission }] }
// ---------------------------------------------------------------------------
async function getTasks(req, res) {
  const strUserId = req.user.user_id;
  const client    = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    const objResult = await client.query(
      `SELECT
           t.id,
           t.title,
           t.description,
           t.due_date,
           t.max_score,
           t.task_type,
           ts.id           AS submission_id,
           ts.status       AS submission_status,
           ts.score,
           ts.feedback,
           ts.submitted_at,
           (t.due_date < NOW() AND ts.id IS NULL)::boolean AS is_overdue
         FROM tasks             t
         JOIN enrollments       e  ON e.batch_id    = t.batch_id
         JOIN students          s  ON e.student_id  = s.id
         LEFT JOIN task_submissions ts
               ON  ts.task_id    = t.id
               AND ts.student_id = s.user_id
        WHERE s.user_id  = $1
          AND e.status   = $2
          AND t.status   = $3
        ORDER BY t.due_date ASC`,
      [strUserId, STR_ENROLLMENT_STATUS_ACTIVE, STR_TASK_STATUS_PUBLISHED]
    );

    const arrTasks = objResult.rows.map(row => ({
      task: {
        id:         row.id,
        title:      row.title,
        description: row.description,
        due_date:   row.due_date,
        max_score:  row.max_score,
        task_type:  row.task_type,
        is_overdue: row.is_overdue,
      },
      submission: row.submission_id ? {
        status:       row.submission_status,
        score:        row.score,
        feedback:     row.feedback,
        submitted_at: row.submitted_at,
      } : null,
    }));

    return res.status(200).json({ tasks: arrTasks });

  } catch (err) {
    console.error('getTasks error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// getTaskDetail(req, res)
// ---------------------------------------------------------------------------
// GET /api/student/tasks/:taskId (US-STU-05)
//
// Returns full task detail for a single published task the student can access.
// Includes time_remaining_seconds (negative when overdue) and the student's
// own submission record (or null if not yet submitted).
//
// Response: { id, title, description, rubric, due_date, max_score,
//             task_type, time_remaining_seconds, student_submission | null }
// ---------------------------------------------------------------------------
async function getTaskDetail(req, res) {
  const strTaskId = req.params.taskId;
  const strUserId = req.user.user_id;

  // Bouncer
  if (!strTaskId) {
    return res.status(400).json({ error: 'taskId is required', code: 'MISSING_PARAM' });
  }

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    const objResult = await client.query(
      `SELECT
           t.id,
           t.title,
           t.description,
           t.rubric,
           t.due_date,
           t.max_score,
           t.task_type,
           EXTRACT(EPOCH FROM (t.due_date - NOW()))::bigint AS time_remaining_seconds,
           ts.id           AS submission_id,
           ts.status       AS submission_status,
           ts.score,
           ts.feedback,
           ts.response_text AS submission_response_text,
           ts.s3_key       AS submission_s3_key,
           ts.submitted_at
         FROM tasks             t
         JOIN enrollments       e  ON e.batch_id   = t.batch_id
         JOIN students          s  ON e.student_id = s.id
         LEFT JOIN task_submissions ts
               ON  ts.task_id    = t.id
               AND ts.student_id = s.user_id
        WHERE t.id       = $1
          AND s.user_id  = $2
          AND e.status   = $3
          AND t.status   = $4
        LIMIT 1`,
      [strTaskId, strUserId, STR_ENROLLMENT_STATUS_ACTIVE, STR_TASK_STATUS_PUBLISHED]
    );

    if (objResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Task not found or you are not enrolled in this batch',
        code:  'NOT_FOUND',
      });
    }

    const row = objResult.rows[0];

    const objStudentSubmission = row.submission_id ? {
      status:        row.submission_status,
      score:         row.score,
      feedback:      row.feedback,
      response_text: row.submission_response_text,
      s3_key:        row.submission_s3_key,
      submitted_at:  row.submitted_at,
    } : null;

    return res.status(200).json({
      id:                     row.id,
      title:                  row.title,
      description:            row.description,
      rubric:                 row.rubric,
      due_date:               row.due_date,
      max_score:              row.max_score,
      task_type:              row.task_type,
      time_remaining_seconds: Number(row.time_remaining_seconds),
      student_submission:     objStudentSubmission,
    });

  } catch (err) {
    console.error('getTaskDetail error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// submitTask(req, res)
// ---------------------------------------------------------------------------
// POST /api/student/tasks/:taskId/submit (US-STU-05)
// Body: { response_text } + optional file (multipart/form-data)
//
// Business rules enforced:
//   BR-C02: student must have an active enrollment in the task's batch.
//   US-STU-05: flags submission as late when NOW() > task.due_date.
//
// Submission gate:
//   - No prior submission → INSERT (status='submitted').
//   - Prior submission with status='reopened' → UPDATE (allow resubmit).
//   - Prior submission with any other status → 423 SUBMISSION_LOCKED.
//
// File stub: if req.file is present (multer disk storage), its filename is
//   stored as s3_key in task_submissions.
//
// Post-submit:
//   - Records today's activity in student_activity for streak tracking.
//   - Invalidates the student dashboard Redis cache.
//
// Returns 201 + { submission }
// ---------------------------------------------------------------------------
async function submitTask(req, res) {
  const strTaskId          = req.params.taskId;
  const strUserId          = req.user.user_id;
  const { response_text }  = req.body;

  // ---- Bouncer ----
  if (!strTaskId) {
    return res.status(400).json({ error: 'taskId is required', code: 'MISSING_PARAM' });
  }
  if (!response_text || String(response_text).trim() === '') {
    return res.status(400).json({
      error: 'response_text is required',
      code:  'MISSING_PARAM',
    });
  }

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    // ---- 1. Fetch task + verify published + verify enrollment (BR-C02) ----
    // Single JOIN ensures: task exists, is published, and student is actively enrolled
    // in the batch the task belongs to.
    const objTaskResult = await client.query(
      `SELECT t.id, t.status, t.due_date, t.batch_id
         FROM tasks        t
         JOIN enrollments  e ON e.batch_id   = t.batch_id
         JOIN students     s ON e.student_id = s.id
        WHERE t.id      = $1
          AND s.user_id = $2
          AND e.status  = $3
          AND t.status  = $4
        LIMIT 1`,
      [strTaskId, strUserId, STR_ENROLLMENT_STATUS_ACTIVE, STR_TASK_STATUS_PUBLISHED]
    );

    if (objTaskResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Task not found or you are not enrolled in this batch',
        code:  'NOT_FOUND',
      });
    }

    const objTask = objTaskResult.rows[0];

    // ---- 2. Check for existing submission ----
    const objExistResult = await client.query(
      `SELECT id, status
         FROM task_submissions
        WHERE task_id    = $1
          AND student_id = $2`,
      [strTaskId, strUserId]
    );

    const objExisting = objExistResult.rows[0] || null;

    if (objExisting && objExisting.status !== STR_SUBMISSION_STATUS_REOPENED) {
      return res.status(INT_HTTP_LOCKED).json({
        error: 'Submission locked — contact your trainer to reopen.',
        code:  'SUBMISSION_LOCKED',
      });
    }

    // ---- 3. Late submission flag (US-STU-05) ----
    const boolIsLate = new Date() > new Date(objTask.due_date);

    // ---- 4. File upload stub ----
    // req.file is populated by multer disk storage middleware on the route.
    // filename is the unique name multer assigned to the file on disk.
    const strS3Key = req.file ? req.file.filename : null;

    // ---- 5. Create or update submission ----
    // ON CONFLICT handles the 'reopened' resubmission case without a separate UPDATE.
    const objSubmitResult = await client.query(
      `INSERT INTO task_submissions
           (task_id, student_id, response_text, status, is_late, s3_key, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (task_id, student_id)
         DO UPDATE SET
           response_text = EXCLUDED.response_text,
           status        = EXCLUDED.status,
           is_late       = EXCLUDED.is_late,
           s3_key        = EXCLUDED.s3_key,
           submitted_at  = NOW()
         RETURNING id, task_id, student_id, response_text,
                   status, is_late, s3_key, submitted_at`,
      [
        strTaskId,
        strUserId,
        String(response_text).trim(),
        STR_SUBMISSION_STATUS_SUBMITTED,
        boolIsLate,
        strS3Key,
      ]
    );

    // ---- 6. Record daily activity (streak tracking) ----
    await client.query(
      `INSERT INTO student_activity
           (student_id, activity_date, content_items_accessed)
         VALUES ($1, CURRENT_DATE, 1)
         ON CONFLICT (student_id, activity_date)
         DO UPDATE SET
           content_items_accessed = student_activity.content_items_accessed + 1`,
      [strUserId]
    );

    // ---- 7. Invalidate student dashboard Redis cache ----
    try {
      await redis.del(`${STR_DASHBOARD_CACHE_KEY_PREFIX}${strUserId}`);
    } catch (redisDelErr) {
      // Cache invalidation failure must never block the response
      console.error('submitTask: Redis DEL error:', redisDelErr.message);
    }

    return res.status(201).json({ submission: objSubmitResult.rows[0] });

  } catch (err) {
    console.error('submitTask error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ==========================================================================
// EPIC-06: Student Progress Dashboard (US-STU-06, SRD FR-STU-06)
// ==========================================================================

// ---- US-STU-06 Constants (Zero Magic Values Rule) ----
const INT_PROGRESS_CACHE_TTL_SECONDS = 300;                // Redis TTL in seconds
const STR_PROGRESS_CACHE_KEY_PREFIX  = 'student_progress:';
const INT_WEEKLY_ACTIVITY_DAYS       = 364;                // 52 weeks × 7 days
const STR_TASK_SCORE_PENDING         = 'Pending evaluation'; // shown when task ungraded
const STR_TASK_DISP_NOT_SUBMITTED    = 'not_submitted';    // task_list display statuses
const STR_TASK_DISP_SUBMITTED        = 'submitted';
const STR_TASK_DISP_EVALUATED        = 'evaluated';
const STR_TASK_DISP_OVERDUE          = 'overdue';

// ---------------------------------------------------------------------------
// _buildWeeklyActivity(arrDbRows) → Array<{ date: 'YYYY-MM-DD', count: N }>
// ---------------------------------------------------------------------------
// Pure helper. Generates exactly INT_WEEKLY_ACTIVITY_DAYS (364) consecutive
// daily entries ending today (UTC), padding any date absent from the DB to
// count = 0 so the front-end heatmap always receives a full 52-week window.
// ---------------------------------------------------------------------------
function _buildWeeklyActivity(arrDbRows) {
  // Build lookup: 'YYYY-MM-DD' → count
  const mapActivity = new Map(
    arrDbRows.map(r => [String(r.date).slice(0, 10), parseInt(r.count, 10) || 0])
  );

  const arrResult = [];
  // Walk backwards from today so index 0 = oldest, last index = today
  for (let intI = INT_WEEKLY_ACTIVITY_DAYS - 1; intI >= 0; intI--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - intI);
    const strDate = d.toISOString().slice(0, 10);
    arrResult.push({
      date:  strDate,
      count: mapActivity.has(strDate) ? mapActivity.get(strDate) : 0,
    });
  }

  return arrResult; // exactly INT_WEEKLY_ACTIVITY_DAYS entries
}

// ---------------------------------------------------------------------------
// getStudentProgress(req, res)
// ---------------------------------------------------------------------------
// GET /api/student/progress (US-STU-06, SRD FR-STU-06)
//
// Returns four data arrays consumed by the progress dashboard:
//
//   module_completion — bar chart: per-module completed vs total items
//   weekly_activity   — heatmap:  exactly 364 daily entries, zeros padded
//   task_scores       — line chart: per-task score; 'Pending evaluation' if ungraded
//   task_list         — full task table with derived display status
//
// Redis cache: key = 'student_progress:{user_id}', TTL = 300 seconds.
// ---------------------------------------------------------------------------
async function getStudentProgress(req, res) {
  const strUserId   = req.user.user_id;
  const strCacheKey = `${STR_PROGRESS_CACHE_KEY_PREFIX}${strUserId}`;

  // ---- 1. Redis cache check ----
  try {
    const strCached = await redis.get(strCacheKey);
    if (strCached) {
      return res.status(200).json(JSON.parse(strCached));
    }
  } catch (redisGetErr) {
    console.error('getStudentProgress: Redis GET error:', redisGetErr.message);
  }

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    // ---- Query 1: module_completion ----
    // Per-module aggregate of total vs completed published content items.
    const objModuleResult = await client.query(
      `SELECT
           m.id            AS module_id,
           m.title         AS module_title,
           COUNT(ci.id)    AS total_items,
           COUNT(cp.content_item_id) FILTER (WHERE cp.is_completed = TRUE)
                           AS completed_items
         FROM modules          m
         JOIN sub_modules      sm ON sm.module_id     = m.id
         JOIN content_items    ci ON ci.sub_module_id = sm.id
                                 AND ci.status        = $2
         JOIN enrollments      e  ON e.course_id      = m.course_id
         JOIN students         s  ON e.student_id     = s.id
         LEFT JOIN content_progress cp
               ON  cp.content_item_id = ci.id
               AND cp.student_id      = $1
        WHERE s.user_id = $1
          AND e.status  = $3
        GROUP BY m.id, m.title, m.position
        ORDER BY m.position`,
      [strUserId, STR_CONTENT_STATUS_PUBLISHED, STR_ENROLLMENT_STATUS_ACTIVE]
    );

    const arrModuleCompletion = objModuleResult.rows.map(row => {
      const intTotal = parseInt(row.total_items,     10) || 0;
      const intDone  = parseInt(row.completed_items, 10) || 0;
      return {
        module_id:       row.module_id,
        module_title:    row.module_title,
        total_items:     intTotal,
        completed_items: intDone,
        completion_pct:  intTotal > 0
          ? Math.round((intDone / intTotal) * INT_COMPLETION_PCT_SCALE)
          : 0,
      };
    });

    // ---- Query 2: weekly_activity ----
    // Fetch activity rows for the last 364 days; _buildWeeklyActivity pads zeros.
    const objActivityResult = await client.query(
      `SELECT
           activity_date::text    AS date,
           content_items_accessed AS count
         FROM student_activity
        WHERE student_id    = $1
          AND activity_date >= CURRENT_DATE - ($2::int)
        ORDER BY activity_date ASC`,
      [strUserId, INT_WEEKLY_ACTIVITY_DAYS - 1]
    );

    const arrWeeklyActivity = _buildWeeklyActivity(objActivityResult.rows);

    // ---- Query 3: task data (shared base for task_scores + task_list) ----
    const objTaskResult = await client.query(
      `SELECT
           t.id,
           t.title         AS task_title,
           t.due_date,
           t.max_score,
           ts.id           AS submission_id,
           ts.status       AS submission_status,
           ts.score,
           (ts.id IS NOT NULL AND ts.submitted_at > t.due_date) AS is_late,
           ts.submitted_at,
           ts.feedback
         FROM tasks             t
         JOIN enrollments       e  ON e.batch_id    = t.batch_id
         JOIN students          s  ON e.student_id  = s.id
         LEFT JOIN task_submissions ts
               ON  ts.task_id    = t.id
               AND ts.student_id = s.user_id
        WHERE s.user_id  = $1
          AND e.status   = $2
          AND t.status   = $3
        ORDER BY t.due_date ASC`,
      [strUserId, STR_ENROLLMENT_STATUS_ACTIVE, STR_TASK_STATUS_PUBLISHED]
    );

    // Build task_scores: for the line chart (due_date × score).
    // Tasks without an evaluated score show STR_TASK_SCORE_PENDING.
    const arrTaskScores = objTaskResult.rows.map(row => ({
      task_title: row.task_title,
      due_date:   row.due_date,
      score:      row.score !== null ? row.score : null,
      max_score:  row.max_score,
      status:     row.score !== null
        ? (row.submission_status || STR_TASK_SCORE_PENDING)
        : STR_TASK_SCORE_PENDING,
    }));

    // Build task_list: full table with a four-value derived display status.
    const dtNow       = new Date();
    const arrTaskList = objTaskResult.rows.map(row => {
      let strDisplayStatus;
      if (!row.submission_id) {
        strDisplayStatus = dtNow > new Date(row.due_date)
          ? STR_TASK_DISP_OVERDUE
          : STR_TASK_DISP_NOT_SUBMITTED;
      } else if (row.submission_status === STR_TASK_DISP_EVALUATED) {
        strDisplayStatus = STR_TASK_DISP_EVALUATED;
      } else {
        strDisplayStatus = STR_TASK_DISP_SUBMITTED;
      }

      return {
        id:           row.id,
        title:        row.task_title,
        due_date:     row.due_date,
        status:       strDisplayStatus,
        score:        row.score !== undefined ? row.score : null,
        max_score:    row.max_score,
        is_late:      row.is_late      || false,
        submitted_at: row.submitted_at || null,
        feedback:     row.feedback     || null,
      };
    });

    // ---- Assemble and cache response ----
    const objResponse = {
      module_completion: arrModuleCompletion,
      weekly_activity:   arrWeeklyActivity,
      task_scores:       arrTaskScores,
      task_list:         arrTaskList,
    };

    try {
      await redis.set(
        strCacheKey,
        JSON.stringify(objResponse),
        'EX',
        INT_PROGRESS_CACHE_TTL_SECONDS
      );
    } catch (redisSetErr) {
      console.error('getStudentProgress: Redis SET error:', redisSetErr.message);
    }

    return res.status(200).json(objResponse);

  } catch (err) {
    console.error('getStudentProgress error:', err.message);
    console.error('getStudentProgress stack:', err.stack);
    // Return full detail in dev so the browser console reveals the root cause
    return res.status(500).json({
      error: 'Internal server error',
      detail: err.message,
      hint: err.hint || undefined,
    });
  } finally {
    client.release();
  }
}

// ==========================================================================
// EPIC-06: Certificate Retrieval + Public Verification (US-STU-07)
// ==========================================================================

// ---------------------------------------------------------------------------
// getCertificate(req, res)
// ---------------------------------------------------------------------------
// GET /api/student/certificates/:enrollmentId (US-STU-07)
//
// Returns the certificate download URL for the authenticated student's own
// certificate. 404 if not yet generated.
// ---------------------------------------------------------------------------
async function getCertificate(req, res) {
  const strEnrollmentId = req.params.enrollmentId;
  const strUserId       = req.user.user_id;

  if (!strEnrollmentId) {
    return res.status(400).json({ error: 'enrollmentId is required', code: 'MISSING_PARAM' });
  }

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    // Verify the enrollment belongs to the authenticated student (data isolation)
    const objResult = await client.query(
      `SELECT cert.id, cert.certificate_url, cert.public_verification_token, cert.generated_at
         FROM certificates cert
         JOIN enrollments  e ON cert.enrollment_id = e.id
         JOIN students     s ON e.student_id       = s.id
        WHERE cert.enrollment_id = $1
          AND s.user_id          = $2
        LIMIT 1`,
      [strEnrollmentId, strUserId]
    );

    if (objResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Certificate not yet generated for this enrollment',
        code:  'NOT_FOUND',
      });
    }

    const objCert      = objResult.rows[0];
    const strBaseUrl   = process.env.FRONTEND_URL || 'http://localhost:3002';
    const strVerifyUrl = `${strBaseUrl}/api/student/certificates/verify/${objCert.public_verification_token}`;

    return res.status(200).json({
      certificate_url:           objCert.certificate_url,
      public_verification_token: objCert.public_verification_token,
      verification_url:          strVerifyUrl,
      generated_at:              objCert.generated_at,
    });

  } catch (err) {
    console.error('getCertificate error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// verifyCertificate(req, res)
// ---------------------------------------------------------------------------
// GET /api/student/certificates/verify/:token (US-STU-07)
//
// Publicly accessible — NO authentication required.
// Used by employers to verify a certificate by its public token.
//
// Response: { studentName, courseName, completionDate, isValid: true }
// ---------------------------------------------------------------------------
async function verifyCertificate(req, res) {
  const strToken = req.params.token;

  if (!strToken) {
    return res.status(400).json({ error: 'token is required', code: 'MISSING_PARAM' });
  }

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    const objResult = await client.query(
      `SELECT
           s.first_name,
           s.last_name,
           c.name       AS course_name,
           cert.generated_at AS completion_date
         FROM certificates cert
         JOIN enrollments  e ON cert.enrollment_id = e.id
         JOIN students     s ON e.student_id       = s.id
         JOIN courses      c ON e.course_id        = c.id
        WHERE cert.public_verification_token = $1
        LIMIT 1`,
      [strToken]
    );

    if (objResult.rows.length === 0) {
      return res.status(404).json({
        isValid: false,
        error:   'Certificate not found or token is invalid',
        code:    'NOT_FOUND',
      });
    }

    const objRow         = objResult.rows[0];
    const strStudentName = `${objRow.first_name} ${objRow.last_name || ''}`.trim();

    return res.status(200).json({
      studentName:    strStudentName,
      courseName:     objRow.course_name,
      completionDate: objRow.completion_date,
      isValid:        true,
    });

  } catch (err) {
    console.error('verifyCertificate error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ==========================================================================
// EPIC-06 Prompt I: In-App Notifications (US-STU-09)
// ==========================================================================

// ---- Notification constants ----
const INT_NOTIF_LIMIT           = 20;    // max notifications per page

// ---------------------------------------------------------------------------
// getNotifications(req, res)
// ---------------------------------------------------------------------------
// GET /api/student/notifications
// Returns the 20 most-recent unread notifications for the authenticated user.
// ---------------------------------------------------------------------------
async function getNotifications(req, res) {
  const strUserId = req.user.user_id;

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    const objResult = await client.query(
      `SELECT id, type, title, body, is_read, reference_id, created_at
         FROM notifications
        WHERE user_id  = $1
          AND is_read  = FALSE
        ORDER BY created_at DESC
        LIMIT $2`,
      [strUserId, INT_NOTIF_LIMIT]
    );

    return res.status(200).json({ notifications: objResult.rows });

  } catch (err) {
    console.error('getNotifications error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// markNotificationRead(req, res)
// ---------------------------------------------------------------------------
// PATCH /api/student/notifications/:id/read
// Sets is_read = true for the given notification.
// Enforces ownership: only the notification's owner can mark it read.
// ---------------------------------------------------------------------------
async function markNotificationRead(req, res) {
  const strNotifId = req.params.id;
  const strUserId  = req.user.user_id;

  if (!strNotifId) {
    return res.status(400).json({ error: 'Notification id is required', code: 'MISSING_PARAM' });
  }

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    const objResult = await client.query(
      `UPDATE notifications
          SET is_read = TRUE
        WHERE id      = $1
          AND user_id = $2
        RETURNING id, is_read`,
      [strNotifId, strUserId]
    );

    if (objResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Notification not found or not owned by current user',
        code:  'NOT_FOUND',
      });
    }

    return res.status(200).json({ id: objResult.rows[0].id, is_read: true });

  } catch (err) {
    console.error('markNotificationRead error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// getUnreadCount(req, res)
// ---------------------------------------------------------------------------
// GET /api/student/notifications/count
// Returns { unread_count: N } — used by the frontend bell-icon badge.
// ---------------------------------------------------------------------------
async function getUnreadCount(req, res) {
  const strUserId = req.user.user_id;

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    const objResult = await client.query(
      `SELECT COUNT(*)::int AS unread_count
         FROM notifications
        WHERE user_id = $1
          AND is_read = FALSE`,
      [strUserId]
    );

    return res.status(200).json({ unread_count: objResult.rows[0].unread_count });

  } catch (err) {
    console.error('getUnreadCount error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ==========================================================================
// EPIC-06 Prompt J: Live Session Display + Join Button (US-STU-08)
// ==========================================================================

// ---- Live Session constants (Zero Magic Values Rule) ----
const INT_JOINABLE_WINDOW_MINUTES = 15;  // session is joinable ≤15 min before start
const INT_MS_PER_MINUTE           = 60000;

// ---------------------------------------------------------------------------
// getLiveSessions(req, res)
// ---------------------------------------------------------------------------
// GET /api/student/courses/:courseId/live-sessions (US-STU-08)
// Middleware: authenticate, checkEnrollment
//
// Returns all live_sessions for the student's enrolled batch on this course.
// Per-session computed fields (JS-side, not SQL):
//   is_upcoming          – scheduled_at > NOW()
//   is_joinable          – scheduled_at is within 15 min from NOW()
//                          (upcoming AND within the window, OR already started)
//   minutes_until_start  – positive = in future, negative = already started
//
// Ordered by scheduled_at ASC.
// ---------------------------------------------------------------------------
async function getLiveSessions(req, res) {
  const strCourseId = req.params.courseId;
  const strUserId   = req.user.user_id;

  if (!strCourseId) {
    return res.status(400).json({ error: 'courseId is required', code: 'MISSING_PARAM' });
  }

  const client = await pool.connect();

  try {
    await client.query(`SET app.current_user_role = '${STR_ROLE_SUPER_ADMIN}'`);

    // Resolve the student's batch for this course
    const objEnrollResult = await client.query(
      `SELECT e.batch_id
         FROM enrollments e
         JOIN students    s ON e.student_id = s.id
        WHERE s.user_id   = $1
          AND e.course_id = $2
          AND e.status    = $3
        LIMIT 1`,
      [strUserId, strCourseId, STR_ENROLLMENT_STATUS_ACTIVE]
    );

    if (objEnrollResult.rows.length === 0) {
      return res.status(403).json({
        error: 'No active enrollment found for this course',
        code:  'NOT_ENROLLED',
      });
    }

    const strBatchId = objEnrollResult.rows[0].batch_id;

    // Fetch all live sessions for this batch
    const objSessionsResult = await client.query(
      `SELECT
           ls.id,
           ls.title,
           ls.scheduled_at,
           ls.duration_minutes,
           ls.meeting_url
         FROM live_sessions ls
        WHERE ls.batch_id = $1
        ORDER BY ls.scheduled_at ASC`,
      [strBatchId]
    );

    const dtNow = new Date();

    const arrSessions = objSessionsResult.rows.map((objRow) => {
      const dtScheduled         = new Date(objRow.scheduled_at);
      const numMsUntilStart     = dtScheduled - dtNow;
      const numMinutesUntil     = Math.round(numMsUntilStart / INT_MS_PER_MINUTE);
      const boolIsUpcoming      = numMsUntilStart > 0;
      // Joinable: starts within 15 minutes OR started but within duration window
      const boolIsJoinable      = numMinutesUntil <= INT_JOINABLE_WINDOW_MINUTES
                                  && numMinutesUntil > -(objRow.duration_minutes || INT_JOINABLE_WINDOW_MINUTES);

      return {
        id:                   objRow.id,
        title:                objRow.title,
        scheduled_at:         objRow.scheduled_at,
        duration_minutes:     objRow.duration_minutes,
        meeting_url:          objRow.meeting_url,
        is_upcoming:          boolIsUpcoming,
        is_joinable:          boolIsJoinable,
        minutes_until_start:  numMinutesUntil,
      };
    });

    return res.status(200).json({ sessions: arrSessions });

  } catch (err) {
    console.error('getLiveSessions error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

module.exports = {
  getStudentDashboard,
  getCourseContent,
  getContentItem,
  saveVideoProgress,
  getVideoProgress,
  getStudentPortalDashboard,
  getTasks,
  getTaskDetail,
  submitTask,
  getStudentProgress,
  getCertificate,
  verifyCertificate,
  getNotifications,
  markNotificationRead,
  getUnreadCount,
  getLiveSessions,
};
