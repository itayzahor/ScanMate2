/**
 * @file routes/friends.js
 * Social graph routes. All routes require authentication (applied via router.use(auth)).
 *
 * Routes:
 *   GET    /friends/search       — Search users by username substring
 *   POST   /friends/request      — Send a friend request
 *   POST   /friends/:id/accept   — Accept a pending friend request
 *   POST   /friends/:id/reject   — Reject or cancel a pending friend request
 *   DELETE /friends/:id          — Unfriend (remove an accepted friendship)
 *   GET    /friends/             — Retrieve friends list, incoming requests, and outgoing requests
 */
const { Router } = require('express');
const auth = require('../middleware/auth');
const Friendship = require('../models/friendship');
const User = require('../models/user');

const router = Router();
router.use(auth);

/**
 * GET /friends/search  (requires auth)
 * Search for users by username (case-insensitive substring match).
 *
 * Query:   ?q=<string>  (minimum 2 characters)
 * Returns: { ok, users: User[] }  — up to 10 results, excluding the requesting user
 */
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

/**
 * POST /friends/request  (requires auth)
 * Send a friend request to another user.
 *
 * Body:    { recipientId: string }
 * Returns: { ok, friendship }
 *
 * - Returns 409 if already friends or a request is already pending.
 * - If a previously rejected request exists (in either direction), it is
 *   re-opened as a new pending request rather than creating a duplicate document.
 */
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

/**
 * POST /friends/:id/accept  (requires auth)
 * Accept an incoming pending friend request.
 * Only the recipient of the request is allowed to accept it.
 *
 * Returns: { ok, friendship }
 */
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

/**
 * POST /friends/:id/reject  (requires auth)
 * Reject or cancel a pending friend request.
 * Either the requester (cancel) or the recipient (decline) may call this.
 * The Friendship document is deleted on rejection.
 *
 * Returns: { ok: true }
 */
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

/**
 * DELETE /friends/:id  (requires auth)
 * Remove an existing accepted friendship.
 * Either party may unfriend the other.
 *
 * Returns: { ok: true }
 */
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

/**
 * GET /friends/  (requires auth)
 * Retrieve the full social graph for the authenticated user.
 *
 * Returns: {
 *   ok,
 *   friends:  Friendship[],  // accepted in either direction (populated)
 *   incoming: Friendship[],  // pending requests sent TO the user
 *   outgoing: Friendship[],  // pending requests sent BY the user
 * }
 */
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
