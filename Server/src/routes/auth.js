// routes/auth.js
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

router.get('/me', auth, async (req, res, next) => {
  try {
    // req.user.sub came from jwt.sign(...) when you created the token
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

// --- Check username availability ---
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

// --- Set or update username ---
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

// --- Delete account ---
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
