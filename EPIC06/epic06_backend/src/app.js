// ==========================================================================
// ACADENO LMS — Main Express Application
// ==========================================================================

require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const morgan       = require('morgan');
const path         = require('path');

const { pool } = require('./db/index');
const redis    = require('./utils/redis');

// ---------------------------------------------------------------------------
// Route Handlers
// ---------------------------------------------------------------------------
const authRoutes         = require('./routes/auth');
const leadRoutes         = require('./routes/leads');
const registrationRoutes = require('./routes/registration');
const studentRoutes      = require('./routes/student');
const coursesRoutes      = require('./routes/courses');      // EPIC-03 + EPIC-05
const contentRoutes      = require('./routes/content');      // EPIC-05 content-item ops
const taskRoutes         = require('./routes/tasks');        // EPIC-05 task lifecycle
const analyticsRoutes    = require('./routes/analytics');    // EPIC-05 analytics
const pincodeRoutes      = require('./routes/pincode');
const discussionsRoutes  = require('./routes/discussions');  // EPIC-06 US-STU-09
const adminRoutes        = require('./routes/admin');        // EPIC-08 Admin
const hrRoutes           = require('./routes/hr');           // EPIC-08 HR
const batchRoutes        = require('./routes/batches');      // EPIC-08 Batches
const announcementRoutes = require('./routes/announcements'); // US-TR-03

const app = express();

// ---------------------------------------------------------------------------
// 1. MIDDLEWARE
// ---------------------------------------------------------------------------
app.use(helmet());
app.use(cors({
  origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

// Static file serving for local-disk upload stub (EPIC-05 s3.js stub)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/certificates', express.static(path.join(__dirname, '..', 'certificates')));

// ---------------------------------------------------------------------------
// 2. ROUTES
// ---------------------------------------------------------------------------

// Authentication Module (EPIC-01)
app.use('/api/auth', authRoutes);

// Lead Management Module (EPIC-02)
app.use('/api/leads', leadRoutes);

// Student Registration Module (EPIC-03)
app.use('/api/registration', registrationRoutes);

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

// Discussion Forum (EPIC-06 US-STU-09)
app.use('/api/discussions', discussionsRoutes);

// Admin & HR Modules (EPIC-08)
app.use('/api/admin',   adminRoutes);
app.use('/api/hr',      hrRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/announcements', announcementRoutes);

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
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      status:  'error',
      message: err.message,
    });
  }
});

// ---------------------------------------------------------------------------
// 4. ERROR HANDLING
// ---------------------------------------------------------------------------

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
