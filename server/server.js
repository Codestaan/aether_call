import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { connectDB } from './config/db.js';
import meetingRoutes from './routes/meetings.js';
import { registerSocketHandlers } from './sockets/index.js';

const PORT = process.env.PORT || 5000;

// Allowed frontends, e.g. "https://aether.vercel.app,http://localhost:5173"
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    // No Origin header = curl / health checks / server-to-server
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`Origin ${origin} is not allowed by CORS`));
  },
};

const app = express();
app.set('trust proxy', 1); // Render/Railway sit behind a proxy; needed for correct client IPs
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'up' : 'down' })
);
app.use('/api/meetings', meetingRoutes);
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
  pingInterval: 25_000,
  pingTimeout: 20_000,
  maxHttpBufferSize: 1e5, // 100 KB is plenty for SDP + chat
});
registerSocketHandlers(io);

await connectDB();
server.listen(PORT, () => console.log(`Server listening on :${PORT} (origins: ${allowedOrigins.join(', ')})`));

// Graceful shutdown so Render/Railway deploys don't drop sockets abruptly
const shutdown = (signal) => {
  console.log(`${signal} received, shutting down`);
  io.close(() => server.close(() => mongoose.connection.close().then(() => process.exit(0))));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
