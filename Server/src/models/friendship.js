/**
 * @file models/friendship.js
 * Mongoose model for a directional friend relationship between two users.
 *
 * Lifecycle:  requester sends request → status 'pending'
 *             recipient accepts       → status 'accepted'
 *             either party rejects    → document deleted
 *
 * The compound unique index on (requester, recipient) prevents duplicate requests
 * in the same direction. The routes layer queries both directions with $or to
 * handle the bidirectional nature of friendship.
 */
const { Schema, model, Types } = require('mongoose');

const friendshipSchema = new Schema(
  {
    requester: { type: Types.ObjectId, ref: 'User', required: true }, // user who sent the request
    recipient: { type: Types.ObjectId, ref: 'User', required: true }, // user who received it
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

// Enforce one document per ordered pair — prevents duplicate requests in the same direction
friendshipSchema.index({ requester: 1, recipient: 1 }, { unique: true });
// Fast lookups for incoming requests and accepted friends for a given recipient
friendshipSchema.index({ recipient: 1, status: 1 });
// Fast lookups for outgoing requests and accepted friends for a given requester
friendshipSchema.index({ requester: 1, status: 1 });

module.exports = model('Friendship', friendshipSchema);
