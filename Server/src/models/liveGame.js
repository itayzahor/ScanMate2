/**
 * @file models/liveGame.js
 * Mongoose model for a real-time game between two users.
 *
 * Lifecycle:
 *   invitedBy sends invite → status 'pending'
 *   opponent accepts       → status 'active'  (moves begin)
 *   opponent declines      → status 'declined'
 *   game ends (checkmate, resign, draw, abandon) → status 'completed'
 *
 * During play, each SAN move is appended to `moves` and `currentFen` is updated
 * atomically by the socket handler so reconnecting clients always see the latest state.
 */
const { Schema, model, Types } = require('mongoose');

/** Standard chess starting position in FEN notation. */
const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const liveGameSchema = new Schema(
  {
    whitePlayer:  { type: Types.ObjectId, ref: 'User', required: true },
    blackPlayer:  { type: Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'active', 'completed', 'declined'],
      default: 'pending',
    },
    moves:        { type: [String], default: [] },             // ordered SAN move list
    startingFen:  { type: String, default: STARTING_FEN },    // FEN at game start (supports custom positions)
    currentFen:   { type: String, default: STARTING_FEN },    // FEN after the latest move
    result: {
      type: String,
      enum: ['1-0', '0-1', '1/2-1/2', null],
      default: null,                                           // null until game is completed
    },
    drawOfferedBy: { type: Types.ObjectId, ref: 'User', default: null }, // set while a draw offer is pending
    invitedBy:     { type: Types.ObjectId, ref: 'User', required: true }, // the player who initiated the game
  },
  { timestamps: true },
);

// Speed up active-game lookups by player
liveGameSchema.index({ whitePlayer: 1, status: 1 });
liveGameSchema.index({ blackPlayer: 1, status: 1 });

module.exports = model('LiveGame', liveGameSchema);
