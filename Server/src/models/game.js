// models/game.js
const { Schema, model, Types } = require('mongoose');

const gameSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, default: '' },
    moves: { type: [String], default: [] },
    startingFen: { type: String, default: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
    finalFen: { type: String, default: '' },
    result: { type: String, enum: ['1-0', '0-1', '1/2-1/2', '*', null], default: null },
    source: { type: String, enum: ['scan', 'remote', 'import', 'manual'], default: 'manual' },
    opponentName: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = model('Game', gameSchema);
