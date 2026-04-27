/**
 * @file middleware/auth.js
 * Express middleware that enforces JWT Bearer token authentication.
 *
 * Reads the `Authorization: Bearer <token>` header, verifies the token
 * against JWT_SECRET, and attaches the decoded payload to `req.user`.
 * Returns 401 if the header is missing or the token is invalid/expired.
 */
const jwt = require('jsonwebtoken');

/**
 * Authentication middleware.
 * Verifies the JWT in the Authorization header and populates `req.user`.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function auth(req, res, next) {
  const hdr = req.headers.authorization || '';
  // Accept only the Bearer scheme
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'No token' });
  try {
    // Decoded payload is { sub: <userId>, googleId, iat, exp }
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    // Covers TokenExpiredError, JsonWebTokenError, etc.
    res.status(401).json({ ok: false, error: 'Invalid token' });
  }
}

module.exports = auth;
