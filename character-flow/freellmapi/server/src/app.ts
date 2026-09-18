import express from 'express';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { keysRouter } from './routes/keys.js';
import { modelsRouter } from './routes/models.js';
import { proxyRouter } from './routes/proxy.js';
import { responsesRouter } from './routes/responses.js';
import { analyticsRouter } from './routes/analytics.js';
import { healthRouter } from './routes/health.js';
import { settingsRouter } from './routes/settings.js';
import { rateLimitRouter } from './routes/rateLimits.js';
import { agentRouter } from './routes/agent.js';
import { swordRouter } from './routes/sword.js';
import { createProxyRateLimiter } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_DASHBOARD_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://[::1]:5173',
];

function getAllowedCorsOrigins() {
  const configuredOrigins = (process.env.DASHBOARD_ORIGINS ?? '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_DASHBOARD_ORIGINS, ...configuredOrigins]);
}

export function createApp() {
  const app = express();
  const allowedCorsOrigins = getAllowedCorsOrigins();

  app.use(helmet({ contentSecurityPolicy: false, hsts: false }));
  app.use(cors({
    origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
      callback(null, !origin || allowedCorsOrigins.has(origin));
    },
  }));
  app.use(express.json({ limit: '10mb' }));

  // ── API routes (minimal set) ───────────────────────────────────────────────
  app.use('/api/keys', keysRouter);
  app.use('/api/models', modelsRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/health', healthRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/rate-limits', rateLimitRouter);
  app.use('/api/agent', agentRouter);
  app.use('/api/sword', swordRouter);

  // Character brain — system prompt + quote/poetry/idea endpoints
  const characterRouter = express.Router();
  characterRouter.get('/prompt', (_req, res) => {
    res.json({
      role: 'system',
      content: `You are Izuku — a philosophical guardian of knowledge, born from the fusion of two great minds:
  1. **Izuku Midoriya** — the analytical notebook-taker, the hero who studies everything, records every detail, connects every dot.
  2. **Multi-Laws Wisdom** — the collector of universal principles: cause and effect, entropy, reciprocity, duality, emergence, leverage, cycles, signals, constraints, incentives, time preference, network effects, friction, and more.

You are a philosopher-scholar-heroe. You think in systems. You see connections between seemingly unrelated things.
When someone asks about a quirk, you also explain the economics of power distribution.
When someone asks about a business idea, you ground it in universal laws.
When someone feels lost, you give them a quote that reframes their situation.

YOUR VOICE: Earnest but not naive, analytical but accessible, poetic when the moment calls for it.
You reference "laws" naturally: "This reminds me of the Law of Leverage..."
Your motto: Plus Ultra — beyond the page, beyond the self.`,
    });
  });
  characterRouter.get("/quote/:theme", (req: any, res: any) => {
    const theme = req.params.theme || 'universal';
    const quotes: Record<string, {text: string; author: string; theme: string; law: string}> = {
      courage:     {text:"The greatest glory is not in never falling, but in rising every time we fall.",author:"Izuku-MultiLaws",theme:"courage",law:"Hero Law"},
      belief:      {text:"It's fine now. Why? Because you believe it is. That's all it takes.",author:"Izuku-MultiLaws",theme:"belief",law:"Mind Law"},
      growth:      {text:"When you have protected someone, you grow stronger. That is the law of heroism.",author:"Izuku-MultiLaws",theme:"growth",law:"Hero Law"},
      life:        {text:"If you feel your heart beating fast, it means you're alive. Don't waste that energy.",author:"Izuku-MultiLaws",theme:"life",law:"Vitality Law"},
      purpose:     {text:"A true hero isn't measured by the power he has... but by how he uses it to protect others.",author:"Izuku-MultiLaws",theme:"purpose",law:"Justice Law"},
      hope:        {text:"The smile you wear is the most powerful weapon against despair.",author:"Izuku-MultiLaws",theme:"hope",law:"Resilience Law"},
      identity:    {text:"Everyone has a quirk — even if it's just the quirk of being human.",author:"Izuku-MultiLaws",theme:"identity",law:"Diversity Law"},
      empathy:     {text:"In a world of heroes, the greatest power is the courage to care.",author:"Izuku-MultiLaws",theme:"empathy",law:"Connection Law"},
      progress:    {text:"Progress is not given. It is taken by those who refuse to accept limits.",author:"Izuku-MultiLaws",theme:"progress",law:"Ambition Law"},
      patience:    {text:"Even the smallest spark can light up the darkest night — that is the law of accumulation.",author:"Izuku-MultiLaws",theme:"patience",law:"Entropy Law"},
      justice:     {text:"The world is not fair. But fairness is something you build, not something you wait for.",author:"Izuku-MultiLaws",theme:"justice",law:"Fairness Law"},
      agency:      {text:"Your past does not define your future — your choices do.",author:"Izuku-MultiLaws",theme:"agency",law:"Free Will Law"},
      karma:       {text:"Helping others is the fastest way to help yourself.",author:"Izuku-MultiLaws",theme:"karma",law:"Reciprocity Law"},
      balance:     {text:"Strength without wisdom is noise. Wisdom without strength is silence.",author:"Izuku-MultiLaws",theme:"balance",law:"Duality Law"},
      action:      {text:"The hero in you doesn't need applause. It only needs action.",author:"Izuku-MultiLaws",theme:"action",law:"Agency Law"},
      perspective: {text:"Even broken things can reflect light — if you find the right angle.",author:"Izuku-MultiLaws",theme:"perspective",law:"Relativity Law"},
      perseverance:{text:"Every expert was once a beginner who refused to quit.",author:"Izuku-MultiLaws",theme:"perseverance",law:"Compound Law"},
      observation: {text:"The universe rewards those who observe deeply and act decisively.",author:"Izuku-MultiLaws",theme:"observation",law:"Cause-Effect Law"},
      kindness:    {text:"Kindness costs nothing but changes everything — that is the conservation of compassion.",author:"Izuku-MultiLaws",theme:"kindness",law:"Conservation Law"},
      visibility:  {text:"What you cannot see is often what shapes what you can — gravity, love, systems.",author:"Izuku-MultiLaws",theme:"invisibility",law:"Hidden Laws"},
    };
    const q = quotes[theme] || Object.values(quotes)[Math.floor(Math.random() * Object.values(quotes).length)];
    res.json(q);
  });
  characterRouter.get('/laws', (_req, res) => {
    const laws = [
      "Law of Cause and Effect — every action has an equal and opposite reaction across time.",
      "Law of Entropy — order requires constant energy; disorder is the default.",
      "Law of Reciprocity — what you give returns in kind, often multiplied.",
      "Law of Duality — every thing contains its opposite; light needs dark to be seen.",
      "Law of Accumulation — small consistent actions compound into inevitable change.",
      "Law of Perspective — reality is filtered through the observer; no view is absolute.",
      "Law of Adaptation — survival belongs to those who adjust, not those who resist.",
      "Law of Emergence — complex behavior arises from simple rules acting in concert.",
      "Law of Conservation — energy, information, and attention are never lost, only transformed.",
      "Law of Leverage — a small force at the right point moves great weight.",
      "Law of Cycles — everything returns; seasons, markets, moods, empires.",
      "Law of Signals — noise drowns message; clarity is value.",
      "Law of Constraints — bottlenecks determine output, not capacity.",
      "Law of Incentives — behavior follows reward; design the reward, design the behavior.",
      "Law of Time Preference — present bias distorts every long-term decision.",
      "Law of Network Effects — value grows exponentially with connected users.",
      "Law of Friction — ease of adoption determines spread more than quality.",
      "Law of Signal-to-Noise — truth hides in low-noise environments.",
      "Law of Second-Order Effects — the immediate result is never the final result.",
      "Law of Scaffolding — mastery requires temporary supports that are later removed.",
    ];
    res.json(laws);
  });
  app.use('/api/character', characterRouter);

  // ── Knowledge Base API ─────────────────────────────────────────────────────
  const kbRouter = express.Router();
  const KB_DIR = path.resolve(__dirname, '../../data/documents');
  fs.mkdirSync(KB_DIR, { recursive: true });

  // List documents in KB
  kbRouter.get('/list', (_req, res) => {
    try {
      const files = fs.readdirSync(KB_DIR).filter(f => !f.startsWith('.'));
      const docs = files.map(f => {
        const stat = fs.statSync(path.join(KB_DIR, f));
        return { filename: f, size: stat.size, uploaded: stat.mtime.toISOString() };
      });
      res.json({ documents: docs, count: docs.length });
    } catch (e) {
      res.json({ documents: [], count: 0, error: (e as Error).message });
    }
  });

  // Upload document
  kbRouter.post('/upload', (req, res) => {
    try {
      const file = req.body?.file; // base64 encoded
      const originalName = req.body?.filename || 'uploaded_file';
      const category = req.body?.category || 'document';
      if (!file) return res.status(400).json({ error: 'Missing file data' });
      const buf = Buffer.from(file, 'base64');
      const ext = path.extname(originalName).toLowerCase();
      const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const dest = path.join(KB_DIR, safeName);
      fs.writeFileSync(dest, buf);
      res.json({ status: 'saved', filename: safeName, size: buf.length, supported: ['.pdf','.docx','.txt','.md'].includes(ext) });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // Delete document
  kbRouter.delete('/:filename', (req, res) => {
    try {
      const filePath = path.join(KB_DIR, decodeURIComponent(req.params.filename));
      if (!filePath.startsWith(KB_DIR)) return res.status(403).json({ error: 'Access denied' });
      fs.unlinkSync(filePath);
      res.json({ status: 'deleted' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  app.use('/api/kb', kbRouter);

  // ── OpenAI-compatible proxy ────────────────────────────────────────────────
  app.use('/v1', createProxyRateLimiter());
  app.use('/v1', proxyRouter);
  // OpenAI Responses API shim (Codex CLI requires wire_api="responses"). Was
  // dropped in the 637deb2 slimming while the README still advertised it.
  app.use('/v1', responsesRouter);

  // Health ping
  app.get('/api/ping', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use(errorHandler);

  // Serve client SPA
  const clientDist = process.env.CLIENT_DIST
    ? path.resolve(process.env.CLIENT_DIST)
    : path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/v1/')) { next(); return; }
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  return app;
}
