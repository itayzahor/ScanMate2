// routes/friends.js
const { Router } = require('express');
const auth = require('../middleware/auth');
const Friendship = require('../models/friendship');
const User = require('../models/user');

const router = Router();
router.use(auth);

// --- Search users by name or email (partial match) ---
router.get('/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(400).json({ ok: false, error: 'Query must be at least 2 characters' });
    }
    const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const users = await User.find({
      _id: { $ne: req.user.sub },
      username: { $regex: escaped, $options: 'i' },
    })
      .limit(10)
      .select('name email picture username')
      .lean();
    return res.json({ ok: true, users });
  } catch (err) {
    next(err);
  }
});

// --- Send friend request ---
router.post('/request', async (req, res, next) => {
  try {
    const { recipientId } = req.body;
    if (!recipientId) {
      return res.status(400).json({ ok: false, error: 'recipientId required' });
    }
    if (recipientId === req.user.sub) {
      return res.status(400).json({ ok: false, error: "Can't friend yourself" });
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // Check if any friendship already exists in either direction
    const existing = await Friendship.findOne({
      $or: [
        { requester: req.user.sub, recipient: recipientId },
        { requester: recipientId, recipient: req.user.sub },
      ],
    });

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(409).json({ ok: false, error: 'Already friends' });
      }
      if (existing.status === 'pending') {
        return res.status(409).json({ ok: false, error: 'Request already pending' });
      }
      // rejected — allow re-request by updating
      existing.requester = req.user.sub;
      existing.recipient = recipientId;
      existing.status = 'pending';
      await existing.save();
      return res.json({ ok: true, friendship: existing });
    }

    const friendship = await Friendship.create({
      requester: req.user.sub,
      recipient: recipientId,
    });
    res.status(201).json({ ok: true, friendship });
  } catch (err) {
    next(err);
  }
});

// --- Accept a pending request ---
router.post('/:id/accept', async (req, res, next) => {
  try {
    const friendship = await Friendship.findById(req.params.id);
    if (!friendship) {
      return res.status(404).json({ ok: false, error: 'Request not found' });
    }
    if (friendship.recipient.toString() !== req.user.sub) {
      return res.status(403).json({ ok: false, error: 'Not your request to accept' });
    }
    if (friendship.status !== 'pending') {
      return res.status(400).json({ ok: false, error: `Already ${friendship.status}` });
    }
    friendship.status = 'accepted';
    await friendship.save();
    res.json({ ok: true, friendship });
  } catch (err) {
    next(err);
  }
});

// --- Reject / cancel a request ---
router.post('/:id/reject', async (req, res, next) => {
  try {
    const friendship = await Friendship.findById(req.params.id);
    if (!friendship) {
      return res.status(404).json({ ok: false, error: 'Request not found' });
    }
    // Either party can reject/cancel
    const userId = req.user.sub;
    if (
      friendship.recipient.toString() !== userId &&
      friendship.requester.toString() !== userId
    ) {
      return res.status(403).json({ ok: false, error: 'Not your request' });
    }
    await Friendship.findByIdAndDelete(friendship._id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Remove a friend ---
router.delete('/:id', async (req, res, next) => {
  try {
    const friendship = await Friendship.findById(req.params.id);
    if (!friendship) {
      return res.status(404).json({ ok: false, error: 'Not found' });
    }
    const userId = req.user.sub;
    if (
      friendship.requester.toString() !== userId &&
      friendship.recipient.toString() !== userId
    ) {
      return res.status(403).json({ ok: false, error: 'Not your friendship' });
    }
    await Friendship.findByIdAndDelete(friendship._id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- List my friends + pending requests ---
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.sub;

    // Accepted friends (either direction)
    const friends = await Friendship.find({
      status: 'accepted',
      $or: [{ requester: userId }, { recipient: userId }],
    })
      .populate('requester', 'name email picture username')
      .populate('recipient', 'name email picture username')
      .lean();

    // Incoming pending requests
    const incoming = await Friendship.find({
      status: 'pending',
      recipient: userId,
    })
      .populate('requester', 'name email picture username')
      .lean();

    // Outgoing pending requests
    const outgoing = await Friendship.find({
      status: 'pending',
      requester: userId,
    })
      .populate('recipient', 'name email picture username')
      .lean();

    res.json({ ok: true, friends, incoming, outgoing });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
