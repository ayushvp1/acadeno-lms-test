<<<<<<< HEAD
// ============================================================================
// ACADENO LMS — Main Express Application
// ============================================================================

=======
// ==========================================================================
// ACADENO LMS — Main Express Application
// ==========================================================================

require('dotenv').config();
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

const { pool } = require('./db/index');
const redis = require('./utils/redis');
<<<<<<< HEAD

// Import Route Handlers
const authRoutes         = require('./routes/auth');
const leadRoutes         = require('./routes/leads');
const registrationRoutes = require('./routes/registration');
const studentRoutes      = require('./routes/student');

const app = express();

// ---- 1. MIDDLEWARE ----
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
=======
const authRoutes         = require('./routes/auth');
const registrationRoutes = require('./routes/registration');
const coursesRoutes      = require('./routes/courses');
const pincodeRoutes      = require('./routes/pincode');

const app = express();

// ---- Middleware ----
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));

<<<<<<< HEAD
// ---- 2. ROUTES ----

// Authentication Module (EPIC-01)
app.use('/api/auth', authRoutes);

// Lead Management Module (EPIC-02)
app.use('/api/leads', leadRoutes);

// Student Registration Module (EPIC-03)
app.use('/api/registration', registrationRoutes);

// Student Dashboard & Profile (New Onboarding Flow)
app.use('/api/student', studentRoutes);

// ---- 3. SYSTEM HEALTH ----
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    const redisPing = await redis.ping();
    res.json({
      status: 'ok',
      db: 'connected',
      redis: redisPing === 'PONG' ? 'connected' : 'error',
      timestamp: new Date().toISOString()
=======
// ---- Static file serving for uploads ----
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ---- Routes ----
// Mount auth routes at /api/auth
app.use('/api/auth', authRoutes);

// EPIC-03: Registration routes
app.use('/api/registration', registrationRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/pincode', pincodeRoutes);

// ---- Health Check ----
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    await redis.ping();
    res.json({
      status: 'ok',
      db: 'connected',
      redis: 'connected',
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
});

<<<<<<< HEAD
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
=======
// ---- Global Error Handler ----
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({
    error: 'Internal server error',
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
  });
});

module.exports = app;
