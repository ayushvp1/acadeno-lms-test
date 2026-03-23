# Implementation Plan: Converted Lead → LMS Onboarding Flow

## 📋 Objectives
- [x] Backend: Add "registration_completed" and "onboarded" to `lead_status`.
- [ ] Backend: Update `updateLeadStatus` to mark as Walk-in on "Converted" status.
- [ ] Backend: New endpoint `POST /api/leads/:id/send-invite` to separate email sending from conversion.
- [ ] Backend: Sync all events with Redis (Lead Converted, Invite Sent, Registration Submitted, Payment Success).
- [ ] Frontend: Update `LeadsListPage` to show "Send LMS Registration Link" button for converted leads.
- [ ] Frontend: Create `StudentDashboardPage` with student info and enrollment status.
- [ ] Frontend: Implement redirect to `/student/dashboard` after payment.
- [ ] Frontend: Add auth guard for `/student/dashboard`.

## 🛠️ Step-by-Step Execution

### 1. Database & Enum Updates
- Update `lead_status` enum in the database.
- Add `lead_type` or `is_walk_in` to the `leads` table.

### 2. Backend Logic
-   **Enums**: Update migrations `002_leads_schema.sql` and `003_registration_schema.sql` for consistency.
-   **Lead Controller**: 
    -   Update `updateLeadStatus` to handle "Converted" status and mark as Walk-in.
    -   Update `convertLead` to act as the "Send Invite" button handler.
    -   Add Redis sync in each step.
-   **Registration Controller**:
    -   Update `submitRegistration` and `handlePaymentSuccess` to ensure Redis sync is robust.
-   **Auth Middleware**: Ensure student role can access the new dashboard.

### 3. Frontend Changes
-   **API**:
    -   Add `sendInvite` function to a new or existing API utility.
-   **LeadsListPage**: 
    -   Add button in the row for `converted` leads.
    -   Handle button click state (loading, success).
-   **StudentDashboardPage**:
    -   Create the page at `/student/dashboard`.
    -   Fetch data from `/api/auth/me` or a new endpoint if needed (actually `/api/auth/me` has data).
-   **Routing**:
    -   Add `/student/dashboard` route in `App.jsx`.
    -   Redirect student after login and after payment.
