import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import Redis from 'ioredis';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const port = Number(process.env.PORT || 4001);
const serverId = process.env.SERVER_ID || 'server-unknown';
const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
const redis = new Redis(redisUrl);

// Ensure server exists in counts ZSET
const SERVER_COUNTS_KEY = 'server:counts';
(async () => {
  try {
    await redis.zadd(SERVER_COUNTS_KEY, 'NX', 0, serverId);
  } catch {}
})();

app.get('/health', (_req, res) => {
  res.json({ ok: true, serverId });
});

const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*'}
});

io.on('connection', (socket) => {
  redis.zincrby(SERVER_COUNTS_KEY, 1, serverId).catch(() => {});
  socket.on('disconnect', () => {
    redis.zincrby(SERVER_COUNTS_KEY, -1, serverId).catch(() => {});
  });
});

httpServer.listen(port, () => {
  console.log(`Backend ${serverId} listening on :${port}`);
});

