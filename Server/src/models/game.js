/**
 * @file models/game.js
 * Mongoose model for a saved game record in a user's library.
 *
 * Games can originate from four sources:
 *   - 'scan'   — captured via the phone camera (ScanMate scan flow)
 *   - 'remote' — played live against another user in the app
 *   - 'import' — imported from a PGN or external source
 *   - 'manual' — entered manually by the user
 */
const { Schema, model, Types } = require('mongoose');

const gameSchema = new Schema(
  {
    userId:       { type: Types.ObjectId, ref: 'User', required: true, index: true }, // owner
    title:        { type: String, default: '' },                                       // user-supplied label
    moves:        { type: [String], default: [] },                                     // SAN move list
    startingFen:  { type: String, default: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' }, // FEN before the first move
    finalFen:     { type: String, default: '' },                                       // FEN after the last move
    result:       { type: String, enum: ['1-0', '0-1', '1/2-1/2', '*', null], default: null }, // PGN result string; null = unknown
    source:       { type: String, enum: ['scan', 'remote', 'import', 'manual'], default: 'manual' },
    opponentName: { type: String, default: '' },                                       // free-text; empty for solo sessions
  },
  { timestamps: true } // adds createdAt / updatedAt
);

module.exports = model('Game', gameSchema);
