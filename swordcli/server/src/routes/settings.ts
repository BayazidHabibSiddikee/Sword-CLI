import { Router } from 'express';
import type { Request, Response } from 'express';
import { getUnifiedApiKey, regenerateUnifiedKey } from '../db/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = path.join(__dirname, '..', '..', 'data', 'settings.json');

function loadSettings(): any {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return {};
    const content = fs.readFileSync(SETTINGS_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function saveSettings(settings: any): void {
  const dir = path.dirname(SETTINGS_FILE);
  if (!fs.existsSync(path.dirname(SETTINGS_FILE))) {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

export const settingsRouter = Router();

// Get all settings
settingsRouter.get('/', (_req: Request, res: any) => {
  const settings = loadSettings();
  res.json(settings);
});

// Save all settings
settingsRouter.put('/', (req: Request, res: Response) => {
  try {
    saveSettings(req.body);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get the unified API key
settingsRouter.get('/api-key', (_req: Request, res: Response) => {
  res.json({ apiKey: getUnifiedApiKey() });
});

// Regenerate the unified API key
settingsRouter.post('/api-key/regenerate', (_req: Request, res: Response) => {
  const newKey = regenerateUnifiedKey();
  res.json({ apiKey: newKey });
});

// Test SMTP
settingsRouter.post('/test-smtp', async (req: Request, res: Response) => {
  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: req.body.host,
      port: Number(req.body.port),
      secure: req.body.secure,
      auth: { user: req.body.user, pass: req.body.pass },
    });
    await transporter.verify();
    res.json({ ok: true, message: 'SMTP connection successful' });
  } catch (error: any) {
    res.json({ ok: false, message: error.message });
  }
});

// Test IMAP
settingsRouter.post('/test-imap', async (req: Request, res: Response) => {
  try {
    const Imap = (await import('imap')).default;
    const imap = new Imap({
      host: req.body.host,
      port: Number(req.body.port),
      tls: req.body.tls !== false,
      auth: { user: req.body.user, pass: req.body.pass },
    });
    await new Promise((resolve, reject) => {
      imap.once('error', reject);
      imap.once('ready', () => {
        imap.end();
        resolve(undefined);
      });
      imap.connect();
    });
    res.json({ ok: true, message: 'IMAP connection successful' });
  } catch (error: any) {
    res.json({ ok: false, message: error.message });
  }
});

// Test Telegram
settingsRouter.post('/test-telegram', async (req: Request, res: Response) => {
  try {
    const res = await fetch(`https://api.telegram.org/bot${req.body.botToken}/getMe`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.description);
    res.json({ ok: true, message: `Bot connected: @${data.result.username}` });
  } catch (error: any) {
    res.json({ ok: false, message: error.message });
  }
});

// Save settings
settingsRouter.put('/', (req: Request, res: Response) => {
  try {
    const settings = req.body;
    const existing = loadSettings();
    const merged = { ...existing, ...settings };
    saveSettings(merged);
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
