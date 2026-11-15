import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  messageId: { type: String, required: true },
  senderName: { type: String, required: true },
  text: { type: String, required: true, maxlength: 1000 },
  // TTL index: chat history is kept for 7 days, then deleted automatically
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 7 },
});

export const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
