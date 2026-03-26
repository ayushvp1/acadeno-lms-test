# Visual Verification Guide — EPIC-07 & EPIC-09

Follow these steps to visually verify today's implementation across different user roles.

## 🔑 Test Credentials
Use these accounts to explore the new features. The password for all accounts is: `Password123!`

- **Super Admin**: `admin@example.com`
- **HR Manager**: `hr@example.com`
- **Trainer**: `trainer@example.com`
- **Student**: `student@example.com`

---

## 🛡️ Step 1: Audit Log (Super Admin / HR)
Verify the immutable system ledger and administrative oversight.

1. **Login** as `admin@example.com`.
2. **Navigate** to `Settings` (or use direct path: `/admin/audit-log`).
3. **Verify Dashboard**:
   - Check if the **"System Audit Trail"** header and stats card are visible.
   - Use the **Date Filters** and click "Search Records" — verify that records from the seeding script appear.
   - Click the **Metadata Icon** (Clipboard) on a record to view the JSON details.
4. **Security Check**: Verify that there is no "Delete" button. As per the immutable requirement, these records cannot be removed.

---

## 🔔 Step 2: In-App Notifications (Student / All Roles)
Verify the real-time alert system.

1. **Login** as `student@example.com`.
2. **Interact with the Bell**:
   - Locate the **Notification Bell** on the top navigation bar.
   - Click the bell to open the dropdown — you should see a "Notification History" list.
   - Verify that clicking a notification takes you to the relevant section (if a deep link exists).

---

## 📊 Step 3: Trainer Dashboard & Tasks (Trainer)
Verify the cohort monitoring and submission management.

1. **Login** as `trainer@example.com`.
2. **Navigate** to `Trainer Dashboard`.
3. **Verify Cockpit**:
   - Check for **Batch Statistics** (Submission rates and progress).
   - Navigate to the **Task Manager** — verify the layout for grading and reopening submissions.
   - Test the **Announcement System**: Post a mock broadcast and verify it appears on the student's board.

---

## 📧 Step 4: Transactional Emails (Internal Logic)
Verify the automated communication flow.

1. **Trigger Check**: When the system (or trainer) performs an action like enrolling a student or grading a task, check the **Backend Logs** in the terminal.
2. **Look for**:
   - `[EMAIL] Sent invoice email to...`
   - `[EMAIL] Sent task evaluation email to...`
   - `[LEAD FOLLOW-UP JOB] Sent reminders...` (Occurs during the nightly cron execution).

---

> [!TIP]
> To trigger a specific notification manually for visual testing, you can use the `src/tests/testBatchReminder.js` or `src/tests/testAuditLog.js` scripts while the frontend is open.
