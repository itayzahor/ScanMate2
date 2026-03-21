// routes/liveGames.js — REST endpoints for reconnection / active game lookup
const { Router } = require('express');
const auth = require('../middleware/auth');
const LiveGame = require('../models/liveGame');

const router = Router();
router.use(auth);

/** Pending invites older than this are auto-expired */
const INVITE_TTL_MS = 2 * 60 * 1000; // 2 minutes

// Get current user's active or pending game (one at a time)
router.get('/active', async (req, res, next) => {
  try {
    const userId = req.user.sub;
    const game = await LiveGame.findOne({
      status: { $in: ['pending', 'active'] },
      $or: [{ whitePlayer: userId }, { blackPlayer: userId }],
    })
      .populate('whitePlayer', 'name email picture')
      .populate('blackPlayer', 'name email picture')
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

// Get full game state by id (for reconnection)
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user.sub;
    const game = await LiveGame.findById(req.params.id)
      .populate('whitePlayer', 'name email picture')
      .populate('blackPlayer', 'name email picture')
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

// Abandon / cancel the user's current active or pending game
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
