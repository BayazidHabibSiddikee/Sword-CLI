// Channel connections over HTTP — save a destination (Telegram chat, Discord or
// Slack webhook, generic webhook), verify it, and send a message to it.
//
// Secrets are write-only: a bot token may be sent in a create/update body but it
// is never echoed back. Reads return `hasSecret` instead.
import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  listChannels, saveChannel, removeChannel, verifyChannel, sendChannel,
} from '../services/channels.js';

export const channelsRouter = Router();

const connectionSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  platform: z.enum(['telegram', 'discord', 'slack', 'webhook']),
  label: z.string().max(80).optional(),
  agentId: z.string().max(64).optional(),
  target: z.string().min(1).max(500),
  secret: z.string().max(200).optional(),
});

const sendSchema = z.object({ text: z.string().min(1).max(16 * 1024) });

function fail(res: Response, status: number, message: string) {
  return res.status(status).json({ error: { message } });
}

channelsRouter.get('/', (_req: Request, res: Response) => {
  res.json({ connections: listChannels() });
});

channelsRouter.post('/', (req: Request, res: Response) => {
  const parsed = connectionSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'Expected { platform, target } and optionally { label, agentId, secret }');
  try {
    res.status(201).json({ connection: saveChannel(parsed.data as never) });
  } catch (error) {
    return fail(res, 400, (error as Error).message);
  }
});

channelsRouter.delete('/:id', (req: Request, res: Response) => {
  if (!removeChannel(String(req.params.id))) return fail(res, 404, 'Connection not found');
  res.json({ deleted: true });
});

channelsRouter.post('/:id/verify', async (req: Request, res: Response) => {
  try {
    res.json(await verifyChannel(String(req.params.id)));
  } catch (error) {
    return fail(res, 404, (error as Error).message);
  }
});

channelsRouter.post('/:id/send', async (req: Request, res: Response) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, 'Expected { text }');
  try {
    res.json(await sendChannel(String(req.params.id), parsed.data.text));
  } catch (error) {
    // A failed delivery (bad token, Telegram 4xx, webhook 5xx) is a 502: the
    // request was valid, the upstream destination refused it.
    const message = (error as Error).message;
    return fail(res, message === 'connection not found' ? 404 : 502, message);
  }
});