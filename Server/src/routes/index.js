const { Router } = require('express');
const authRouter = require('./auth');
const gamesRouter = require('./games');
const friendsRouter = require('./friends');
const liveGamesRouter = require('./liveGames');

const router = Router();

// mount Google auth routes
router.use('/auth', authRouter);

// mount game library routes
router.use('/games', gamesRouter);

// mount friends routes
router.use('/friends', friendsRouter);

// mount live games routes
router.use('/live-games', liveGamesRouter);

module.exports = router;
