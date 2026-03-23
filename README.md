# 🎓 ACADENO LMS

![Node.js](https://img.shields.io/badge/Node.js-18.x-green?logo=nodedotjs)
![React](https://img.shields.io/badge/React-18.x-blue?logo=react)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-336791?logo=postgresql)
![Redis](https://img.shields.io/badge/Redis-5.x-dc382d?logo=redis)
![Jest](https://img.shields.io/badge/Tests-42/42_Passing-brightgreen?logo=jest)

> An enterprise-grade, highly secure Learning Management System (LMS) built with a modern decoupled architecture. EPIC-01 delivers a robust authentication and Role-Based Access Control (RBAC) ecosystem ready for scale.

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

Currently, **EPIC-01 (Authentication)** has been completed natively without external auth providers (Auth0/Firebase) to eliminate vendor lock-in and optimize for strict enterprise security. It fully supports features like Multi-Factor Authentication (MFA), Lockouts, automatic Token Rotation, and Row-Level Database Security.

---

## 🛠 Tech Stack
### Backend
* **Environment:** Node.js + Express
* **Database:** PostgreSQL 18 (Raw SQL with `pg` node-postgres)
* **Caching/State:** Redis (OTP & Rate Limiting via `ioredis`)
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
2. Execute the migration file: `psql -d acadeno_lms -f src/db/migrations/001_auth_schema.sql`
3. Execute `node seed.js` (if provided) to bypass the RLS policies and inject the root test `super_admin` (`admin@acadeno.com` / `Admin123!`).

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

| Method | Endpoint | Description | Auth Required? |
|--------|----------|-------------|----------------|
| `POST` | `/api/auth/login` | Validates credentials, issues JWT/httpOnly Cookie or triggers MFA. | No |
| `POST` | `/api/auth/refresh` | Silently rotates the refresh token cookie and issues a new access token. | No (Uses Cookie) |
| `POST` | `/api/auth/logout` | Revokes the current session token in DB and clears the browser cookie. | Yes |
| `GET` | `/api/auth/me` | Fetches the active user profile, enforcing silent RBAC loads in the UI. | Yes |
| `POST` | `/api/auth/forgot-password` | Emails a secure OTP (stored in Redis) for recovery. Rate Limited. | No |
| `POST` | `/api/auth/reset-password` | Consumes OTP and updates the bcrypt hash to reset password. | No |
| `POST` | `/api/auth/verify-mfa` | Verifies the OTP triggered by login to conditionally trust dynamic devices. | No |
| `GET` | `/health` | Server heartbeat monitoring. | No |

---

## 🛡 Role Permissions (RBAC)
Role hierarchy strictly governs routes down to the PostgreSQL layer.

| Role | Access Level / Allowed Frontend Prefixes |
|------|------------------------------------------|
| **`super_admin`** | (Level 50) Full access. `/admin`, `/courses`, `/users`. Overrides Row Level Security (RLS). |
| **`hr`** | (Level 40) Access to staff metrics, employee onboarding. |
| **`bda`** | (Level 30) Access to lead management, conversion stats. |
| **`trainer`** | (Level 20) Manage assigned course materials, tasks, evaluations. |
| **`student`** | (Level 10) Minimum access. `/courses`, `/progress`, `/tasks`, `/invoices`, `/dashboard`. |

---

## 🗄 Database Schema
EPIC-01 implements three primary tables mapping authentication lifecycles.

### `users`
* `id` (UUID, PK)
* `email` (TEXT, UNIQUE)
* `password_hash` (TEXT)
* `role` (ENUM: user_role)
* `locked_until` (TIMESTAMPTZ)
* `mfa_enabled`, `is_active`, `failed_login_count`

### `refresh_tokens`
* `id` (UUID, PK)
* `user_id` (UUID, FK -> users)
* `token_hash` (TEXT, UNIQUE)
* `device_fingerprint` (TEXT)
* `expires_at`, `revoked_at`

### `trusted_devices`
* `id` (UUID, PK)
* `user_id` (UUID, FK -> users)
* `device_fingerprint` (TEXT)
* `trusted_at`, `last_seen`

---

## 🧪 Testing
The backend utilizes **Jest** for assertions and **Supertest** to emulate HTTP workflows seamlessly without port conflicts. 
```bash
cd lms_backend
npm test
```
**Coverage includes:** Lockouts, Invalid credentials, OTP expiry, Rate limit throttling, Token Rotation hijack attempts, and successful JWT derivations. (Current passing rate: `42/42`).

---

## 🧠 Architecture Decisions (ADRs)

* **Why RS256 over HS256?**
  RS256 uses an asymmetric key pair. Our backend signs the JWT natively with a rigorously held private key, allowing any future microservices to safely verify the context by simply caching the public key without ever handling secrets.
* **Why Redis for OTP?**
  High throughput, automatic TTL garbage collection, and preventing unnecessary noisy writes sequentially executing in the PostgreSQL master.
* **Why `httpOnly` Cookies for Refresh Tokens?**
  Storing persistent tokens in `localStorage` leaves platforms severely prone to XSS attacks natively opening vectors to browser memory. `httpOnly` prevents JavaScript access entirely while facilitating smooth, invisible token rotations automatically attached by the browser headers via Axios interceptors.
* **Why RLS in PostgreSQL?**
  Row-Level Security enforces zero-trust architectures at the data level. Rather than trusting Application Logic perfectly filtering queries, the Database itself physically limits queries based on `app.current_user_role` mapping.

---

## ⚠️ Known Issues & Troubleshooting

* **Internal Server Error (500) at Login `permission denied for table users`:**
  * **Cause:** Your PostgreSQL `DATABASE_URL` user mapping lacks the native permissions to access the newly migrated tables if generated by a different `postgres` super admin. 
  * **Fix:** Execute `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "YOUR_DB_USER"` inside `psql` or PGAdmin.
* **Axios Interceptor Infinite Reload Loop:**
  * **Cause:** Initial loads fetching from `/api/auth/me` causing dual 401 rejections natively rejecting UI state before contexts build. 
  * **Fix:** Bypassed using a standard decoupled `axios.post` explicitly grabbing tokens from the native backend outside of the interceptor pipeline (Fixed in Context layer natively in production).

---

## 🤝 Contributing Guide
1. Create a descriptive feature branch: `git checkout -b feature/US-AUTH-07-google-sso`
2. Follow strict ESLint and standard conventions natively attached.
3. Write associated Jest tests mapping your assertions. Un-tested structural functions will automatically fail PR.
4. If migrating, always place new schemas cleanly into `src/db/migrations/` sequentially naming contexts.

---

## 🗺 Module Roadmap
* [x] **EPIC-01: Authentication (CURRENT)**
* [ ] **EPIC-02: Course Management**
* [ ] **EPIC-03: Live Student Tracking & Tasks**
* [ ] **EPIC-04: Billing & Invoices**
* [ ] **EPIC-05: AI Assistant Integration**
