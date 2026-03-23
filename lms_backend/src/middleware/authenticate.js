// ==========================================================================
// ACADENO LMS — Authentication Middleware
// ==========================================================================
// Extracts the Bearer token from the Authorization header, verifies it
// using the RS256 public key, and attaches the decoded payload to req.user.
//
// Usage:
//   const authenticate = require('../middleware/authenticate');
//   router.get('/me', authenticate, meController);
// ==========================================================================

const { verifyAccessToken } = require('../utils/jwt');

function authenticate(req, res, next) {
  // 1. Read the Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Missing or malformed Authorization header',
    });
  }

  // 2. Extract the token (everything after "Bearer ")
  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: 'Token not provided',
    });
  }

  try {
    // 3. Verify the RS256 access token
    const decoded = verifyAccessToken(token);

    // 4. Attach decoded payload to the request object
    //    Downstream handlers can access req.user.user_id, req.user.role, etc.
    req.user = {
      user_id: decoded.user_id,
      role:    decoded.role,
      email:   decoded.email,
    };

    next();
  } catch (err) {
    // Handle specific JWT error types for clearer client feedback
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Access token has expired',
        code:  'TOKEN_EXPIRED',
      });
    }

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid access token',
        code:  'TOKEN_INVALID',
      });
    }

    // Unexpected errors (e.g. missing public key)
    console.error('Authentication error:', err.message);
    return res.status(500).json({
      error: 'Internal authentication error',
    });
  }
}

module.exports = authenticate;
