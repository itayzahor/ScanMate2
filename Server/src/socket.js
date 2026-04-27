/**
 * @file socket.js
 * Socket.IO initialisation and all real-time game event handlers.
 *
 * Events listened to (client → server):
 *   game:invite          — Send a game invite to a friend
 *   game:invite:respond  — Accept or decline an incoming invite
 *   game:invite:cancel   — Cancel a pending outgoing invite
 *   game:move            — Submit a move (from/to/promotion)
 *   game:resign          — Resign the active game
 *   game:draw:offer      — Offer a draw to the opponent
 *   game:draw:respond    — Accept or decline a draw offer
 *
 * Events emitted (server → client):
 *   game:invited         — Delivered to the recipient of a new invite
 *   game:invite:expired  — Delivered when a stale pending invite is auto-declined
 *   game:invite:cancelled — Delivered to the recipient when the inviter cancels
 *   game:started         — Delivered to both players when an invite is accepted
 *   game:declined        — Delivered to the inviter when the recipient declines
 *   game:moved           — Delivered to both players after every legal move
 *   game:over            — Delivered to both players when the game ends
 *   game:draw:offered    — Delivered to the opponent when a draw is offered
 *   game:draw:declined   — Delivered to the offerer when the opponent declines
 */
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { Chess } = require('chess.js');
const LiveGame = require('./models/liveGame');
const Friendship = require('./models/friendship');
const User = require('./models/user');

/** userId → socketId */
const onlineUsers = new Map();

/** Pending invites older than this are auto-expired */
const INVITE_TTL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Initialize Socket.IO on the given HTTP server.
 * Attaches JWT auth middleware and registers all game event handlers.
 *
 * @param {import('http').Server} httpServer - The Node.js HTTP server to attach Socket.IO to.
 * @returns {import('socket.io').Server} The configured Socket.IO server instance.
 */
function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  // ── Auth middleware ───────────────────────────────────────────────
  // Verifies the JWT passed in socket.handshake.auth.token before allowing connection.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = payload;            // { sub, googleId, iat, exp }
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection ───────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const userId = socket.user.sub;
    onlineUsers.set(userId, socket.id);
    console.log(`⚡ socket connected  uid=${userId}  sid=${socket.id}`);

    /**
     * game:invite
     * Send a game invite to a friend.
     *
     * Payload: { recipientId: string, color: 'white'|'black', startingFen?: string }
     * Ack:     { ok, gameId? } | { ok: false, error }
     *
     * - Recipient must be an accepted friend.
     * - Stale pending invites are auto-expired before the busy check.
     * - Neither player may already have an active or pending game.
     * - Emits `game:invited` to the recipient if they are online.
     */
    socket.on('game:invite', async (data, ack) => {
      try {
        const { recipientId, color, startingFen } = data;
        if (!recipientId || !['white', 'black'].includes(color)) {
          return ack?.({ ok: false, error: 'Invalid payload' });
        }

        // Recipient must be a friend
        const friendship = await Friendship.findOne({
          status: 'accepted',
          $or: [
            { requester: userId, recipient: recipientId },
            { requester: recipientId, recipient: userId },
          ],
        });
        if (!friendship) return ack?.({ ok: false, error: 'Not friends' });

        // Neither player may have an active/pending game
        // Auto-expire stale pending invites first
        const stale = await LiveGame.find({
          status: 'pending',
          createdAt: { $lt: new Date(Date.now() - INVITE_TTL_MS) },
          $or: [
            { whitePlayer: { $in: [userId, recipientId] } },
            { blackPlayer: { $in: [userId, recipientId] } },
          ],
        });
        for (const g of stale) {
          g.status = 'declined';
          await g.save();
          // Notify both players the invite expired
          const wp = g.whitePlayer.toString();
          const bp = g.blackPlayer.toString();
          const wpSid = onlineUsers.get(wp);
          const bpSid = onlineUsers.get(bp);
          if (wpSid) io.to(wpSid).emit('game:invite:expired', { gameId: g._id });
          if (bpSid) io.to(bpSid).emit('game:invite:expired', { gameId: g._id });
        }

        const busy = await LiveGame.findOne({
          status: { $in: ['pending', 'active'] },
          $or: [
            { whitePlayer: { $in: [userId, recipientId] } },
            { blackPlayer: { $in: [userId, recipientId] } },
          ],
        });
        if (busy) return ack?.({ ok: false, error: 'A game is already in progress' });

        const whitePlayer = color === 'white' ? userId : recipientId;
        const blackPlayer = color === 'white' ? recipientId : userId;

        const fen = startingFen || undefined;   // undefined → schema default
        const game = await LiveGame.create({
          whitePlayer,
          blackPlayer,
          invitedBy: userId,
          ...(fen && { startingFen: fen, currentFen: fen }),
        });

        // Notify recipient if online
        const recipientSid = onlineUsers.get(recipientId);
        if (recipientSid) {
          const inviter = await User.findById(userId).select('name email picture username').lean();
          io.to(recipientSid).emit('game:invited', {
            gameId: game._id,
            inviter,
            color: color === 'white' ? 'black' : 'white', // recipient's color
            startingFen: game.startingFen,
          });
        }

        ack?.({ ok: true, gameId: game._id });
      } catch (err) {
        console.error('game:invite error', err);
        ack?.({ ok: false, error: 'Server error' });
      }
    });

    /**
     * game:invite:respond
     * Accept or decline a pending game invite.
     *
     * Payload: { gameId: string, accept: boolean }
     * Ack:     { ok } | { ok: false, error }
     *
     * - Only the non-inviting player may respond.
     * - On accept: sets status to 'active', emits `game:started` to both players.
     * - On decline: sets status to 'declined', emits `game:declined` to the inviter.
     */
    socket.on('game:invite:respond', async (data, ack) => {
      try {
        const { gameId, accept } = data;
        const game = await LiveGame.findById(gameId);
        if (!game || game.status !== 'pending') {
          return ack?.({ ok: false, error: 'Game not found or not pending' });
        }

        // Only the non-inviter may respond
        const isWhite = game.whitePlayer.toString() === userId;
        const isBlack = game.blackPlayer.toString() === userId;
        if (!isWhite && !isBlack) return ack?.({ ok: false, error: 'Not your game' });
        if (game.invitedBy.toString() === userId) {
          return ack?.({ ok: false, error: 'Cannot respond to your own invite' });
        }

        if (accept) {
          game.status = 'active';
          await game.save();

          const populated = await LiveGame.findById(gameId)
            .populate('whitePlayer', 'name email picture username')
            .populate('blackPlayer', 'name email picture username')
            .lean();

          // Notify both players
          const whiteSid = onlineUsers.get(game.whitePlayer.toString());
          const blackSid = onlineUsers.get(game.blackPlayer.toString());
          const payload = { game: populated };
          if (whiteSid) io.to(whiteSid).emit('game:started', payload);
          if (blackSid) io.to(blackSid).emit('game:started', payload);
        } else {
          game.status = 'declined';
          await game.save();

          const inviterSid = onlineUsers.get(game.invitedBy.toString());
          if (inviterSid) io.to(inviterSid).emit('game:declined', { gameId });
        }

        ack?.({ ok: true });
      } catch (err) {
        console.error('game:invite:respond error', err);
        ack?.({ ok: false, error: 'Server error' });
      }
    });

    /**
     * game:invite:cancel
     * Cancel a pending outgoing invite. Only the inviter may cancel.
     *
     * Payload: { gameId: string }
     * Ack:     { ok } | { ok: false, error }
     *
     * Sets status to 'declined' and emits `game:invite:cancelled` to the recipient.
     */
    socket.on('game:invite:cancel', async (data, ack) => {
      try {
        const { gameId } = data;
        const game = await LiveGame.findById(gameId);
        if (!game || game.status !== 'pending') {
          return ack?.({ ok: false, error: 'Game not found or not pending' });
        }
        if (game.invitedBy.toString() !== userId) {
          return ack?.({ ok: false, error: 'Only the inviter can cancel' });
        }

        game.status = 'declined';
        await game.save();

        // Notify the other player
        const otherId = game.whitePlayer.toString() === userId
          ? game.blackPlayer.toString()
          : game.whitePlayer.toString();
        const otherSid = onlineUsers.get(otherId);
        if (otherSid) io.to(otherSid).emit('game:invite:cancelled', { gameId });

        ack?.({ ok: true });
      } catch (err) {
        console.error('game:invite:cancel error', err);
        ack?.({ ok: false, error: 'Server error' });
      }
    });

    /**
     * game:move
     * Submit a move for the active game.
     *
     * Payload: { gameId: string, from: string, to: string, promotion?: string }
     * Ack:     { ok, san, fen, from, to, gameOver, result } | { ok: false, error }
     *
     * - Validates turn order and move legality via chess.js.
     * - Any pending draw offer is voided on move.
     * - Detects checkmate, stalemate, and draw; sets result and status accordingly.
     * - Emits `game:moved` to both players.
     */
    socket.on('game:move', async (data, ack) => {
      try {
        const { gameId, from, to, promotion } = data;
        const game = await LiveGame.findById(gameId);
        if (!game || game.status !== 'active') {
          return ack?.({ ok: false, error: 'Game not active' });
        }

        const isWhite = game.whitePlayer.toString() === userId;
        const isBlack = game.blackPlayer.toString() === userId;
        if (!isWhite && !isBlack) return ack?.({ ok: false, error: 'Not your game' });

        const chess = new Chess(game.currentFen);
        const turn = chess.turn();  // 'w' or 'b'
        if ((turn === 'w' && !isWhite) || (turn === 'b' && !isBlack)) {
          return ack?.({ ok: false, error: 'Not your turn' });
        }

        const move = chess.move({ from, to, promotion: promotion || undefined });
        if (!move) return ack?.({ ok: false, error: 'Illegal move' });

        game.moves.push(move.san);
        game.currentFen = chess.fen();
        game.drawOfferedBy = null;  // any pending draw offer is voided

        let gameOver = false;
        let result = null;
        if (chess.isCheckmate()) {
          result = turn === 'w' ? '1-0' : '0-1';
          game.result = result;
          game.status = 'completed';
          gameOver = true;
        } else if (chess.isStalemate() || chess.isDraw()) {
          result = '1/2-1/2';
          game.result = result;
          game.status = 'completed';
          gameOver = true;
        }

        await game.save();

        const movePayload = {
          gameId,
          san: move.san,
          fen: chess.fen(),
          from: move.from,
          to: move.to,
          gameOver,
          result,
        };

        // Emit to both players
        const whiteId = game.whitePlayer.toString();
        const blackId = game.blackPlayer.toString();
        const whiteSid = onlineUsers.get(whiteId);
        const blackSid = onlineUsers.get(blackId);
        console.log(`  → emit game:moved  white=${whiteId} sid=${whiteSid}  black=${blackId} sid=${blackSid}`);
        if (whiteSid) io.to(whiteSid).emit('game:moved', movePayload);
        if (blackSid) io.to(blackSid).emit('game:moved', movePayload);

        ack?.({ ok: true, ...movePayload });
      } catch (err) {
        console.error('game:move error', err);
        ack?.({ ok: false, error: 'Server error' });
      }
    });

    /**
     * game:resign
     * Resign the active game. The opponent wins.
     *
     * Payload: { gameId: string }
     * Ack:     { ok, result, reason } | { ok: false, error }
     *
     * Emits `game:over` to both players with reason 'resign'.
     */
    socket.on('game:resign', async (data, ack) => {
      try {
        const { gameId } = data;
        const game = await LiveGame.findById(gameId);
        if (!game || game.status !== 'active') {
          return ack?.({ ok: false, error: 'Game not active' });
        }

        const isWhite = game.whitePlayer.toString() === userId;
        const isBlack = game.blackPlayer.toString() === userId;
        if (!isWhite && !isBlack) return ack?.({ ok: false, error: 'Not your game' });

        game.result = isWhite ? '0-1' : '1-0';
        game.status = 'completed';
        await game.save();

        const payload = { gameId, result: game.result, reason: 'resign' };
        const whiteSid = onlineUsers.get(game.whitePlayer.toString());
        const blackSid = onlineUsers.get(game.blackPlayer.toString());
        if (whiteSid) io.to(whiteSid).emit('game:over', payload);
        if (blackSid) io.to(blackSid).emit('game:over', payload);

        ack?.({ ok: true, ...payload });
      } catch (err) {
        console.error('game:resign error', err);
        ack?.({ ok: false, error: 'Server error' });
      }
    });

    /**
     * game:draw:offer
     * Offer a draw to the opponent.
     *
     * Payload: { gameId: string }
     * Ack:     { ok } | { ok: false, error }
     *
     * Sets `drawOfferedBy` on the game document and emits `game:draw:offered` to the opponent.
     * The offer is automatically voided if either player makes a move.
     */
    socket.on('game:draw:offer', async (data, ack) => {
      try {
        const { gameId } = data;
        const game = await LiveGame.findById(gameId);
        if (!game || game.status !== 'active') {
          return ack?.({ ok: false, error: 'Game not active' });
        }

        const isWhite = game.whitePlayer.toString() === userId;
        const isBlack = game.blackPlayer.toString() === userId;
        if (!isWhite && !isBlack) return ack?.({ ok: false, error: 'Not your game' });

        game.drawOfferedBy = userId;
        await game.save();

        const opponentId = isWhite
          ? game.blackPlayer.toString()
          : game.whitePlayer.toString();
        const opponentSid = onlineUsers.get(opponentId);
        if (opponentSid) {
          io.to(opponentSid).emit('game:draw:offered', { gameId });
        }

        ack?.({ ok: true });
      } catch (err) {
        console.error('game:draw:offer error', err);
        ack?.({ ok: false, error: 'Server error' });
      }
    });

    /**
     * game:draw:respond
     * Accept or decline a pending draw offer.
     * Only the player who did NOT make the offer may respond.
     *
     * Payload: { gameId: string, accept: boolean }
     * Ack:     { ok } | { ok: false, error }
     *
     * - On accept: sets result '1/2-1/2', emits `game:over` to both players.
     * - On decline: clears the offer, emits `game:draw:declined` to the offerer.
     */
    socket.on('game:draw:respond', async (data, ack) => {
      try {
        const { gameId, accept } = data;
        const game = await LiveGame.findById(gameId);
        if (!game || game.status !== 'active' || !game.drawOfferedBy) {
          return ack?.({ ok: false, error: 'No draw offer pending' });
        }

        // Only the player who did NOT offer may respond
        if (game.drawOfferedBy.toString() === userId) {
          return ack?.({ ok: false, error: 'Cannot respond to your own draw offer' });
        }

        if (accept) {
          game.result = '1/2-1/2';
          game.status = 'completed';
          game.drawOfferedBy = null;
          await game.save();

          const payload = { gameId, result: '1/2-1/2', reason: 'draw' };
          const whiteSid = onlineUsers.get(game.whitePlayer.toString());
          const blackSid = onlineUsers.get(game.blackPlayer.toString());
          if (whiteSid) io.to(whiteSid).emit('game:over', payload);
          if (blackSid) io.to(blackSid).emit('game:over', payload);
        } else {
          game.drawOfferedBy = null;
          await game.save();

          // drawOfferedBy is already cleared; notify the offerer by finding the other player
          const isWhite = game.whitePlayer.toString() === userId;
          const opponentId = isWhite
            ? game.blackPlayer.toString()
            : game.whitePlayer.toString();
          const opponentSid = onlineUsers.get(opponentId);
          if (opponentSid) {
            io.to(opponentSid).emit('game:draw:declined', { gameId });
          }
        }

        ack?.({ ok: true });
      } catch (err) {
        console.error('game:draw:respond error', err);
        ack?.({ ok: false, error: 'Server error' });
      }
    });

    // ── Disconnect ─────────────────────────────────────────────────
    socket.on('disconnect', () => {
      onlineUsers.delete(userId);
      console.log(`⚡ socket disconnected uid=${userId}`);
    });
  });

  console.log('🔌 Socket.io ready');
  return io;
}

module.exports = { initSocket };
