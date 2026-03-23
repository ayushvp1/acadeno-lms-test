// ==========================================================================
// ACADENO LMS — JWT Utility (RS256)
// ==========================================================================
// Generates and verifies RS256-signed JWTs using RSA key-pair from env vars.
// Access tokens carry { user_id, role, email } and expire in 15 min.
// Refresh tokens are cryptographically random 64-byte hex strings.
// ==========================================================================

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

<<<<<<< HEAD
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Key loading — Read from file paths or environment variables.
// ---------------------------------------------------------------------------
let PRIVATE_KEY;
let PUBLIC_KEY;

try {
  if (process.env.JWT_PRIVATE_KEY_PATH) {
    const privateKeyPath = path.resolve(process.env.JWT_PRIVATE_KEY_PATH);
    PRIVATE_KEY = fs.readFileSync(privateKeyPath, 'utf8');
  } else {
    PRIVATE_KEY = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  }

  if (process.env.JWT_PUBLIC_KEY_PATH) {
    const publicKeyPath = path.resolve(process.env.JWT_PUBLIC_KEY_PATH);
    PUBLIC_KEY = fs.readFileSync(publicKeyPath, 'utf8');
  } else {
    PUBLIC_KEY = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n');
  }
} catch (err) {
  console.error('Error loading JWT RSA keys:', err.message);
}
=======
// ---------------------------------------------------------------------------
// Key loading — newlines are stored as literal "\n" in .env, restore them.
// ---------------------------------------------------------------------------
const PRIVATE_KEY = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n');
const PUBLIC_KEY  = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n');
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906

const ACCESS_TOKEN_EXPIRY = process.env.JWT_ACCESS_EXPIRY
  ? `${process.env.JWT_ACCESS_EXPIRY}s`   // e.g. "900s" → 15 minutes
  : '900s';

// ---------------------------------------------------------------------------
// generateTokens(user)
// ---------------------------------------------------------------------------
// Accepts a user object (must contain id, role, email).
// Returns { accessToken, refreshToken }.
// ---------------------------------------------------------------------------
function generateTokens(user) {
  if (!PRIVATE_KEY) {
    throw new Error('JWT_PRIVATE_KEY is not configured');
  }

  const payload = {
    user_id: user.id,
    role:    user.role,
    email:   user.email,
  };

  const accessToken = jwt.sign(payload, PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: ACCESS_TOKEN_EXPIRY,
    issuer:    'acadeno-lms',
    subject:   String(user.id),
  });

  // Refresh token — opaque, not a JWT.
  // 64 random bytes → 128-char hex string.
  const refreshToken = crypto.randomBytes(64).toString('hex');

  return { accessToken, refreshToken };
}

// ---------------------------------------------------------------------------
// verifyAccessToken(token)
// ---------------------------------------------------------------------------
// Verifies an RS256-signed access token using the public key.
// Returns the decoded payload on success.
// Throws a jwt.JsonWebTokenError (or subclass) on failure.
// ---------------------------------------------------------------------------
function verifyAccessToken(token) {
  if (!PUBLIC_KEY) {
    throw new Error('JWT_PUBLIC_KEY is not configured');
  }

  return jwt.verify(token, PUBLIC_KEY, {
    algorithms: ['RS256'],
    issuer:     'acadeno-lms',
  });
}

<<<<<<< HEAD
// ---------------------------------------------------------------------------
// generateWizardToken({ user_id, role, email, lead_id })
// ---------------------------------------------------------------------------
// Issues a short-lived (4 h) access JWT for a converted lead filling in the
// registration wizard. Role is always 'lead_registrant' — this role only exists
// in JWTs, not in the PostgreSQL user_role ENUM.
// No refresh token is issued — the link is one-time use only.
// ---------------------------------------------------------------------------
function generateWizardToken({ user_id, role, email, lead_id }) {
  if (!PRIVATE_KEY) {
    throw new Error('JWT_PRIVATE_KEY is not configured');
  }

  return jwt.sign(
    { user_id, role, email, lead_id },
    PRIVATE_KEY,
    {
      algorithm: 'RS256',
      expiresIn: '4h',
      issuer:    'acadeno-lms',
      subject:   String(lead_id),
    }
  );
}

module.exports = { generateTokens, verifyAccessToken, generateWizardToken };
=======
module.exports = { generateTokens, verifyAccessToken };
>>>>>>> db2d8eb874e2000e0bf05d72f9684533cc8f0906
