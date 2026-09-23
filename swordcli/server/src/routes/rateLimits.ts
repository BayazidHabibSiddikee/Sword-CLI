import { Router, type Request, type Response } from 'express';
import { getDb } from '../db/index.js';

export const rateLimitRouter = Router();

// GET /api/rate-limits/summary — overall stats for today
rateLimitRouter.get('/summary', (_req: Request, res: Response) => {
  const db = getDb();
  const sinceToday = new Date();
  sinceToday.setHours(0, 0, 0, 0);

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_requests,
      SUM(CASE WHEN kind = 'tokens' THEN tokens ELSE 0 END) as total_tokens,
      MIN(created_at_ms) as first_request_ms,
      MAX(created_at_ms) as last_request_ms
    FROM rate_limit_usage
    WHERE created_at >= ?
  `).get(sinceToday.toISOString().slice(0, 19).replace('T', ' ')) as any;

  res.json({
    totalRequests: stats.total_requests ?? 0,
    totalTokens: stats.total_tokens ?? 0,
    firstRequestAt: stats.first_request_ms ?? null,
    lastRequestAt: stats.last_request_ms ?? null,
  });
});

// GET /api/rate-limits/by-provider — requests per provider (last hour)
rateLimitRouter.get('/by-provider', (_req: Request, res: Response) => {
  const db = getDb();
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  const rows = db.prepare(`
    SELECT platform, model_id,
           COUNT(CASE WHEN kind='request' THEN 1 END) as request_count,
           SUM(CASE WHEN kind='tokens' THEN tokens ELSE 0 END) as token_count
    FROM rate_limit_usage
    WHERE created_at_ms > ?
    GROUP BY platform, model_id
    ORDER BY request_count DESC
    LIMIT 30
  `).all(oneHourAgo) as any[];

  // Merge same platform+model (in case of multiple keys)
  const map = new Map<string, { platform: string; model: string; requests: number; tokens: number }>();
  for (const r of rows) {
    const key = `${r.platform}|${r.model_id}`;
    const existing = map.get(key);
    if (existing) {
      existing.requests += r.request_count;
      existing.tokens += r.token_count;
    } else {
      map.set(key, { platform: r.platform, model: r.model_id, requests: r.request_count, tokens: r.token_count });
    }
  }

  res.json(Array.from(map.values()));
});

// GET /api/rate-limits/model/:id — rate limit info for a specific model (rpm/tpm limits + usage)
rateLimitRouter.get('/model/:platform/:modelId', (req: Request, res: Response) => {
  const { platform, modelId } = req.params;
  const db = getDb();

  // Get the model's configured limits
  const modelInfo = db.prepare(
    'SELECT rpm_limit, tpm_limit, tpd_limit, enabled FROM models WHERE platform = ? AND model_id = ?'
  ).get(platform, modelId) as { rpm_limit: number | null; tpm_limit: number | null; tpd_limit: number | null; enabled: number } | undefined;

  // Get usage in the last hour
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const usage = db.prepare(`
    SELECT
      COUNT(CASE WHEN kind='request' THEN 1 END) as requests,
      SUM(CASE WHEN kind='tokens' THEN tokens ELSE 0 END) as tokens
    FROM rate_limit_usage
    WHERE platform = ? AND model_id = ? AND created_at_ms > ?
  `).get(platform, modelId, oneHourAgo) as { requests: number; tokens: number } | undefined;

  const rpm = modelInfo?.rpm_limit ?? null;
  const tpm = modelInfo?.tpm_limit ?? null;

  res.json({
    platform,
    model: modelId,
    enabled: modelInfo?.enabled ?? false,
    limits: {
      rpm: rpm ?? null,
      tpm: tpm ?? null,
    },
    usage: {
      requestsLastHour: usage?.requests ?? 0,
      tokensLastHour: usage?.tokens ?? 0,
    },
    remaining: {
      rpmRemaining: rpm !== null ? Math.max(0, rpm - (usage?.requests ?? 0)) : null,
      tpmRemaining: tpm !== null ? Math.max(0, tpm - (usage?.tokens ?? 0)) : null,
    },
  });
});
