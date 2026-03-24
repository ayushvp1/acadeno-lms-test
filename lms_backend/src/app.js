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

// ---- Import Route Handlers ----

// EPIC-01: Auth
const authRoutes         = require('./routes/auth');

// EPIC-02: Lead Management
const leadRoutes         = require('./routes/leads');

// EPIC-03: Student Registration & Courses
const registrationRoutes = require('./routes/registration');
const coursesRoutes      = require('./routes/courses');
const pincodeRoutes      = require('./routes/pincode');
const studentRoutes      = require('./routes/student');

// EPIC-08: HR & Admin Management
const batchRoutes = require('./routes/batches');
const hrRoutes    = require('./routes/hr');
const adminRoutes = require('./routes/admin');

const app = express();

// ---- 1. MIDDLEWARE ----
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ---- 2. ROUTES ----

// Authentication Module (EPIC-01)
app.use('/api/auth', authRoutes);

// Lead Management Module (EPIC-02)
app.use('/api/leads', leadRoutes);

// Student Registration Module (EPIC-03)
app.use('/api/registration', registrationRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/pincode', pincodeRoutes);

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
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      status:  'error',
      message: err.message,
    });
  }
});

// ---- 4. ERROR HANDLING ----

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
