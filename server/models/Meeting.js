import mongoose from 'mongoose';

const meetingSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  hostTokenHash: { type: String, required: true },
  // TTL index: meeting documents disappear after 30 days
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  peakParticipants: { type: Number, default: 0 },
  totalJoined: { type: Number, default: 0 },
});

export const Meeting = mongoose.model('Meeting', meetingSchema);
