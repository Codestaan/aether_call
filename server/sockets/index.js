import crypto from 'crypto';
import { Meeting } from '../models/Meeting.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { ROOM_ID_REGEX, hashToken, safeEqual } from '../utils/ids.js';

const MAX_PARTICIPANTS = Number(process.env.MAX_PARTICIPANTS) || 6;
const PERSIST_CHAT = process.env.PERSIST_CHAT !== 'false';
const CHAT_HISTORY_LIMIT = 50;

/**
 * In-memory live state. MongoDB holds meeting metadata; who is currently connected lives here.
 * (Scaling to multiple server instances would need the Socket.io Redis adapter + shared state.)
 * rooms: roomId -> { id, hostId, participants: Map<socketId, peer>, waiting: Map<socketId, {id,name}> }
 */
const rooms = new Map();

const peerView = (p) => ({ id: p.id, name: p.name, isHost: p.isHost, audio: p.audio, video: p.video });
const waitingView = (room) => [...room.waiting.values()].map(({ id, name }) => ({ id, name }));
const cleanName = (n) =>
  String(n ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 40);

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { id: roomId, hostId: null, participants: new Map(), waiting: new Map() });
  }
  return rooms.get(roomId);
}

export function registerSocketHandlers(io) {
  const pushWaitingList = (room) => {
    if (room.hostId) io.to(room.hostId).emit('waiting:update', waitingView(room));
  };

  /** Moves a socket into the main room and returns what it needs to start calling. */
  async function admit(socket, room, isHost) {
    const existing = [...room.participants.values()].map(peerView);
    const me = { id: socket.id, name: socket.data.name, isHost, audio: true, video: true };
    room.participants.set(socket.id, me);
    socket.data.status = 'admitted';
    socket.data.isHost = isHost;
    socket.join(room.id);
    socket.to(room.id).emit('peer:joined', peerView(me));

    // Fire-and-forget bookkeeping; never block a join on analytics
    Meeting.updateOne(
      { roomId: room.id },
      { $inc: { totalJoined: 1 }, $max: { peakParticipants: room.participants.size } }
    ).catch(() => {});
    Meeting.updateOne({ roomId: room.id, startedAt: null }, { startedAt: new Date() }).catch(() => {});

    let history = [];
    if (PERSIST_CHAT) {
      const docs = await ChatMessage.find({ roomId: room.id })
        .sort({ createdAt: -1 })
        .limit(CHAT_HISTORY_LIMIT)
        .lean()
        .catch(() => []);
      history = docs.reverse().map((d) => ({
        id: d.messageId, from: null, name: d.senderName, text: d.text, ts: d.createdAt.getTime(),
      }));
    }
    return { you: peerView(me), peers: existing, history, waiting: isHost ? waitingView(room) : [] };
  }

  function leaveRoom(socket) {
    const { roomId } = socket.data;
    if (!roomId) return;
    socket.data.roomId = null;
    socket.data.status = null;
    const room = rooms.get(roomId);
    if (!room) return;

    if (room.waiting.delete(socket.id)) pushWaitingList(room);
    if (room.participants.delete(socket.id)) {
      socket.to(roomId).emit('peer:left', { id: socket.id });
    }
    if (room.hostId === socket.id) room.hostId = null;

    if (room.participants.size === 0) {
      Meeting.updateOne({ roomId }, { endedAt: new Date() }).catch(() => {});
      if (room.waiting.size === 0) rooms.delete(roomId);
    }
  }

  io.on('connection', (socket) => {
    socket.data = { roomId: null, name: '', status: null, isHost: false, chatTimes: [] };

    // Wrapper: an uncaught error inside a handler would crash the whole Node process.
    const on = (event, handler) =>
      socket.on(event, async (...args) => {
        try {
          await handler(...args);
        } catch (err) {
          console.error(`[socket] "${event}" failed:`, err);
          const ack = args[args.length - 1];
          if (typeof ack === 'function') ack({ ok: false, error: 'Something went wrong' });
        }
      });
    const reply = (ack, data) => typeof ack === 'function' && ack(data);
    const currentRoom = () => (socket.data.roomId ? rooms.get(socket.data.roomId) : null);
    const asObject = (v) => (v && typeof v === 'object' ? v : {});

    // ---- Join: hosts enter directly, everyone else lands in the waiting room ----
    on('room:join', async (payload, ack) => {
      const { roomId, name, hostToken } = asObject(payload);
      const displayName = cleanName(name);
      if (typeof roomId !== 'string' || !ROOM_ID_REGEX.test(roomId)) {
        return reply(ack, { ok: false, error: 'Invalid meeting code' });
      }
      if (!displayName) return reply(ack, { ok: false, error: 'Please enter your name' });
      if (socket.data.roomId) return reply(ack, { ok: false, error: 'Already in a meeting' });

      const meeting = await Meeting.findOne({ roomId }).lean();
      if (!meeting) return reply(ack, { ok: false, error: 'This meeting does not exist' });

      const isHost = typeof hostToken === 'string' && safeEqual(hashToken(hostToken), meeting.hostTokenHash);
      const room = getRoom(roomId);
      socket.data.roomId = roomId;
      socket.data.name = displayName;

      if (isHost) {
        // Host opened the link in a second tab/device: the newest connection wins
        const prev = room.hostId && room.hostId !== socket.id ? io.sockets.sockets.get(room.hostId) : null;
        if (prev) {
          prev.emit('room:replaced');
          prev.disconnect(true);
        }
        room.hostId = socket.id;
        const result = await admit(socket, room, true);
        return reply(ack, { ok: true, status: 'admitted', ...result });
      }

      if (room.participants.size >= MAX_PARTICIPANTS) {
        socket.data.roomId = null;
        return reply(ack, { ok: false, error: 'This meeting is full' });
      }
      room.waiting.set(socket.id, { id: socket.id, name: displayName });
      socket.data.status = 'waiting';
      reply(ack, { ok: true, status: 'waiting' });
      pushWaitingList(room); // the host is notified instantly (and sees it on joining if absent)
    });

    // ---- Host actions: admit / deny ----
    const hostOnly = () => {
      const room = currentRoom();
      return room && socket.data.isHost && room.hostId === socket.id ? room : null;
    };

    async function admitGuest(room, guestId) {
      const guest = room.waiting.get(guestId);
      const guestSocket = io.sockets.sockets.get(guestId);
      if (!guest || !guestSocket) {
        room.waiting.delete(guestId);
        return false;
      }
      if (room.participants.size >= MAX_PARTICIPANTS) return 'full';
      room.waiting.delete(guestId);
      const payload = await admit(guestSocket, room, false);
      guestSocket.emit('lobby:admitted', payload);
      return true;
    }

    on('room:admit', async (payload, ack) => {
      const room = hostOnly();
      if (!room) return reply(ack, { ok: false, error: 'Only the host can do that' });
      const result = await admitGuest(room, asObject(payload).id);
      pushWaitingList(room);
      reply(ack, result === 'full' ? { ok: false, error: 'The meeting is full' } : { ok: true });
    });

    on('room:admitAll', async (_payload, ack) => {
      const room = hostOnly();
      if (!room) return reply(ack, { ok: false, error: 'Only the host can do that' });
      for (const id of [...room.waiting.keys()]) {
        if ((await admitGuest(room, id)) === 'full') break;
      }
      pushWaitingList(room);
      reply(ack, { ok: true });
    });

    on('room:deny', (payload, ack) => {
      const room = hostOnly();
      if (!room) return reply(ack, { ok: false, error: 'Only the host can do that' });
      const id = asObject(payload).id;
      if (room.waiting.delete(id)) {
        const guestSocket = io.sockets.sockets.get(id);
        if (guestSocket) {
          guestSocket.data.roomId = null; // lets them knock again if they want
          guestSocket.data.status = null;
          guestSocket.emit('lobby:denied');
        }
      }
      pushWaitingList(room);
      reply(ack, { ok: true });
    });

    // ---- WebRTC signaling relay (offer / answer / ICE), only between admitted peers ----
    on('signal', (payload) => {
      const { to, data } = asObject(payload);
      const room = currentRoom();
      if (!room || !data || !room.participants.has(socket.id) || !room.participants.has(to)) return;
      io.to(to).emit('signal', { from: socket.id, data });
    });

    // ---- Mic / camera state so tiles can show muted badges and avatars ----
    on('media:state', (payload) => {
      const room = currentRoom();
      const me = room?.participants.get(socket.id);
      if (!me) return;
      const { audio, video } = asObject(payload);
      me.audio = Boolean(audio);
      me.video = Boolean(video);
      socket.to(room.id).emit('peer:media', { id: socket.id, audio: me.audio, video: me.video });
    });

    // ---- Chat ----
    on('chat:message', async (payload, ack) => {
      const room = currentRoom();
      const me = room?.participants.get(socket.id);
      if (!me) return reply(ack, { ok: false, error: 'Join the meeting to chat' });

      const text = String(asObject(payload).text ?? '').trim().slice(0, 1000);
      if (!text) return reply(ack, { ok: false, error: 'Empty message' });

      // Simple flood control: max 10 messages per 10 seconds
      const now = Date.now();
      socket.data.chatTimes = socket.data.chatTimes.filter((t) => now - t < 10_000);
      if (socket.data.chatTimes.length >= 10) return reply(ack, { ok: false, error: 'Slow down a little' });
      socket.data.chatTimes.push(now);

      const message = { id: crypto.randomUUID(), from: socket.id, name: me.name, text, ts: now };
      io.to(room.id).emit('chat:message', message);
      reply(ack, { ok: true });

      if (PERSIST_CHAT) {
        ChatMessage.create({ roomId: room.id, messageId: message.id, senderName: me.name, text })
          .catch((err) => console.error('Chat persist failed:', err.message));
      }
    });

    socket.on('disconnect', () => leaveRoom(socket));
  });
}
