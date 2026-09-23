// sword-server — minimal independent Sword backend. No freellmapi imports.
// GET_API remains untouched as a fallback; this server owns :3101 by default.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { getDb, getSetting } from './db.js';
import { api } from './routes/api.js';
import { openai } from './routes/openai.js';

const PORT = Number(process.env.SWORD_PORT || process.env.PORT || 3101);
const HOST = process.env.SWORD_HOST || process.env.HOST || '127.0.0.1';

getDb();
const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Bearer gate (single token, minted on first boot). Providers page + CLI + web use it.
// Health + landing stay open so `status` checks never need the token.
function gate(req, res, next) {
  if (req.path === '/' || req.path === '/health') return next();
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const expected = getSetting('api_token');
  const a = Buffer.from(token), b = Buffer.from(expected || '');
  const ok = a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
  if (!ok) return res.status(401).json({ success: false, error: { message: 'Invalid Sword token' } });
  next();
}

app.get('/', (req, res) => res.json({ name: 'sword-server', version: '1.0.0', docs: '/health' }));
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use(gate);
app.use('/api', api);
app.use('/v1', openai);

app.listen(PORT, HOST, () => {
  console.log(`[sword-server] http://${HOST}:${PORT}  (data: ${process.env.SWORD_DB_FILE || 'sword-server/data/sword.db'})`);
  console.log(`[sword-server] token: ${(getSetting('api_token') || '').slice(0, 12)}... (full token printed on first boot; export SWORD_TOKEN)`);
});
