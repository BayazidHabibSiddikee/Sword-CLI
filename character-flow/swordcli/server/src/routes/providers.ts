import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../db/index.js';
import { hasProvider } from '../providers/index.js';

export const providersRouter = Router();

providersRouter.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT platform, COUNT(*) as model_count
    FROM models
    GROUP BY platform
  `).all() as { platform: string; model_count: number }[];

  const result = rows.map(r => ({
    id: r.platform,
    name: r.platform,
    modelCount: r.model_count,
    enabled: hasProvider(r.platform as any),
  }));

  res.json(result);
});
