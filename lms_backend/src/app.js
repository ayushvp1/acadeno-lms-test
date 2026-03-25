// ==========================================================================
// ACADENO LMS — Main Express Application
// ==========================================================================

require('dotenv').config();
<<<<<<< HEAD
=======

>>>>>>> origin/main
const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const morgan       = require('morgan');
const path         = require('path');

const { pool } = require('./db/index');
const redis    = require('./utils/redis');

<<<<<<< HEAD
// ---- Import Route Handlers ----

// EPIC-01: Auth
=======
// ---------------------------------------------------------------------------
// Route Handlers
// ---------------------------------------------------------------------------
>>>>>>> origin/main
const authRoutes         = require('./routes/auth');

// EPIC-02: Lead Management
const leadRoutes         = require('./routes/leads');

// EPIC-03: Student Registration & Courses
const registrationRoutes = require('./routes/registration');
const coursesRoutes      = require('./routes/courses');
const pincodeRoutes      = require('./routes/pincode');
const studentRoutes      = require('./routes/student');
<<<<<<< HEAD

// EPIC-08: HR & Admin Management
const batchRoutes = require('./routes/batches');
const hrRoutes    = require('./routes/hr');
const adminRoutes = require('./routes/admin');

const app = express();

// ---- 1. MIDDLEWARE ----
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
=======
const coursesRoutes      = require('./routes/courses');      // EPIC-03 + EPIC-05
const contentRoutes      = require('./routes/content');      // EPIC-05 content-item ops
const taskRoutes         = require('./routes/tasks');        // EPIC-05 task lifecycle
const analyticsRoutes    = require('./routes/analytics');    // EPIC-05 analytics
const pincodeRoutes      = require('./routes/pincode');

const app = express();

// ---------------------------------------------------------------------------
// 1. MIDDLEWARE
// ---------------------------------------------------------------------------
app.use(helmet());
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
>>>>>>> origin/main
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

<<<<<<< HEAD
// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ---- 2. ROUTES ----
=======
// Static file serving for local-disk upload stub (EPIC-05 s3.js stub)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ---------------------------------------------------------------------------
// 2. ROUTES
// ---------------------------------------------------------------------------
>>>>>>> origin/main

// Authentication Module (EPIC-01)
app.use('/api/auth', authRoutes);

// Lead Management Module (EPIC-02)
app.use('/api/leads', leadRoutes);

// Student Registration Module (EPIC-03)
app.use('/api/registration', registrationRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/pincode', pincodeRoutes);

<<<<<<< HEAD
// Student Dashboard & Profile
app.use('/api/student', studentRoutes);

// HR & Admin Management (EPIC-08)
app.use('/api/batches', batchRoutes);
app.use('/api/hr',      hrRoutes);
app.use('/api/admin',   adminRoutes);

// ---- 3. SYSTEM HEALTH ----
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    const redisPing = await redis.ping();
    res.json({
      status: 'ok',
      db:     'connected',
      redis:  redisPing === 'PONG' ? 'connected' : 'error',
=======
// Student Dashboard & Profile (EPIC-03 / EPIC-04)
app.use('/api/student', studentRoutes);

// Course & Content Management (EPIC-03 backward-compat + EPIC-05)
app.use('/api/courses', coursesRoutes);

// Content-Item Operations (EPIC-05) — URL fetch, transcode status, publish
app.use('/api/content', contentRoutes);

// Task Lifecycle (EPIC-05)
app.use('/api/tasks', taskRoutes);

// Analytics & Stats (EPIC-05)
app.use('/api/analytics', analyticsRoutes);

// Pincode Lookup Utility
app.use('/api/pincode', pincodeRoutes);

// ---------------------------------------------------------------------------
// 3. SYSTEM HEALTH
// ---------------------------------------------------------------------------
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    const strRedisPing = await redis.ping();
    res.json({
      status:    'ok',
      db:        'connected',
      redis:     strRedisPing === 'PONG' ? 'connected' : 'error',
>>>>>>> origin/main
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      status:  'error',
      message: err.message,
    });
  }
});

<<<<<<< HEAD
// ---- 4. ERROR HANDLING ----
=======
// ---------------------------------------------------------------------------
// 4. ERROR HANDLING
// ---------------------------------------------------------------------------
>>>>>>> origin/main

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

module.exports = app;
