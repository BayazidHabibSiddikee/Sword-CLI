import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../db/index.js';
import { hasProvider } from '../providers/index.js';
import { isPlatform } from '@swordcli/shared/types.js';

export const providersRouter = Router();

providersRouter.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT platform, COUNT(*) as model_count
    FROM models
    GROUP BY platform
  `).all() as { platform: string; model_count: number }[];

  const result = rows.map(r => {
    const platform = r.platform as string;
    return {
      id: platform,
      name: platform,
      modelCount: r.model_count,
      // `models.platform` is a plain TEXT column, so a row can hold a platform
      // this build no longer knows about (e.g. one dropped by a later migration).
      // Narrow before probing the provider registry; unknown platforms report
      // `enabled: false` instead of crashing the route.
      enabled: isPlatform(platform) ? hasProvider(platform) : false,
    };
  });

  res.json(result);
});
