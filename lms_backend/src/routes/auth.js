// ==========================================================================
// ACADENO LMS — Auth Routes
// ==========================================================================
// Mounts all /auth/* endpoints.
// ==========================================================================

const express = require('express');
const router  = express.Router();

const { login, refresh, logout, forgotPassword, resetPassword, verifyMfa, getMe } = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');

// POST /auth/login            — Authenticate a user          (US-AUTH-01 / US-AUTH-02)
router.post('/login', login);

// POST /auth/refresh          — Rotate refresh token          (US-AUTH-03)
router.post('/refresh', refresh);

// POST /auth/logout           — Revoke session & clear cookie
router.post('/logout', logout);

// POST /auth/forgot-password  — Request password reset OTP    (US-AUTH-04)
router.post('/forgot-password', forgotPassword);

// POST /auth/reset-password   — Reset password with OTP       (US-AUTH-04)
router.post('/reset-password', resetPassword);

// POST /auth/verify-mfa       — Verify MFA OTP on new device  (US-AUTH-06)
router.post('/verify-mfa', verifyMfa);

// GET /auth/me                — Get current user profile      (US-AUTH-05)
router.get('/me', authenticate, getMe);

module.exports = router;
