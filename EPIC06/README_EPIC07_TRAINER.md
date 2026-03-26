# EPIC-07: Trainer Dashboard & Task Management

Highly functional module designed for trainers to manage batch performance, submodules, and student engagements efficiently.

## 🚀 Overview
The Trainer Dashboard serves as the central hub for academy staff to monitor their assigned cohorts, track learning progress, and manage task lifecycles with granular control.

## 🛠️ Key Workflows

### 1. Batch & Performance Monitoring
- **Real-time Overview**: Consolidated view of all active/completed batches assigned to the trainer.
- **Submission Rates**: Automated calculation of task completion percentages across the cohort.
- **Performance Reporting**: On-demand generation of batch performance summaries for HR review.

### 2. Advanced Task Lifecycle Management
- **Task Quizzes**: Integrated management of multiple-choice questions for course assessments.
- **Submission Control**: Ability to reopen specific task submissions for individual students.
- **Global Evaluation**: Unified interface for grading student submissions with rich feedback.

### 3. Communication & Engagement
- **Batch Announcements**: Secure broadcasting of updates, meeting links, and critical alerts directly to students.
- **In-App Alerts**: Automated notifications for trainers upon new batch assignments.

---

## 🏗️ Technical Architecture

### Backend Components
- `announcements.js`: Logic for role-specific broadcast messaging.
- `taskController.js`: Critical refactoring to support multi-faceted task operations.
- `db/migrations/013`: Schema enhancements for individual student learning timelines.

### Frontend Components
- `TaskManagerPage.jsx`: The primary cockpit for grading and quiz management.
- `BatchDashboardPage.jsx`: High-level analytics and cohort tracking.

## 🔍 Verification
Verified through end-to-end integration tests including role-based access control (RBAC) and data consistency checks across the Postgres schema.
