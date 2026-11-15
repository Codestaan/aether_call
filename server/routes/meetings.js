import { Router } from 'express';
import { Meeting } from '../models/Meeting.js';
import { ROOM_ID_REGEX, generateHostToken, generateRoomId, hashToken } from '../utils/ids.js';

const router = Router();

// POST /api/meetings -> create an instant meeting. Returns the room ID and a secret host token.
router.post('/', async (_req, res, next) => {
  try {
    const hostToken = generateHostToken();
    for (let attempt = 0; attempt < 5; attempt++) {
      const roomId = generateRoomId();
      try {
        await Meeting.create({ roomId, hostTokenHash: hashToken(hostToken) });
        return res.status(201).json({ roomId, hostToken });
      } catch (err) {
        if (err.code !== 11000) throw err; // only retry on duplicate roomId
      }
    }
    res.status(500).json({ error: 'Could not allocate a meeting code. Try again.' });
  } catch (err) {
    next(err);
  }
});

// GET /api/meetings/:roomId -> does this meeting exist? (used by the join screen)
router.get('/:roomId', async (req, res, next) => {
  try {
    const { roomId } = req.params;
    if (!ROOM_ID_REGEX.test(roomId)) return res.status(400).json({ error: 'Invalid meeting code' });
    const exists = await Meeting.exists({ roomId });
    if (!exists) return res.status(404).json({ error: 'Meeting not found' });
    res.json({ roomId, exists: true });
  } catch (err) {
    next(err);
  }
});

export default router;
