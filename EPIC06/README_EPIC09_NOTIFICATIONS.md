# EPIC-09: In-App Notifications & Automated Alerts

Robust notification infrastructure providing real-time transparency and automated engagement across all platform roles.

## 🚀 Overview
The Acadeno LMS Notifications System ensures critical updates—from task assignments to payment confirmations—are delivered instantly via in-app alerts and transactional emails.

## 🛠️ Key Workflows

### 1. In-App Notification Bell Alerts
- **Real-time Delivery**: Instant Role-based alerts for task assignments, payment breakthroughs, and batch updates.
- **Unread Tracking**: Smart dropdown display with "Mark as Read" functionality.
- **Role-specific Logic**: Custom icons and navigation paths based on the actor's role.

### 2. Transactional Email System
- **Event-triggered Emails**: Automatic delivery of invoices upon payment and batch details upon enrollment.
- **Task Evaluation**: Direct email feedback to students once tasks are graded by trainers.
- **Resilient Delivery**: Integrated retry logic (3 attempts) with automated ops alerting on final failure.

### 3. Automated System Alerts (Cron-based)
- **Low Progress Detection**: Nightly scans to identify "at-risk" students (at < 40% completion).
- **BDA Follow-Up Reminders**: Automated reminders for lead interactions with 3-day escalation logic.
- **Batch Start Alerts**: 48-hour pre-start reminders for both students and trainers.

### 4. Audit Trail & Compliance
- **Immutable Ledger**: High-fidelity logging of all significant platform actions.
- **Security**: Strict 403 Forbidden enforcement on any deletion attempts.
- **Role-based Access**: Exclusively viewable by Super Admin and HR staff.

---

## 🏗️ Technical Architecture

### Core Services
- `notificationHelper.js`: Central engine for in-app alert generation.
- `emailService.js`: Unified template management and delivery orchestration.
- `auditService.js`: Security ledger for system-wide transparency.

### Scheduled Jobs (node-cron)
- `progressAlertJob.js`: Nightly student-success monitoring.
- `leadFollowUpJob.js`: BDA engagement management.
- `batchStartJob.js`: Logistics coordination for upcoming cohorts.

## 🔍 Verification
Verified through end-to-end integration tests using `testBatchReminder.js`, `testAuditLog.js`, and manual validation of email SMTP deliverability.
