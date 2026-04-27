/**
 * @file routes/liveGames.js
 * REST endpoints for live game state. All routes require authentication (applied via router.use(auth)).
 * Real-time game play (moves, invites, draw offers, resign) is handled over Socket.IO in socket.js.
 *
 * Routes:
 *   GET  /live-games/active    — Return the caller's current active or pending game
 *   GET  /live-games/:id       — Fetch full game state by ID (for reconnection)
 *   POST /live-games/abandon   — Abandon / cancel the caller's current game
 */
const { Router } = require('express');
const auth     = require('../middleware/auth');
const LiveGame = require('../models/liveGame');

const router = Router();
router.use(auth);

/** Pending invites older than this are treated as expired and auto-declined. */
const INVITE_TTL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * GET /live-games/active
 * Return the authenticated user's current active or pending game, if any.
 *
 * Returns: { ok, game: LiveGame | null }
 *
 * - Stale pending invites (older than INVITE_TTL_MS) are automatically declined
 *   and null is returned, so the client never sees a zombie invite.
 */
router.get('/active', async (req, res, next) => {
  try {
    const userId = req.user.sub;
    const game = await LiveGame.findOne({
      status: { $in: ['pending', 'active'] },
      $or: [{ whitePlayer: userId }, { blackPlayer: userId }],
    })
      .populate('whitePlayer', 'name email picture username')
      .populate('blackPlayer', 'name email picture username')
      .lean();

    // Auto-expire stale pending invites
    if (game && game.status === 'pending' && game.createdAt) {
      const age = Date.now() - new Date(game.createdAt).getTime();
      if (age > INVITE_TTL_MS) {
        await LiveGame.findByIdAndUpdate(game._id, { status: 'declined' });
        return res.json({ ok: true, game: null });
      }
    }

    return res.json({ ok: true, game: game || null });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /live-games/:id
 * Fetch the full state of a specific game by its MongoDB ID.
 * Used by clients reconnecting to an in-progress game.
 * Returns 403 if the requesting user is not a participant.
 *
 * Returns: { ok, game: LiveGame }
 */
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user.sub;
    const game = await LiveGame.findById(req.params.id)
      .populate('whitePlayer', 'name email picture username')
      .populate('blackPlayer', 'name email picture username')
      .lean();

    if (!game) return res.status(404).json({ ok: false, error: 'Game not found' });

    // Only participants may view
    const wp = game.whitePlayer._id?.toString() ?? game.whitePlayer.toString();
    const bp = game.blackPlayer._id?.toString() ?? game.blackPlayer.toString();
    if (wp !== userId && bp !== userId) {
      return res.status(403).json({ ok: false, error: 'Not your game' });
    }

    return res.json({ ok: true, game });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /live-games/abandon
 * Abandon or cancel the authenticated user's current active or pending game.
 *
 * - Pending game  → status set to 'declined' (invite withdrawn).
 * - Active game   → treated as resignation; opponent wins and result is set.
 *
 * Returns: { ok: true, message }
 */
router.post('/abandon', async (req, res, next) => {
  try {
    const userId = req.user.sub;
    const game = await LiveGame.findOne({
      status: { $in: ['pending', 'active'] },
      $or: [{ whitePlayer: userId }, { blackPlayer: userId }],
    });

    if (!game) return res.json({ ok: true, message: 'No active game' });

    if (game.status === 'pending') {
      game.status = 'declined';
    } else {
      // Active game — count as resignation
      const isWhite = game.whitePlayer.toString() === userId;
      game.result = isWhite ? '0-1' : '1-0';
      game.status = 'completed';
    }
    await game.save();

    return res.json({ ok: true, message: 'Game abandoned' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
