import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_FILE = path.join(process.cwd(), '.flow', 'providers.json');
let memoryProviders = null;

export function providersPath() {
  return process.env.SWORD_PROVIDERS_FILE?.trim() || DEFAULT_FILE;
}

export function loadProviders() {
  if (memoryProviders) return memoryProviders;
  const file = providersPath();
  try {
    const raw = fs.readFileSync(file, 'utf8');
    memoryProviders = JSON.parse(raw);
  } catch {
    memoryProviders = [];
  }
  return memoryProviders;
}

export function saveProviders(list) {
  const file = providersPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(list, null, 2));
  memoryProviders = list;
}

export function addProvider({ name, baseUrl, apiKey, model }) {
  const list = loadProviders();
  list.push({ id: `${name}-${Date.now()}`, name: String(name).trim(), baseUrl: String(baseUrl).trim().replace(/\/+$/, ''), apiKey: String(apiKey), model: String(model || '').trim() || undefined });
  saveProviders(list);
  return list;
}

export function removeProvider(id) {
  const list = loadProviders().filter(p => p.id !== id);
  saveProviders(list);
  return list;
}

export function listProviders() {
  return loadProviders();
}
