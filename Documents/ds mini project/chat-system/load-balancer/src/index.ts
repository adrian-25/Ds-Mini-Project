import express from 'express';
import Redis from 'ioredis';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
app.use(cors());
app.use(express.json());

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
let redis: Redis | null = null;

// Try to connect to Redis, but proceed without it if unavailable
(function initRedis() {
  try {
    redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0, enableOfflineQueue: false });
    redis.connect().catch(() => { redis = null; });
  } catch {
    redis = null;
  }
})();

const SERVER_COUNTS_KEY = 'server:counts';
const SERVERS: Array<{ id: string; http: string; ws: string }> = [
  { id: 'server-1', http: 'http://localhost:4001', ws: 'ws://localhost:4001' },
  { id: 'server-2', http: 'http://localhost:4002', ws: 'ws://localhost:4002' },
];
let rrIndex = 0; // round-robin index for no-Redis fallback

const CHOOSE_SERVER_LUA = `
local zeros = redis.call('ZRANGEBYSCORE', KEYS[1], 0, 0)
if #zeros > 0 then
  local chosen = zeros[1]
  redis.call('ZINCRBY', KEYS[1], 1, chosen)
  return chosen
end
local min = redis.call('ZRANGE', KEYS[1], 0, 0)
if next(min) ~= nil then
  local chosen = min[1]
  redis.call('ZINCRBY', KEYS[1], 1, chosen)
  return chosen
end
return nil
`;
let chooseServerSha: string | null = null;

async function loadScript(): Promise<void> {
  if (!redis) return;
  chooseServerSha = (await redis.script('LOAD', CHOOSE_SERVER_LUA)) as unknown as string;
}

async function chooseServer(): Promise<{ id: string; http: string; ws: string } | null> {
  // Fallback when Redis is not available
  if (!redis) {
    const chosen = SERVERS[rrIndex % SERVERS.length];
    rrIndex += 1;
    return chosen;
  }
  try {
    if (!chooseServerSha) await loadScript();
    const serverId = (await redis!.evalsha(chooseServerSha as string, 1, SERVER_COUNTS_KEY)) as string | null;
    if (!serverId) return null;
    const s = SERVERS.find((x) => x.id === serverId) || null;
    return s;
  } catch (err: any) {
    if (String(err?.message || '').includes('NOSCRIPT')) {
      await loadScript();
      const serverId = (await redis!.evalsha(chooseServerSha as string, 1, SERVER_COUNTS_KEY)) as string | null;
      if (!serverId) return null;
      const s = SERVERS.find((x) => x.id === serverId) || null;
      return s;
    }
    // If Redis errors, fall back to round-robin
    const chosen = SERVERS[rrIndex % SERVERS.length];
    rrIndex += 1;
    return chosen;
  }
}

app.get('/route', async (_req, res) => {
  try {
    const addr = await chooseServer();
    if (!addr) return res.status(503).json({ error: 'No backend servers available' });
    return res.json({ serverId: addr.id, http: addr.http, ws: addr.ws });
  } catch {
    return res.status(500).json({ error: 'Routing failed' });
  }
});

// Proxy frontend dev server (Vite) on localhost:5173 so one URL is used in dev
app.use('/', createProxyMiddleware({ target: 'http://localhost:5173', changeOrigin: true, ws: true }));

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`Load balancer routing service on :${port}`);
});
