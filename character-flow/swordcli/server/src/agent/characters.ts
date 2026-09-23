/**
 * Character personas for the agent. Loads the 10-character roster from
 * server/data/characters-voices.json and pairs each with a persona system
 * prompt (from data/characters.json when the id matches) + an espeak-ng
 * voice.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listCharacterVoices, voiceForCharacter, type CharacterVoice } from './voice.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHARS_JSON = path.resolve(__dirname, '../../../data/characters.json');
let charCache: Record<string, unknown> | null | undefined;

function charactersById(): Record<string, { name?: string; system_prompt?: string }> {
  // undefined = not loaded yet; null = loaded but empty/invalid.
  if (charCache === undefined) {
    charCache = null;
    if (existsSync(CHARS_JSON)) {
      try {
        const parsed = JSON.parse(readFileSync(CHARS_JSON, 'utf8')) as unknown[];
        const byId: Record<string, { name?: string; system_prompt?: string }> = {};
        for (const c of parsed) {
          const rec = c as { id?: string; name?: string; system_prompt?: string };
          if (rec?.id) byId[rec.id] = rec;
        }
        charCache = byId;
      } catch {
        charCache = null;
      }
    }
  }
  return (charCache as Record<string, { name?: string; system_prompt?: string }> | null) ?? {};
}

export interface AgentCharacter extends CharacterVoice {
  systemPrompt: string | null;
}

/** The 10-persona roster: voice config joined with persona prompts. */
export function characterRoster(): AgentCharacter[] {
  const byId = charactersById();
  return listCharacterVoices().map((cv) => {
    const c = byId[cv.id];
    return { ...cv, systemPrompt: c?.system_prompt ?? null };
  });
}

/** Resolve a character by id or name (case-insensitive name match). */
export function resolveCharacter(ref: string | null | undefined): AgentCharacter | null {
  if (!ref) return null;
  const roster = characterRoster();
  const lower = ref.toLowerCase();
  return (
    roster.find((c) => c.id === ref || c.name.toLowerCase() === lower || c.id.toLowerCase() === lower) ?? null
  );
}

/** Build the persona block injected into the agent system prompt. */
export function characterSystemBlock(ref: string | null | undefined): string {
  const ch = resolveCharacter(ref);
  if (!ch) return '';
  const persona = ch.systemPrompt
    ? `\n## Persona\nYou are speaking and acting as ${ch.name} (voice: ${ch.voice}). Stay in character:\n${ch.systemPrompt.slice(0, 8000)}\n`
    : `\n## Persona\nYou are speaking and acting as ${ch.name} (voice: ${ch.voice}). Stay in character.\n`;
  return `## Character\nCharacter: ${ch.name} — ${ch.hint}\n${persona}`;
}

export { voiceForCharacter };
