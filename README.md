# 🎓 ACADENO LMS

![Node.js](https://img.shields.io/badge/Node.js-18.x-green?logo=nodedotjs)
![React](https://img.shields.io/badge/React-18.x-blue?logo=react)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-336791?logo=postgresql)
![Redis](https://img.shields.io/badge/Redis-5.x-dc382d?logo=redis)
![Jest](https://img.shields.io/badge/Tests-85/85_Passing-brightgreen?logo=jest)

> An enterprise-grade, highly secure Learning Management System (LMS) built with a modern decoupled architecture. Now supporting the full lifecycle from Lead Acquisition to Student Enrollment.

---

## 📑 Table of Contents
1. [Project Overview](#-project-overview)
2. [Tech Stack](#-tech-stack)
3. [Local Setup Guide](#-local-setup-guide)
4. [API Endpoints](#-api-endpoints)
5. [Role Permissions](#-role-permissions)
6. [Database Schema](#-database-schema)
7. [Testing](#-testing)
8. [Architecture Decisions (ADRs)](#-architecture-decisions-adrs)
9. [Known Issues & Troubleshooting](#-known-issues--troubleshooting)
10. [Contributing Guide](#-contributing-guide)
11. [Module Roadmap](#-module-roadmap)

---

## 🎯 Project Overview
**ACADENO LMS** is a full-stack educational platform designed to seamlessly connect Students, Trainers, HR, and Business Development (BDA) teams in one environment.

Currently, **EPIC-01, EPIC-02, and EPIC-03** have been completed natively without external auth providers to eliminate vendor lock-in and optimize for strict enterprise security. The platform handles:
* **Secure Authentication**: MFA, Token Rotation, and RLS.
* **Lead Lifecycle**: BDA-driven lead management, follow-ups, and automated conversion.
* **Student Onboarding**: A multi-step registration wizard, secure document handling, and payment processing.
* **Course Activation**: Automated enrollment and credential delivery upon payment confirmation.

---

## 🛠 Tech Stack
### Backend
* **Environment:** Node.js + Express
* **Database:** PostgreSQL 18 (Raw SQL with `pg` node-postgres)
* **Caching/State:** Redis (OTP, Rate Limiting & Registration Invites via `ioredis`)
* **Security:** JWT (RS256 Asymmetric), bcrypt, Helmet

### Frontend
* **Environment:** React 18 + Vite
* **Routing:** React Router v6
* **State Management:** Context API
* **Styling:** Custom Vanilla CSS Modules

---

## 🚀 Local Setup Guide

### Prerequisites
* **Node.js** v18+
* **PostgreSQL** v18+ running locally (default 5432)
* **Redis** running locally (default 6379)

### 1. Clone & Install
```bash
git clone https://github.com/your-org/acadeno_lms.git
cd acadeno_lms

# Install Backend
cd lms_backend
npm install

# Install Frontend
cd ../lms_frontend
npm install
```

### 2. Environment Setup
Create a `.env` in `lms_backend/` and `lms_frontend/`. Fill them based on their respective `.env.example` templates.

**`lms_backend/.env`**
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/acadeno_lms
JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
JWT_ACCESS_EXPIRY=900
JWT_REFRESH_EXPIRY=604800
EMAIL_SERVICE=gmail
EMAIL_USER=your_email@gmail.com
EMAIL_APP_PASSWORD=your_app_password
EMAIL_FROM="Acadeno LMS <your_email@gmail.com>"
OTP_DELIVERY_METHOD=email
REDIS_URL=redis://localhost:6379
FRONTEND_URL=http://localhost:5173
PORT=3001
NODE_ENV=development
```

**`lms_frontend/.env`**
```env
VITE_API_URL=http://localhost:3001
```

### 3. Database Migration & Seeding
From the `lms_backend` directory:
1. Ensure the PostgreSQL database `acadeno_lms` is created.
2. Execute the migrations:
   * `psql -d acadeno_lms -f src/db/migrations/001_auth_schema.sql`
   * `psql -d acadeno_lms -f src/db/migrations/002_leads_schema.sql`
   * `psql -d acadeno_lms -f src/db/migrations/003_registration_schema.sql`
   * `psql -d acadeno_lms -f src/db/migrations/004_registration_schema.sql`
   * `psql -d acadeno_lms -f src/db/migrations/005_batch_management_rls.sql`
3. Execute `node seed.js` to inject the initial administrative state (super_admin).

### 4. Running the Development Servers
Open two terminal instances.
```bash
# Terminal 1 (Backend)
cd lms_backend
npm run dev

# Terminal 2 (Frontend)
cd lms_frontend
npm run dev
```
Navigate to `http://localhost:5173`.

---

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description | Auth Required? |
|--------|----------|-------------|----------------|
| `POST` | `/api/auth/login` | Credentials discovery & MFA trigger. | No |
| `POST` | `/api/auth/verify-mfa` | MFA verification to complete login. | No |
| `POST` | `/api/auth/refresh` | Silently rotates refresh token and issues new access token. | Cookie |
| `POST` | `/api/auth/logout` | Revokes current session and clears cookies. | Yes |
| `GET` | `/api/auth/me` | Fetch active profile with RBAC context. | Yes |
| `POST` | `/api/auth/forgot-password` | Emails a secure OTP for recovery. Rate Limited. | No |
| `POST` | `/api/auth/reset-password` | Consumes OTP and updates password. | No |

### Lead Management (Epic 2)
| Method | Endpoint | Description | Auth Required? |
|--------|----------|-------------|----------------|
| `GET` | `/api/leads` | List leads with role-based filtering (RLS). | Yes |
| `POST` | `/api/leads/:id/convert` | Lock lead and send registration invite. | Yes |

### Student Registration (Epic 3) & Batch Management
| Method | Endpoint | Description | Auth Required? |
|--------|----------|-------------|----------------|
| `POST` | `/api/registration/draft` | Initialize registration draft from invite. | No |
| `PUT` | `/api/registration/draft/:id/personal` | Update pre-enrolled personal details. | No |
| `POST` | `/api/registration/draft/:id/submit` | Finalize registration & trigger payment. | No |
| `PATCH` | `/api/registration/batches/:id` | Update batch capacity/schedule (Admin/Trainer). | Yes |
| `POST` | `/api/registration/payment-webhook` | Confirm payment & activate student account. | No |

---

## 🛡 Role Permissions (RBAC)
Role hierarchy strictly governs routes down to the PostgreSQL layer via RLS.

| Role | Access Level / Prefix | Description |
|------|-----------------------|-------------|
| **`super_admin`** | (Level 50) `/admin` | Full access. Overrides Row Level Security. |
| **`hr`** | (Level 40) `/hr` | Staff management and employee metrics. |
| **`trainer`** | (Level 35) `/trainer` | Manage assigned batch capacities & materials. |
| **`bda`** | (Level 30) `/bda` | Lead lifecycle management and conversion. |
| **`student`** | (Level 10) `/student` | Dashboard, invoices, and course progress. |
| **`lead_registrant`** | (Temp) `/register` | Scoped access to the registration wizard. |

---

## 🔑 Test Credentials (Development)
Use these accounts to explore role-specific dashboards. All staff use the same password for convenience.

**Standard Password**: `Admin123!`

| Role | Email |
|------|-------|
| **Super Admin** | `admin@acadeno.com` |
| **HR** | `hr@acadeno.com` |
| **BDA** | `bda@acadeno.com` |
| **Trainer** | `trainer@acadeno.com` |

---

## 🗄 Database Schema
Extended schema supporting the full enrollment pipeline.

### Core Tables
* **`users`**: RBAC, credentials, MFA status, lockouts.
* **`leads`**: CRM data, status tracking, conversion locks.
* **`students`**: Personal & profile data linked to `users`.
* **`enrollments`**: Course participation, fee status, activity audits.
* **`courses` & `batches`**: Catalog management and intake capacity (RLS enforced).
* **`registration_drafts`**: Volatile state storage for the enrollment wizard.
* **`refresh_tokens`**: Token rotation and session management.
* **`trusted_devices`**: Device fingerprinting for MFA trust.

---

## 🧪 Testing
The backend utilizes **Jest** for assertions and **Supertest** to emulate HTTP workflows seamlessly.
```bash
cd lms_backend
npm test
```
**Coverage:** 85/85 Passing. Includes Auth (42), Leads (12), Courses (15), Registration Flow (6), and Batch Management (10).

---

## 🧠 Architecture Decisions (ADRs)

* **Why RS256 over HS256?** Asymmetric keys allow microservices to verify tokens without sharing the private signing key.
* **Why RLS?** Row-Level Security ensures data-level isolation (e.g., Trainers only see/edit their assigned batches).
* **Why Registration Drafts?** Decoupling draft state from core users ensures that only completed, verified, and PAID registrations enter the primary ecosystem.
* **Why Redis for OTP?** High throughput, automatic TTL garbage collection, and preventing noisy writes in PostgreSQL.
* **Why `httpOnly` Cookies?** Storing refresh tokens in `httpOnly` cookies prevents JavaScript access (XSS) and facilitates automatic token rotation.

---

## ⚠️ Known Issues & Troubleshooting

* **Internal Server Error (500) at Login `permission denied for table users`:**
  * **Cause:** DB user lacks permissions to accessible newly migrated tables.
  * **Fix:** Execute `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "YOUR_DB_USER"` inside `psql`.
* **Axios Interceptor Infinite Reload Loop:**
  * **Cause:** Initial loads fetching from `/api/auth/me` causing dual 401 rejections.
  * **Fix:** Bypassed using a standard decoupled `axios.post` for initial auth check (Fixed in Context layer in production).

---

## 🤝 Contributing Guide
1. Create a descriptive feature branch: `git checkout -b feature/US-AUTH-07-google-sso`
2. Follow strict ESLint conventions.
3. Write associated Jest tests mapping your assertions.
4. Place new schemas in `src/db/migrations/` sequentially.

---

## 🗺 Module Roadmap
* [x] **EPIC-01: Authentication & Security**
* [x] **EPIC-02: Lead Management & CRM**
* [x] **EPIC-03: Student Registration & Enrollment**
* [x] **BATCH MANAGEMENT: Administrative Controls**
* [ ] **EPIC-04: Course Content & Evaluation**
* [ ] **EPIC-05: AI Tutoring & Assistant Integration**
