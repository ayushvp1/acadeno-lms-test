const express           = require('express');
const router            = express.Router();
const multer            = require('multer');
const studentController  = require('../controllers/studentController');
const authenticate       = require('../middleware/authenticate');
const authorize          = require('../middleware/authorize');
const checkEnrollment    = require('../middleware/checkEnrollment');

// Multer disk-storage stub for task file submissions (US-STU-05)
// Files are saved to ./uploads/ with a unique name; filename becomes s3_key.
const uploadTaskFile = multer({ dest: 'uploads/' }).single('file');

// GET /student/dashboard -- Student portal home dashboard (US-STU-04, FR-STU-01)
router.get('/dashboard', authenticate, studentController.getStudentPortalDashboard);

// ---- EPIC-06: Student Portal Content Access (US-STU-01, US-STU-02) ----

// GET /student/courses/:courseId/content
// Returns full module tree with per-item completion state.
// checkEnrollment provides defence-in-depth; getCourseContent also enforces BR-C02.
router.get('/courses/:courseId/content', authenticate, checkEnrollment, studentController.getCourseContent);

// GET /student/content/:contentId
// Returns a single published content item; auto-completes PDFs; records activity.
router.get('/content/:contentId', authenticate, studentController.getContentItem);

// ---- EPIC-06: Video Progress Tracking (US-STU-02, SRD FR-STU-04) ----

// POST /student/content/:contentId/progress
// Saves watch position, auto-marks completion at 90%, triggers certificate at 100%.
router.post('/content/:contentId/progress', authenticate, studentController.saveVideoProgress);

// GET /student/content/:contentId/progress
// Returns resume position so the video player can restart at the correct offset.
router.get('/content/:contentId/progress', authenticate, studentController.getVideoProgress);

// ---- EPIC-06: Student Task View + Submission (US-STU-05) ----
// Note: authorize('student') is intentionally omitted — the path
// /api/student/tasks does not match the allowed prefix '/tasks' in
// PERMISSIONS.student.allowedPrefixes (checked against req.originalUrl).
// Enrollment/batch scoping is enforced inline in each controller via JOIN.

// GET /student/tasks
// Lists all published tasks for the student's active batch(es) with
// submission status and is_overdue flag, ordered by due_date ASC.
router.get('/tasks',                authenticate, studentController.getTasks);

// GET /student/tasks/:taskId
// Returns full task detail including rubric and student's submission.
router.get('/tasks/:taskId',        authenticate, studentController.getTaskDetail);

// POST /student/tasks/:taskId/submit
// Accepts { response_text } + optional file upload (multer disk stub).
// Enforces BR-C02 (enrollment), late flag (US-STU-05), locked gate (423).
router.post('/tasks/:taskId/submit', authenticate, uploadTaskFile, studentController.submitTask);

// ---- EPIC-06: Student Progress Dashboard (US-STU-06, SRD FR-STU-06) ----
// Note: authorize('student') omitted — /api/student/progress does not match
// any prefix in PERMISSIONS.student.allowedPrefixes (checked against
// req.originalUrl). Data isolation is enforced inline via JOIN on students.user_id.

// GET /student/progress
// Returns 4 data arrays: module_completion, weekly_activity (364 days),
// task_scores, task_list. Redis cache TTL = 300 seconds.
router.get('/progress', authenticate, authorize('student'), studentController.getStudentProgress);

// ---- EPIC-06: Certificate Retrieval + Public Verification (US-STU-07) ----
// IMPORTANT: /verify/:token MUST be declared BEFORE /:enrollmentId so Express
// does not treat the literal string 'verify' as an enrollmentId parameter.

// GET /student/certificates/verify/:token
// NO authentication required — publicly accessible for employer verification.
router.get('/certificates/verify/:token', studentController.verifyCertificate);

// GET /student/certificates/:enrollmentId
// Returns certificate URL + verification link for the student's own enrollment.
router.get('/certificates/:enrollmentId', authenticate, authorize('student'), studentController.getCertificate);

// ---- EPIC-06 Prompt I: In-App Notifications (US-STU-09) ----
// IMPORTANT: /notifications/count MUST be declared BEFORE /notifications/:id/read
// so Express does not try to parse the literal 'count' as a notification ID.

// GET /student/notifications/count — unread badge count for bell icon
router.get('/notifications/count', authenticate, studentController.getUnreadCount);

// GET /student/notifications — list latest 20 unread notifications
router.get('/notifications', authenticate, studentController.getNotifications);

// PATCH /student/notifications/:id/read — mark a single notification as read
router.patch('/notifications/:id/read', authenticate, studentController.markNotificationRead);

// ---- EPIC-06 Prompt J: Live Session Display + Join Button (US-STU-08) ----

// GET /student/courses/:courseId/live-sessions
// Returns all live sessions for the student's enrolled batch with
// is_joinable flag (true when within 15 min of scheduled_at) and
// minutes_until_start for countdown display. Ordered by scheduled_at ASC.
router.get(
  '/courses/:courseId/live-sessions',
  authenticate,
  checkEnrollment,
  studentController.getLiveSessions
);

module.exports = router;
