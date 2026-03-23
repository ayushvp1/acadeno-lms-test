// ==========================================================================
// ACADENO LMS — Auth Controller
// ==========================================================================
// Handles authentication endpoints: login, refresh, logout,
// forgot-password, reset-password, verify-mfa, me.
// All SQL queries are parameterized. No string concatenation in SQL.
// ==========================================================================

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { pool } = require('../db/index');
const { generateTokens } = require('../utils/jwt');
const { sendLockoutEmail, sendOTPEmail } = require('../services/emailService');
const redis = require('../utils/redis');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES     = 30;
const BCRYPT_ROUNDS       = 12;

// OTP constants
const OTP_TTL_SECONDS       = 600;   // 10 minutes
const MFA_OTP_TTL_SECONDS   = 600;   // 10 minutes for MFA OTP
const RATE_LIMIT_MAX        = 3;     // max OTP requests
const RATE_LIMIT_WINDOW_SEC = 900;   // per 15-minute window

// Password complexity regex:
// - At least 8 characters
// - At least one uppercase letter
// - At least one digit
// - At least one special character
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-={}[\]|;':",./<>?`~]).{8,}$/;

// Refresh token cookie options
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path:     '/auth',
  maxAge:   (process.env.JWT_REFRESH_EXPIRY || 604800) * 1000,  // ms
};

// ---------------------------------------------------------------------------
// Helper: compute device fingerprint
// ---------------------------------------------------------------------------
// SHA-256 hash of (User-Agent + Accept-Language) headers.
// Produces a stable, privacy-respecting device identifier.
// ---------------------------------------------------------------------------
function computeDeviceFingerprint(req) {
  const ua   = req.headers['user-agent']      || '';
  const lang = req.headers['accept-language'] || '';
  return crypto
    .createHash('sha256')
    .update(ua + lang)
    .digest('hex');
}

// ---------------------------------------------------------------------------
// Helper: issue tokens and respond
// ---------------------------------------------------------------------------
// Shared by login (happy path) and verifyMfa (after OTP validated).
// Resets failed counters, generates JWT + refresh token, stores refresh hash,
// sets cookie, and returns the standard login response.
// ---------------------------------------------------------------------------
async function issueTokensAndRespond(req, res, client, user) {
  // Reset failed_login_count and locked_until
  await client.query(
    `UPDATE users
        SET failed_login_count = 0,
            locked_until       = NULL,
            updated_at         = NOW()
      WHERE id = $1`,
    [user.id]
  );

  // Generate access + refresh tokens
  const { accessToken, refreshToken } = generateTokens(user);

  // Hash the refresh token before storing (SHA-256)
  const tokenHash = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  const deviceFingerprint = computeDeviceFingerprint(req);

  // Calculate refresh token expiry
  const refreshExpirySec = parseInt(process.env.JWT_REFRESH_EXPIRY, 10) || 604800;
  const expiresAt = new Date(Date.now() + refreshExpirySec * 1000);

  // Store refresh token hash in refresh_tokens table
  await client.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, device_fingerprint, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [user.id, tokenHash, deviceFingerprint, expiresAt]
  );

  // Update last_seen on trusted device if it exists
  await client.query(
    `UPDATE trusted_devices
        SET last_seen = NOW()
      WHERE user_id = $1 AND device_fingerprint = $2`,
    [user.id, deviceFingerprint]
  );

  // Set refresh token as httpOnly cookie
  res.cookie('refreshToken', refreshToken, REFRESH_COOKIE_OPTIONS);

  // Return access token + user info
  return res.status(200).json({
    accessToken,
    user: {
      id:    user.id,
      email: user.email,
      role:  user.role,
    },
  });
}

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------
async function login(req, res) {
  const client = await pool.connect();
  // Elevate to super_admin context strictly for secure backend authentication queries to bypass RLS
  await client.query("SET app.current_user_role = 'super_admin'");


  try {
    const { email, password } = req.body;

    // ---- 1. Input validation ----
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
        code:  'VALIDATION_ERROR',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format',
        code:  'VALIDATION_ERROR',
      });
    }

    // ---- 2. Look up user by email ----
    const userResult = await client.query(
      `SELECT id, email, password_hash, role, is_active,
              failed_login_count, locked_until, mfa_enabled
         FROM users
        WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    // ---- 2b. Check if account is active ----
    if (!user.is_active) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // ---- 3. Check account lockout ----
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({
        error:        'Account locked',
        locked_until: user.locked_until,
      });
    }

    // ---- 4. Compare password ----
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      // Increment failed count
      const newFailedCount = (user.failed_login_count || 0) + 1;

      // ---- 6. Lockout after MAX_FAILED_ATTEMPTS ----
      if (newFailedCount >= MAX_FAILED_ATTEMPTS) {
        const lockResult = await client.query(
          `UPDATE users
              SET failed_login_count = $1,
                  locked_until       = NOW() + INTERVAL '${LOCKOUT_MINUTES} minutes',
                  updated_at         = NOW()
            WHERE id = $2
            RETURNING locked_until`,
          [newFailedCount, user.id]
        );

        const lockedUntil = lockResult.rows[0].locked_until;

        // Fire-and-forget: send lockout notification email
        sendLockoutEmail(user.email, lockedUntil).catch((err) => {
          console.error('Failed to send lockout email:', err.message);
        });

        return res.status(423).json({
          error:        'Account locked',
          locked_until: lockedUntil,
        });
      }

      // Not yet locked — just increment
      await client.query(
        `UPDATE users
            SET failed_login_count = $1,
                updated_at         = NOW()
          WHERE id = $2`,
        [newFailedCount, user.id]
      );

      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // ---- 5. Password correct ----

    // ---- MFA check on unrecognised devices (US-AUTH-06) ----
    const deviceFingerprint = computeDeviceFingerprint(req);

    if (user.mfa_enabled) {
      // Check if this device is already trusted
      const trustedResult = await client.query(
        `SELECT id FROM trusted_devices
          WHERE user_id = $1 AND device_fingerprint = $2`,
        [user.id, deviceFingerprint]
      );

      if (trustedResult.rows.length === 0) {
        // Device NOT trusted — trigger MFA
        // Reset failed counters now (password was correct)
        await client.query(
          `UPDATE users
              SET failed_login_count = 0,
                  locked_until       = NULL,
                  updated_at         = NOW()
            WHERE id = $1`,
          [user.id]
        );

        // Generate 6-digit OTP and store in Redis
        const mfaOtp = crypto.randomInt(100000, 999999).toString();
        const mfaKey = `otp:mfa:${user.id}`;
        await redis.set(mfaKey, mfaOtp, 'EX', MFA_OTP_TTL_SECONDS);

        // Send MFA OTP via email
        sendOTPEmail(user.email, mfaOtp, 'mfa').catch((err) => {
          console.error('Failed to send MFA OTP email:', err.message);
        });

        return res.status(200).json({
          mfa_required: true,
          message:      'OTP sent to registered email',
        });
      }

      // Device IS trusted — fall through to normal token issuance
    }

    // ---- Issue tokens (trusted device or MFA not enabled) ----
    return await issueTokensAndRespond(req, res, client, user);
  } catch (err) {
    // ---- 9. Unexpected errors — never leak internals ----
    console.error('LOGIN ERROR:', err.message);
    console.error('STACK:', err.stack);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// POST /auth/refresh  (US-AUTH-03)
// ---------------------------------------------------------------------------
// Token rotation with reuse detection.
//
// Flow:
//   1. Read refreshToken from httpOnly cookie
//   2. SHA-256 hash it and look up in refresh_tokens
//   3. If token was already revoked → REUSE DETECTED → revoke ALL user tokens
//   4. If valid → revoke old token, issue new pair, store new hash, set cookie
// ---------------------------------------------------------------------------
async function refresh(req, res) {
  const client = await pool.connect();
  // Elevate to super_admin context strictly for secure backend authentication queries to bypass RLS
  await client.query("SET app.current_user_role = 'super_admin'");


  try {
    // ---- 1. Read refresh token from cookie ----
    const rawToken = req.cookies?.refreshToken;

    if (!rawToken) {
      return res.status(401).json({
        error: 'No refresh token provided',
        code:  'REFRESH_INVALID',
      });
    }

    // ---- 2. Hash and look up ----
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const tokenResult = await client.query(
      `SELECT id, user_id, revoked_at, expires_at
         FROM refresh_tokens
        WHERE token_hash = $1`,
      [tokenHash]
    );

    // Token hash not found at all
    if (tokenResult.rows.length === 0) {
      res.clearCookie('refreshToken', { path: '/auth' });
      return res.status(401).json({
        error: 'Session expired',
        code:  'REFRESH_INVALID',
      });
    }

    const storedToken = tokenResult.rows[0];

    // ---- 5. REUSE DETECTION ----
    // If the token was already revoked, someone might have stolen the old token.
    // Revoke ALL refresh tokens for this user as a safety measure.
    if (storedToken.revoked_at !== null) {
      await client.query(
        `UPDATE refresh_tokens
            SET revoked_at = NOW()
          WHERE user_id = $1
            AND revoked_at IS NULL`,
        [storedToken.user_id]
      );

      res.clearCookie('refreshToken', { path: '/auth' });
      return res.status(401).json({
        error: 'Session expired',
        code:  'REFRESH_REUSE_DETECTED',
      });
    }

    // ---- 3. Check expiry ----
    if (new Date(storedToken.expires_at) <= new Date()) {
      // Mark as revoked since it's expired
      await client.query(
        `UPDATE refresh_tokens
            SET revoked_at = NOW()
          WHERE id = $1`,
        [storedToken.id]
      );

      res.clearCookie('refreshToken', { path: '/auth' });
      return res.status(401).json({
        error: 'Session expired',
        code:  'REFRESH_INVALID',
      });
    }

    // ---- 4. TOKEN ROTATION ----

    // 4a. Revoke the current token
    await client.query(
      `UPDATE refresh_tokens
          SET revoked_at = NOW()
        WHERE id = $1`,
      [storedToken.id]
    );

    // 4b. Fetch user for new token payload
    const userResult = await client.query(
      `SELECT id, email, role
         FROM users
        WHERE id = $1 AND is_active = TRUE`,
      [storedToken.user_id]
    );

    if (userResult.rows.length === 0) {
      res.clearCookie('refreshToken', { path: '/auth' });
      return res.status(401).json({
        error: 'Session expired',
        code:  'REFRESH_INVALID',
      });
    }

    const user = userResult.rows[0];

    // 4c. Generate new token pair
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    // 4d. Store new refresh token hash
    const newTokenHash = crypto
      .createHash('sha256')
      .update(newRefreshToken)
      .digest('hex');

    const deviceFingerprint = req.headers['user-agent'] || 'unknown';
    const refreshExpirySec = parseInt(process.env.JWT_REFRESH_EXPIRY, 10) || 604800;
    const expiresAt = new Date(Date.now() + refreshExpirySec * 1000);

    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, device_fingerprint, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [user.id, newTokenHash, deviceFingerprint, expiresAt]
    );

    // 4e. Set new cookie and return new access token
    res.cookie('refreshToken', newRefreshToken, REFRESH_COOKIE_OPTIONS);

    return res.status(200).json({
      accessToken,
      user: {
        id:    user.id,
        email: user.email,
        role:  user.role,
      },
    });
  } catch (err) {
    console.error('Refresh error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------
// Revokes the current refresh token and clears the cookie.
// ---------------------------------------------------------------------------
async function logout(req, res) {
  const client = await pool.connect();
  // Elevate to super_admin context strictly for secure backend authentication queries to bypass RLS
  await client.query("SET app.current_user_role = 'super_admin'");


  try {
    const rawToken = req.cookies?.refreshToken;

    if (rawToken) {
      const tokenHash = crypto
        .createHash('sha256')
        .update(rawToken)
        .digest('hex');

      // Revoke this specific refresh token
      await client.query(
        `UPDATE refresh_tokens
            SET revoked_at = NOW()
          WHERE token_hash = $1
            AND revoked_at IS NULL`,
        [tokenHash]
      );
    }

    // Always clear the cookie, even if no token was found
    res.clearCookie('refreshToken', { path: '/auth' });

    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// POST /auth/forgot-password  (US-AUTH-04)
// ---------------------------------------------------------------------------
// Generates a 6-digit OTP, stores it in Redis, and emails it to the user.
// Always returns 200 regardless of whether the email exists (anti-enumeration).
// Rate-limited to 3 requests per email per 15 minutes.
// ---------------------------------------------------------------------------
async function forgotPassword(req, res) {
  const client = await pool.connect();
  // Elevate to super_admin context strictly for secure backend authentication queries to bypass RLS
  await client.query("SET app.current_user_role = 'super_admin'");


  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Email is required',
        code:  'VALIDATION_ERROR',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ---- Rate limiting (checked before user lookup) ----
    const rateLimitKey = `otp:ratelimit:${normalizedEmail}`;
    const currentCount = await redis.get(rateLimitKey);

    if (currentCount && parseInt(currentCount, 10) >= RATE_LIMIT_MAX) {
      return res.status(429).json({
        error: 'Too many OTP requests. Please try again later.',
        code:  'RATE_LIMIT_EXCEEDED',
      });
    }

    // ---- Always return the same response (anti-enumeration) ----
    const successMessage = 'If this email exists, an OTP has been sent.';

    // Look up user
    const userResult = await client.query(
      `SELECT id, email FROM users WHERE email = $1 AND is_active = TRUE`,
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      // User doesn't exist, but don't reveal that
      return res.status(200).json({ message: successMessage });
    }

    const user = userResult.rows[0];

    // ---- Generate cryptographically secure 6-digit OTP ----
    const otp = crypto.randomInt(100000, 999999).toString();

    // Store in Redis: key = "otp:reset:{user_id}", TTL = 600s
    const otpKey = `otp:reset:${user.id}`;
    await redis.set(otpKey, otp, 'EX', OTP_TTL_SECONDS);

    // ---- Increment rate limit counter ----
    const newCount = await redis.incr(rateLimitKey);
    if (newCount === 1) {
      // First request in window — set the TTL
      await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_SEC);
    }

    // ---- Send OTP email (fire-and-forget) ----
    sendOTPEmail(user.email, otp, 'reset').catch((err) => {
      console.error('Failed to send OTP email:', err.message);
    });

    return res.status(200).json({ message: successMessage });
  } catch (err) {
    console.error('Forgot password error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// POST /auth/reset-password  (US-AUTH-04)
// ---------------------------------------------------------------------------
// Validates the OTP from Redis, hashes the new password, updates the user
// record, deletes the OTP key, and revokes ALL refresh tokens for safety.
// ---------------------------------------------------------------------------
async function resetPassword(req, res) {
  const client = await pool.connect();
  // Elevate to super_admin context strictly for secure backend authentication queries to bypass RLS
  await client.query("SET app.current_user_role = 'super_admin'");


  try {
    const { email, otp, newPassword } = req.body;

    // ---- Input validation ----
    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        error: 'Email, OTP, and new password are required',
        code:  'VALIDATION_ERROR',
      });
    }

    // ---- Password complexity check ----
    if (!PASSWORD_REGEX.test(newPassword)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters with at least one uppercase letter, one number, and one special character',
        code:  'WEAK_PASSWORD',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ---- Look up user ----
    const userResult = await client.query(
      `SELECT id FROM users WHERE email = $1 AND is_active = TRUE`,
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      // Don't reveal whether the user exists — generic error
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    const user = userResult.rows[0];

    // ---- Fetch OTP from Redis ----
    const otpKey = `otp:reset:${user.id}`;
    const storedOtp = await redis.get(otpKey);

    if (!storedOtp) {
      return res.status(400).json({
        error: 'OTP expired. Please request a new one.',
        code:  'OTP_EXPIRED',
      });
    }

    if (storedOtp !== otp.toString()) {
      return res.status(400).json({
        error: 'Invalid OTP',
        code:  'OTP_INVALID',
      });
    }

    // ---- OTP valid — update password ----
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await client.query(
      `UPDATE users
          SET password_hash = $1,
              failed_login_count = 0,
              locked_until = NULL,
              updated_at = NOW()
        WHERE id = $2`,
      [passwordHash, user.id]
    );

    // ---- Delete OTP key from Redis ----
    await redis.del(otpKey);

    // ---- Revoke ALL refresh tokens for this user ----
    await client.query(
      `UPDATE refresh_tokens
          SET revoked_at = NOW()
        WHERE user_id = $1
          AND revoked_at IS NULL`,
      [user.id]
    );

    return res.status(200).json({
      message: 'Password reset successfully. Please log in with your new password.',
    });
  } catch (err) {
    console.error('Reset password error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// POST /auth/verify-mfa  (US-AUTH-06)
// ---------------------------------------------------------------------------
// Validates the MFA OTP from Redis. On success, optionally trusts the device
// and issues tokens (same response as a normal login).
// ---------------------------------------------------------------------------
async function verifyMfa(req, res) {
  const client = await pool.connect();
  // Elevate to super_admin context strictly for secure backend authentication queries to bypass RLS
  await client.query("SET app.current_user_role = 'super_admin'");


  try {
    const { email, otp, trust_device } = req.body;

    // ---- Input validation ----
    if (!email || !otp) {
      return res.status(400).json({
        error: 'Email and OTP are required',
        code:  'VALIDATION_ERROR',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ---- Look up user ----
    const userResult = await client.query(
      `SELECT id, email, role
         FROM users
        WHERE email = $1 AND is_active = TRUE`,
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        error: 'Invalid OTP',
        code:  'OTP_INVALID',
      });
    }

    const user = userResult.rows[0];

    // ---- Fetch MFA OTP from Redis ----
    const mfaKey   = `otp:mfa:${user.id}`;
    const storedOtp = await redis.get(mfaKey);

    if (!storedOtp) {
      return res.status(400).json({
        error: 'OTP expired. Please log in again.',
        code:  'OTP_EXPIRED',
      });
    }

    if (storedOtp !== otp.toString()) {
      return res.status(400).json({
        error: 'Invalid OTP',
        code:  'OTP_INVALID',
      });
    }

    // ---- OTP valid — delete from Redis ----
    await redis.del(mfaKey);

    // ---- Optionally trust this device ----
    if (trust_device) {
      const deviceFingerprint = computeDeviceFingerprint(req);

      // INSERT … ON CONFLICT to avoid duplicate key errors
      await client.query(
        `INSERT INTO trusted_devices (user_id, device_fingerprint)
         VALUES ($1, $2)
         ON CONFLICT (user_id, device_fingerprint) DO UPDATE
            SET last_seen = NOW()`,
        [user.id, deviceFingerprint]
      );
    }

    // ---- Issue tokens (same response as normal login) ----
    return await issueTokensAndRespond(req, res, client, user);
  } catch (err) {
    console.error('Verify MFA error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}


// ---------------------------------------------------------------------------
// GET /auth/me  (US-AUTH-05)
// ---------------------------------------------------------------------------
// Returns the current user's details. Used by the React frontend to
// restore auth state and handle RBAC navigation.
// Requires `authenticate` middleware to be called first.
// ---------------------------------------------------------------------------
async function getMe(req, res) {
  const client = await pool.connect();
  // Elevate to super_admin context strictly for secure backend authentication queries to bypass RLS
  await client.query("SET app.current_user_role = 'super_admin'");


  try {
    // req.user is populated by the authenticate middleware
    const userId = req.user.user_id;

    const result = await client.query(
      `SELECT id, email, role, mfa_enabled
         FROM users
        WHERE id = $1 AND is_active = TRUE`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found or inactive' });
    }

    return res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error('getMe error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

module.exports = { login, refresh, logout, forgotPassword, resetPassword, verifyMfa, getMe };
