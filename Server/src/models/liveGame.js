// models/liveGame.js
const { Schema, model, Types } = require('mongoose');

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const liveGameSchema = new Schema(
  {
    whitePlayer: { type: Types.ObjectId, ref: 'User', required: true },
    blackPlayer: { type: Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'active', 'completed', 'declined'],
      default: 'pending',
    },
    moves: { type: [String], default: [] },
    startingFen: { type: String, default: STARTING_FEN },
    currentFen: { type: String, default: STARTING_FEN },
    result: {
      type: String,
      enum: ['1-0', '0-1', '1/2-1/2', null],
      default: null,
    },
    drawOfferedBy: { type: Types.ObjectId, ref: 'User', default: null },
    invitedBy: { type: Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

liveGameSchema.index({ whitePlayer: 1, status: 1 });
liveGameSchema.index({ blackPlayer: 1, status: 1 });

module.exports = model('LiveGame', liveGameSchema);
