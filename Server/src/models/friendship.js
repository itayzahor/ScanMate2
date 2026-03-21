// models/friendship.js
const { Schema, model, Types } = require('mongoose');

const friendshipSchema = new Schema(
  {
    requester: { type: Types.ObjectId, ref: 'User', required: true },
    recipient: { type: Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

// One request per pair direction
friendshipSchema.index({ requester: 1, recipient: 1 }, { unique: true });
// Fast lookups for "my requests" / "my friends"
friendshipSchema.index({ recipient: 1, status: 1 });
friendshipSchema.index({ requester: 1, status: 1 });

module.exports = model('Friendship', friendshipSchema);
