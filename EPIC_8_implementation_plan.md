# EPIC 8 — HR & Admin Management
## Implementation Plan

**Branch:** `EPIC_8`
**Stack:** Matches EPIC 3 exactly — Node.js/Express (CommonJS) backend, React 19 + Vite frontend, PostgreSQL, Redis, plain CSS.
**Stories Covered:** US-HR-01 through US-HR-07

---

## 0. Stack Reference (from existing codebase)

| Layer | Technology | Notes |
|---|---|---|
| Backend | Node.js + Express 5, CommonJS (`require`) | Same as EPIC 1–3 |
| Database | PostgreSQL via `pg`, `pool.connect()` pattern | RLS enforced via `app.current_user_role` session variable |
| Cache | Redis via `ioredis` | Used for tokens, job queues |
| Auth | JWT RS256 — `authenticate` + `authorize` middleware | Roles: `super_admin`, `hr`, `bda`, `trainer`, `student` |
| Frontend | React 19 + Vite, React Router DOM v7 | Functional components + hooks |
| HTTP Client | `axiosInstance` (with refresh token interceptor) | In `src/api/axiosInstance.js` |
| Styling | Plain CSS, CSS variables, `src/styles/*.css` | No Tailwind, no component library |
| Testing | Jest + Supertest | Mock `pool.connect`, mock `verifyAccessToken` per test file |

---

## 1. Database Migrations

Run these before writing any code. Add as a `migration_epic8.sql` file at the project root.

### 1.1 Alter `batches` Table
The existing `batches` table (used in EPIC 3's `coursesController.js`) needs new columns for US-HR-01.

```sql
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS batch_code       VARCHAR(50)  UNIQUE,
  ADD COLUMN IF NOT EXISTS schedule_type    VARCHAR(20)  CHECK (schedule_type IN ('weekday','weekend','custom')),
  ADD COLUMN IF NOT EXISTS class_days       JSONB        DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS class_time_start TIME,
  ADD COLUMN IF NOT EXISTS class_time_end   TIME,
  ADD COLUMN IF NOT EXISTS meeting_url      TEXT,
  ADD COLUMN IF NOT EXISTS status           VARCHAR(20)  NOT NULL DEFAULT 'upcoming'
                                            CHECK (status IN ('upcoming','active','completed','cancelled'));
```

### 1.2 New `trainer_course_pool` Table (US-HR-04)
```sql
CREATE TABLE IF NOT EXISTS trainer_course_pool (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  trainer_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_by    UUID        NOT NULL REFERENCES users(id),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, trainer_id)
);
```

### 1.3 New `system_settings` Table (US-HR-06)
```sql
CREATE TABLE IF NOT EXISTS system_settings (
  key           VARCHAR(100) PRIMARY KEY,
  value         TEXT         NOT NULL,
  description   TEXT,
  is_sensitive  BOOLEAN      NOT NULL DEFAULT FALSE,
  updated_by    UUID         REFERENCES users(id),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed default values
INSERT INTO system_settings (key, value, description, is_sensitive)
VALUES
  ('gst_rate',              '18',               'GST percentage applied to all invoices', FALSE),
  ('invoice_prefix',        'INV',              'Prefix used for sequential invoice numbers', FALSE),
  ('at_risk_completion_pct','40',               'Completion % below which a student is flagged at-risk', FALSE),
  ('at_risk_overdue_tasks', '3',                'Number of overdue tasks that triggers at-risk flag', FALSE),
  ('razorpay_webhook_secret','',                'Razorpay webhook signature secret', TRUE)
ON CONFLICT (key) DO NOTHING;
```

---

## 2. Backend — New Files to Create

### 2.1 `src/controllers/batchController.js`
Handles US-HR-01, US-HR-02, US-HR-04.

**Functions to implement:**

| Function | Method & Path | Story | Notes |
|---|---|---|---|
| `createBatch` | POST `/api/batches` | US-HR-01 | Validate start_date not in past (BR-C04). Set `status = 'upcoming'`. |
| `listBatches` | GET `/api/batches` | US-HR-01 | Support `?course_id=`, `?status=` filters. Join trainer name. |
| `getBatch` | GET `/api/batches/:id` | US-HR-01 | Full batch detail including enrolled_count. |
| `updateBatch` | PATCH `/api/batches/:id` | US-HR-01 | Partial update. Cannot change course_id if enrollments exist. |
| `assignTrainer` | PATCH `/api/batches/:id/trainer` | US-HR-02 | Sets `trainer_id`. Trainer must be in trainer_course_pool. Send email notification. |
| `autoAssignTrainer` | POST `/api/batches/:id/auto-assign` | US-HR-02 | Pick trainer from pool with `MIN(active_batch_count)`. Same notification. |
| `listTrainerPool` | GET `/api/courses/:courseId/trainer-pool` | US-HR-04 | List trainers in pool with active_batch_count. |
| `addTrainerToPool` | POST `/api/courses/:courseId/trainer-pool` | US-HR-04 | Insert into `trainer_course_pool`. |
| `removeTrainerFromPool` | DELETE `/api/courses/:courseId/trainer-pool/:trainerId` | US-HR-04 | Delete from pool. Cannot remove if trainer is on an active batch for this course. |

**Pattern to follow** (identical to `leadController.js`):
```js
// ==========================================================================
// ACADENO LMS — Batch Controller (EPIC-08)
// ==========================================================================
const { pool } = require('../db/index');

async function createBatch(req, res) {
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_user_role', $1::text, false)", [req.user.role]);
    await client.query('BEGIN');
    // ... validation, SQL, commit
    await client.query('COMMIT');
    return res.status(201).json({ batch });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('CREATE BATCH ERROR:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}
```

---

### 2.2 `src/controllers/hrController.js`
Handles US-HR-03 and US-HR-05.

| Function | Method & Path | Story | Notes |
|---|---|---|---|
| `listEnrollments` | GET `/api/hr/enrollments` | US-HR-03 | Filters: `status`, `payment_status`, `course_id`, `batch_id`. Return student name, reg no, course, batch, enrollment status, payment status, completion %. |
| `getEnrollmentDetail` | GET `/api/hr/enrollments/:studentId` | US-HR-03 | Redirect to student full profile (joins students + users + enrollments + payments). |
| `getRegistrationReport` | GET `/api/hr/reports/registrations` | US-HR-05 | Filters: `date_from`, `date_to`, `course_id`, `batch_id`, `registration_status`, `payment_status`. |
| `exportRegistrationsCSV` | GET `/api/hr/reports/registrations/export` | US-HR-05 | Same filters as above. Build CSV string in-memory, set `Content-Disposition: attachment` header, stream response. No file saved to disk. |

---

### 2.3 `src/controllers/adminController.js`
Handles US-HR-06 and US-HR-07.

| Function | Method & Path | Story | Notes |
|---|---|---|---|
| `listSettings` | GET `/api/admin/settings` | US-HR-06 | Return all settings. Mask `value` for `is_sensitive = true` (return `"••••••••"` in the value field). |
| `updateSetting` | PATCH `/api/admin/settings/:key` | US-HR-06 | Re-authentication gate for sensitive keys: require `current_password` in body. Verify bcrypt against users table before saving. |
| `getAnalytics` | GET `/api/admin/analytics` | US-HR-07 | Single query or parallel queries for: total active students, total revenue this month, active batch count, enrollments by course (for bar chart), monthly registration trend (last 12 months). |

---

### 2.4 `src/routes/batches.js`
```js
// ==========================================================================
// ACADENO LMS — Batches Router (EPIC-08)
// ==========================================================================
const express   = require('express');
const router    = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');
const { createBatch, listBatches, getBatch, updateBatch,
        assignTrainer, autoAssignTrainer } = require('../controllers/batchController');

const hrAndAbove = [authenticate, authorize('hr')]; // hr level = 40, super_admin = 50 (inherits)

router.get ('/',                  ...hrAndAbove, listBatches);
router.post('/',                  ...hrAndAbove, createBatch);
router.get ('/:id',               ...hrAndAbove, getBatch);
router.patch('/:id',              ...hrAndAbove, updateBatch);
router.patch('/:id/trainer',      ...hrAndAbove, assignTrainer);
router.post ('/:id/auto-assign',  ...hrAndAbove, autoAssignTrainer);

module.exports = router;
```

### 2.5 `src/routes/hr.js`
```js
const express   = require('express');
const router    = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');
const { listEnrollments, getEnrollmentDetail,
        getRegistrationReport, exportRegistrationsCSV } = require('../controllers/hrController');

const hrAndAbove = [authenticate, authorize('hr')];

router.get('/enrollments',                    ...hrAndAbove, listEnrollments);
router.get('/enrollments/:studentId',         ...hrAndAbove, getEnrollmentDetail);
router.get('/reports/registrations',          ...hrAndAbove, getRegistrationReport);
router.get('/reports/registrations/export',   ...hrAndAbove, exportRegistrationsCSV);

module.exports = router;
```

### 2.6 `src/routes/admin.js`
```js
const express   = require('express');
const router    = express.Router();
const authenticate    = require('../middleware/authenticate');
const authorize       = require('../middleware/authorize');
const { listSettings, updateSetting, getAnalytics } = require('../controllers/adminController');

const superAdminOnly = [authenticate, authorize('super_admin')];

router.get ('/settings',       ...superAdminOnly, listSettings);
router.patch('/settings/:key', ...superAdminOnly, updateSetting);
router.get ('/analytics',      ...superAdminOnly, getAnalytics);

module.exports = router;
```

Also add trainer pool routes inside `src/routes/courses.js` (existing file — extend, don't replace):
```js
// Add these to the existing courses.js router
router.get ('/:courseId/trainer-pool',             ...authAndRole, listTrainerPool);
router.post('/:courseId/trainer-pool',             ...authAndRole, addTrainerToPool);
router.delete('/:courseId/trainer-pool/:trainerId', ...authAndRole, removeTrainerFromPool);
```

---

### 2.7 Register Routes in `src/app.js`
Add three lines to the EPIC-08 section:
```js
// EPIC-08: HR & Admin Management
const batchRoutes = require('./routes/batches');
const hrRoutes    = require('./routes/hr');
const adminRoutes = require('./routes/admin');

app.use('/api/batches', batchRoutes);
app.use('/api/hr',      hrRoutes);
app.use('/api/admin',   adminRoutes);
```

---

## 3. Frontend — New Files to Create

All new pages follow the same conventions as EPIC 2/3: functional component, `useState`/`useEffect`, `axiosInstance` for API calls, plain CSS classes.

### 3.1 `src/api/batchApi.js`
```js
import axiosInstance from './axiosInstance';

export const batchApi = {
  listBatches: (params) => axiosInstance.get('/api/batches', { params }).then(r => r.data),
  getBatch: (id) => axiosInstance.get(`/api/batches/${id}`).then(r => r.data),
  createBatch: (data) => axiosInstance.post('/api/batches', data).then(r => r.data),
  updateBatch: (id, data) => axiosInstance.patch(`/api/batches/${id}`, data).then(r => r.data),
  assignTrainer: (id, trainerId) => axiosInstance.patch(`/api/batches/${id}/trainer`, { trainer_id: trainerId }).then(r => r.data),
  autoAssign: (id) => axiosInstance.post(`/api/batches/${id}/auto-assign`).then(r => r.data),
  listTrainerPool: (courseId) => axiosInstance.get(`/api/courses/${courseId}/trainer-pool`).then(r => r.data),
  addToPool: (courseId, trainerId) => axiosInstance.post(`/api/courses/${courseId}/trainer-pool`, { trainer_id: trainerId }).then(r => r.data),
  removeFromPool: (courseId, trainerId) => axiosInstance.delete(`/api/courses/${courseId}/trainer-pool/${trainerId}`).then(r => r.data),
};
```

### 3.2 `src/api/hrApi.js`
```js
import axiosInstance from './axiosInstance';

export const hrApi = {
  listEnrollments: (params) => axiosInstance.get('/api/hr/enrollments', { params }).then(r => r.data),
  getEnrollmentDetail: (studentId) => axiosInstance.get(`/api/hr/enrollments/${studentId}`).then(r => r.data),
  getReport: (params) => axiosInstance.get('/api/hr/reports/registrations', { params }).then(r => r.data),
  exportCSV: (params) => axiosInstance.get('/api/hr/reports/registrations/export', { params, responseType: 'blob' }),
};
```

### 3.3 `src/api/adminApi.js`
```js
import axiosInstance from './axiosInstance';

export const adminApi = {
  listSettings: () => axiosInstance.get('/api/admin/settings').then(r => r.data),
  updateSetting: (key, data) => axiosInstance.patch(`/api/admin/settings/${key}`, data).then(r => r.data),
  getAnalytics: () => axiosInstance.get('/api/admin/analytics').then(r => r.data),
};
```

---

### 3.4 New Page Files

| File | Story | Description |
|---|---|---|
| `src/pages/hr/BatchListPage.jsx` | US-HR-01 | Table of all batches, filter by course/status, "+ Create Batch" button |
| `src/pages/hr/CreateBatchPage.jsx` | US-HR-01 | Multi-field form: course dropdown, batch name, batch code, dates, schedule type, class days/times, capacity, meeting URL. Validate start date not in past. |
| `src/pages/hr/BatchDetailPage.jsx` | US-HR-01, US-HR-02, US-HR-04 | Batch info + trainer assignment section (dropdown from pool, auto-assign button) + trainer pool management tab |
| `src/pages/hr/EnrollmentsPage.jsx` | US-HR-03 | Filterable table (student name, reg no, course, batch, enrollment status, payment status, completion %). Click row → student profile. |
| `src/pages/hr/ReportsPage.jsx` | US-HR-05 | Filter panel (date range, course, batch, statuses). Results table. "Export CSV" button triggers download. Empty state if no results. |
| `src/pages/admin/SystemSettingsPage.jsx` | US-HR-06 | Table of all config keys with current value (masked for sensitive). Inline edit. Password re-auth modal for sensitive fields. |
| `src/pages/admin/AnalyticsDashboardPage.jsx` | US-HR-07 | Stat cards (total students, revenue, active batches). Bar chart (enrollments by course — pure CSS or inline SVG, no chart library). Line chart (monthly trend). Drill-down on course → batch list. |

**Component style** — follow the pattern from `BdaDashboardPage.jsx`:
- Import CSS from `../../styles/hr.css`
- `useState` for data, loading, error
- `useEffect` to fetch on mount
- Loading/error guard at top of render
- Clean semantic HTML with CSS class names

---

### 3.5 `src/styles/hr.css`
New CSS file for all HR and Admin pages. Use the same CSS variables already defined (`--navy-bg`, `--white`, `--border-radius`, etc.) from the existing `leads.css`.

### 3.6 Update `src/App.jsx`
Add the new HR and Admin routes inside the `<ProtectedRoute>` block:
```jsx
// Import new pages
import BatchListPage        from './pages/hr/BatchListPage';
import CreateBatchPage      from './pages/hr/CreateBatchPage';
import BatchDetailPage      from './pages/hr/BatchDetailPage';
import EnrollmentsPage      from './pages/hr/EnrollmentsPage';
import ReportsPage          from './pages/hr/ReportsPage';
import SystemSettingsPage   from './pages/admin/SystemSettingsPage';
import AnalyticsDashboardPage from './pages/admin/AnalyticsDashboardPage';

// Add inside <Route element={<DashboardPage />}>:
<Route path="/batches"              element={<BatchListPage />} />
<Route path="/batches/new"          element={<CreateBatchPage />} />
<Route path="/batches/:id"          element={<BatchDetailPage />} />
<Route path="/hr/enrollments"       element={<EnrollmentsPage />} />
<Route path="/hr/reports"           element={<ReportsPage />} />
<Route path="/admin/settings"       element={<SystemSettingsPage />} />
<Route path="/admin/analytics"      element={<AnalyticsDashboardPage />} />
```

### 3.7 Update `src/pages/StaffDashboardPage.jsx`
Add navigation links to the new HR/Admin routes in the sidebar or nav menu, conditionally rendered based on role (`hr` or `super_admin`).

---

## 4. Test Files to Create

Follow the exact pattern from `leads.create.test.js` — standalone Express app, mocked `pool.connect`, mocked `verifyAccessToken`.

| Test File | Story | Key Scenarios |
|---|---|---|
| `__tests__/batch.create.test.js` | US-HR-01 | Happy path creates batch; start_date in past returns 400; missing fields return 400; duplicate batch_code returns 409 |
| `__tests__/batch.trainer.test.js` | US-HR-02 | Assign trainer sets trainer_id; trainer not in pool returns 400; auto-assign picks lowest batch count |
| `__tests__/trainer.pool.test.js` | US-HR-04 | Add to pool succeeds; remove from pool blocked if trainer on active batch; duplicate add returns 409 |
| `__tests__/hr.enrollments.test.js` | US-HR-03 | Returns enrollments list; filter by payment_status works; non-HR role returns 403 |
| `__tests__/hr.reports.test.js` | US-HR-05 | Report returns filtered data; CSV export returns correct headers and Content-Disposition; empty results return empty array |
| `__tests__/admin.settings.test.js` | US-HR-06 | List settings masks sensitive values; update normal key succeeds; update sensitive key without password returns 400 |
| `__tests__/admin.analytics.test.js` | US-HR-07 | Returns all 5 analytics fields; non-super_admin gets 403 |

---

## 5. Build Order (Story-by-Story Sequence)

Do each story end-to-end before moving to the next.

```
US-HR-01  →  DB migration (batches columns)
          →  batchController: createBatch, listBatches, getBatch, updateBatch
          →  routes/batches.js
          →  app.js mount
          →  batch.create.test.js
          →  batchApi.js
          →  BatchListPage.jsx + CreateBatchPage.jsx
          →  App.jsx routes + StaffDashboardPage nav link

US-HR-02  →  batchController: assignTrainer, autoAssignTrainer
          →  routes/batches.js (patch/:id/trainer, post/:id/auto-assign)
          →  batch.trainer.test.js
          →  batchApi.js additions
          →  BatchDetailPage.jsx (trainer assignment section)

US-HR-04  →  DB migration (trainer_course_pool table)
          →  batchController: listTrainerPool, addTrainerToPool, removeTrainerFromPool
          →  courses.js route additions
          →  trainer.pool.test.js
          →  batchApi.js additions
          →  BatchDetailPage.jsx (trainer pool tab)

US-HR-03  →  hrController: listEnrollments, getEnrollmentDetail
          →  routes/hr.js
          →  app.js mount /api/hr
          →  hr.enrollments.test.js
          →  hrApi.js
          →  EnrollmentsPage.jsx
          →  App.jsx route

US-HR-05  →  hrController: getRegistrationReport, exportRegistrationsCSV
          →  routes/hr.js additions
          →  hr.reports.test.js
          →  hrApi.js additions
          →  ReportsPage.jsx
          →  App.jsx route

US-HR-06  →  DB migration (system_settings table + seed)
          →  adminController: listSettings, updateSetting
          →  routes/admin.js
          →  app.js mount /api/admin
          →  admin.settings.test.js
          →  adminApi.js
          →  SystemSettingsPage.jsx
          →  App.jsx route

US-HR-07  →  adminController: getAnalytics
          →  routes/admin.js addition
          →  admin.analytics.test.js
          →  adminApi.js addition
          →  AnalyticsDashboardPage.jsx
          →  App.jsx route
```

---

## 6. Key Business Rules to Enforce

| Rule | Where | Implementation |
|---|---|---|
| Start date must not be in the past | `createBatch` controller | `if (new Date(start_date) < new Date()) → 400` |
| Batch status = `upcoming` on creation | `createBatch` controller | Hard-coded `status = 'upcoming'` in INSERT |
| Batch appears in enrollment course selector once created | `listBatches` query | Filter `status != 'cancelled'` |
| Trainer must be in approved pool before assignment | `assignTrainer` controller | JOIN check against `trainer_course_pool` |
| Auto-assign picks trainer with lowest active batch count | `autoAssignTrainer` controller | `ORDER BY active_batch_count ASC LIMIT 1` subquery |
| Removing trainer from pool blocked if on active batch | `removeTrainerFromPool` controller | Check `batches WHERE trainer_id = ? AND status = 'active'` |
| GST rate from `system_settings` | Invoice generation (existing) | Replace hardcoded `18` with `SELECT value FROM system_settings WHERE key = 'gst_rate'` |
| Sensitive settings require re-auth | `updateSetting` controller | `bcrypt.compare(current_password, user.password_hash)` gate |
| Only `super_admin` can access `/api/admin/*` | `routes/admin.js` | `authorize('super_admin')` on all routes |
| HR can read enrollments but not modify payment amounts | Already enforced via route-level RBAC | No PUT/PATCH on payment fields from HR routes |

---

## 7. Files Summary

### New Backend Files (7)
- `src/controllers/batchController.js`
- `src/controllers/hrController.js`
- `src/controllers/adminController.js`
- `src/routes/batches.js`
- `src/routes/hr.js`
- `src/routes/admin.js`
- `migration_epic8.sql`

### Modified Backend Files (2)
- `src/app.js` — mount 3 new route groups
- `src/routes/courses.js` — add 3 trainer pool endpoints

### New Frontend Files (11)
- `src/api/batchApi.js`
- `src/api/hrApi.js`
- `src/api/adminApi.js`
- `src/pages/hr/BatchListPage.jsx`
- `src/pages/hr/CreateBatchPage.jsx`
- `src/pages/hr/BatchDetailPage.jsx`
- `src/pages/hr/EnrollmentsPage.jsx`
- `src/pages/hr/ReportsPage.jsx`
- `src/pages/admin/SystemSettingsPage.jsx`
- `src/pages/admin/AnalyticsDashboardPage.jsx`
- `src/styles/hr.css`

### Modified Frontend Files (2)
- `src/App.jsx` — register 7 new routes
- `src/pages/StaffDashboardPage.jsx` — add nav links for HR/Admin sections

### New Test Files (7)
- `src/__tests__/batch.create.test.js`
- `src/__tests__/batch.trainer.test.js`
- `src/__tests__/trainer.pool.test.js`
- `src/__tests__/hr.enrollments.test.js`
- `src/__tests__/hr.reports.test.js`
- `src/__tests__/admin.settings.test.js`
- `src/__tests__/admin.analytics.test.js`

**Total: 25 new files, 4 modified files**

---

## 8. Merge Strategy

- Work entirely on `EPIC_8` branch.
- Commit per story (7 commits minimum).
- Run `npm test` in `lms_backend` before each commit.
- Resolve the existing merge conflicts in `app.js`, `authenticate.js`, and `App.jsx` (the `<<<<<<< HEAD` markers) as part of the first commit on this branch before adding new code.
- Raise a PR to `main` once all 7 stories are complete and all tests pass.
