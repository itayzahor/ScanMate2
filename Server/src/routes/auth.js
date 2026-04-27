/**
 * @file routes/auth.js
 * Authentication routes.
 *
 * Routes:
 *   POST   /auth/google          — Verify a Google ID token, upsert the user, return a signed JWT
 *   GET    /auth/me              — Return the authenticated user's profile
 *   GET    /auth/username/check  — Check whether a username is available
 *   PUT    /auth/username        — Set or update the authenticated user's username
 *   DELETE /auth/account         — Permanently delete the authenticated user's account and all their data
 */
const { Router } = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/user');
const Friendship = require('../models/friendship');
const Game = require('../models/game');
const LiveGame = require('../models/liveGame');
const auth = require('../middleware/auth');

const router = Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * POST /auth/google
 * Exchange a Google ID token for an application JWT.
 *
 * Body:    { idToken: string }
 * Returns: { ok, token, user: { id, email, name, picture, username } }
 *
 * - Verifies the token against GOOGLE_CLIENT_ID and rejects unverified emails.
 * - Upserts the User document (creates on first login, updates profile fields on subsequent logins).
 * - Issues a 30-day JWT signed with JWT_SECRET; `sub` is the MongoDB `_id` string.
 */
router.post('/google', async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ ok: false, error: 'Missing idToken' });

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload(); // sub, email, name, picture, email_verified, exp, aud, iss
    if (!payload.email_verified) {
      return res.status(401).json({ ok: false, error: 'Email not verified by Google' });
    }

    // Upsert user
    const { sub: googleId, email, name, picture } = payload;
    const user = await User.findOneAndUpdate(
      { googleId },
      { googleId, email, name, picture },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Issue your app token (JWT)
    const token = jwt.sign(
      { sub: user._id.toString(), googleId: user.googleId },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      ok: true,
      token,
      user: { id: user._id, email: user.email, name: user.name, picture: user.picture, username: user.username ?? null },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /auth/me  (requires auth)
 * Return the authenticated user's profile.
 *
 * Returns: { ok, user: { id, email, name, picture, username } }
 */
router.get('/me', auth, async (req, res, next) => {
  try {
    // req.user.sub is the MongoDB _id string set by the auth middleware
    const user = await User.findById(req.user.sub).lean();

    if (!user) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    res.json({
      ok: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        username: user.username ?? null,
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /auth/username/check  (requires auth)
 * Check whether a username string is available for the current user to claim.
 *
 * Query:   ?username=<string>
 * Returns: { ok, available: boolean }
 *
 * - Validates format: 3–20 chars, letters/digits/underscores only.
 * - A username already owned by the requesting user is considered available.
 */
router.get('/username/check', auth, async (req, res, next) => {
  try {
    const { username } = req.query;
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ ok: false, error: 'Username must be at least 3 characters' });
    }
    const cleaned = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(cleaned)) {
      return res.status(400).json({ ok: false, error: 'Username can only contain letters, numbers, and underscores (3-20 chars)' });
    }
    const existing = await User.findOne({ username: cleaned, _id: { $ne: req.user.sub } });
    res.json({ ok: true, available: !existing });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /auth/username  (requires auth)
 * Set or update the authenticated user's username.
 *
 * Body:    { username: string }
 * Returns: { ok, user: { id, email, name, picture, username } }
 *
 * - Validates format: 3–20 chars, letters/digits/underscores only.
 * - Returns 409 if the username is already taken by another user.
 */
router.put('/username', auth, async (req, res, next) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ ok: false, error: 'Username must be at least 3 characters' });
    }
    const cleaned = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(cleaned)) {
      return res.status(400).json({ ok: false, error: 'Username can only contain letters, numbers, and underscores (3-20 chars)' });
    }
    const existing = await User.findOne({ username: cleaned, _id: { $ne: req.user.sub } });
    if (existing) {
      return res.status(409).json({ ok: false, error: 'Username already taken' });
    }
    const user = await User.findByIdAndUpdate(req.user.sub, { username: cleaned }, { new: true }).lean();
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    res.json({
      ok: true,
      user: { id: user._id, email: user.email, name: user.name, picture: user.picture, username: user.username },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /auth/account  (requires auth)
 * Permanently delete the authenticated user's account and all associated data.
 *
 * Cascade deletes (in order):
 *   1. All Friendship documents where the user is requester or recipient.
 *   2. All Game documents owned by the user.
 *   3. All LiveGame documents where the user is a participant.
 *   4. The User document itself.
 *
 * Returns: { ok: true }
 */
router.delete('/account', auth, async (req, res, next) => {
  try {
    const userId = req.user.sub;
    await Friendship.deleteMany({ $or: [{ requester: userId }, { recipient: userId }] });
    await Game.deleteMany({ userId });
    await LiveGame.deleteMany({ $or: [{ whitePlayer: userId }, { blackPlayer: userId }] });
    await User.findByIdAndDelete(userId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
