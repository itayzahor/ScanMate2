/**
 * @file routes/index.js
 * Root router — mounts all sub-routers under their path prefixes.
 *
 * Prefix          Router file
 * /api/auth       routes/auth.js
 * /api/games      routes/games.js
 * /api/friends    routes/friends.js
 * /api/live-games routes/liveGames.js
 */
const { Router } = require('express');
const authRouter      = require('./auth');
const gamesRouter     = require('./games');
const friendsRouter   = require('./friends');
const liveGamesRouter = require('./liveGames');

const router = Router();

router.use('/auth',       authRouter);
router.use('/games',      gamesRouter);
router.use('/friends',    friendsRouter);
router.use('/live-games', liveGamesRouter);

module.exports = router;
