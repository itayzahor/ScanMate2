/**
 * @file routes/games.js
 * Saved game library routes. All routes require authentication (applied via router.use(auth)).
 *
 * Routes:
 *   POST   /games/     — Save a new game record
 *   GET    /games/     — List the user's games with offset pagination
 *   GET    /games/:id  — Fetch a single game by MongoDB ID
 *   DELETE /games/:id  — Delete a game by MongoDB ID
 */
const { Router } = require('express');
const auth = require('../middleware/auth');
const Game = require('../models/game');

const router = Router();

// All routes require authentication
router.use(auth);

/**
 * POST /games/
 * Save a new game or position to the user's library.
 *
 * Body:    { title?, moves?, startingFen?, finalFen, result?, source?, opponentName? }
 * Returns: { ok, game }
 *
 * `source` values: 'scan' | 'live' | 'import' | 'manual' (default: 'manual')
 */
router.post('/', async (req, res, next) => {
  try {
    const { title, moves, startingFen, finalFen, result, source, opponentName } = req.body;

    const game = await Game.create({
      userId: req.user.sub,
      title: title || '',
      moves: moves || [],
      startingFen: startingFen || undefined,
      finalFen: finalFen || '',
      result: result || null,
      source: source || 'manual',
      opponentName: opponentName || '',
    });

    res.status(201).json({ ok: true, game });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /games/
 * List the authenticated user's games, newest first, with offset pagination.
 *
 * Query:   ?skip=<number>&limit=<number>  (limit capped at 100, defaults to 20)
 * Returns: { ok, games: Game[], total: number }
 */
router.get('/', async (req, res, next) => {
  try {
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const [games, total] = await Promise.all([
      Game.find({ userId: req.user.sub })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Game.countDocuments({ userId: req.user.sub }),
    ]);

    res.json({ ok: true, games, total });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /games/:id
 * Fetch a single game by its MongoDB ID.
 * Returns 403 when the game exists but belongs to a different user.
 *
 * Returns: { ok, game }
 */
router.get('/:id', async (req, res, next) => {
  try {
    const game = await Game.findById(req.params.id).lean();
    if (!game) {
      return res.status(404).json({ ok: false, error: 'Game not found' });
    }
    if (game.userId.toString() !== req.user.sub) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
    res.json({ ok: true, game });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /games/:id
 * Delete a game by its MongoDB ID.
 * Returns 403 when the game exists but belongs to a different user.
 *
 * Returns: { ok: true }
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const game = await Game.findById(req.params.id);
    if (!game) {
      return res.status(404).json({ ok: false, error: 'Game not found' });
    }
    if (game.userId.toString() !== req.user.sub) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
    await game.deleteOne();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
