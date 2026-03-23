// ==========================================================================
// ACADENO LMS — JWT Utility (RS256)
// ==========================================================================
// Generates and verifies RS256-signed JWTs using RSA key-pair from env vars.
// Access tokens carry { user_id, role, email } and expire in 15 min.
// Refresh tokens are cryptographically random 64-byte hex strings.
// ==========================================================================

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Key loading — newlines are stored as literal "\n" in .env, restore them.
// ---------------------------------------------------------------------------
const PRIVATE_KEY = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n');
const PUBLIC_KEY  = process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n');

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

module.exports = { generateTokens, verifyAccessToken };
