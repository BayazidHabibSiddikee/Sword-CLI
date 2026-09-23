/**
 * Voice notifications — TTS via espeak-ng (writes a wav, optionally plays it
 * through paplay/aplay). Fail-soft: no audio device → still returns the wav
 * path; only true generation failure is ok:false.
 *
 * 10 characters × 10 voices live in server/data/characters-voices.json.
 */
import { execFile } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
export const CHARACTERS_VOICES_PATH = path.join(DATA_DIR, 'characters-voices.json');

export interface CharacterVoice {
  id: string;
  name: string;
  voice: string; // espeak-ng voice id, e.g. "en-gb"
  hint: string;
}

let cache: CharacterVoice[] | null = null;

export function listCharacterVoices(): CharacterVoice[] {
  if (cache) return cache;
  if (!existsSync(CHARACTERS_VOICES_PATH)) {
    cache = [];
    return cache;
  }
  try {
    const parsed = JSON.parse(readFileSync(CHARACTERS_VOICES_PATH, 'utf8')) as CharacterVoice[];
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function voiceForCharacter(characterId: string | null | undefined): CharacterVoice | null {
  const list = listCharacterVoices();
  if (characterId) {
    const found = list.find((c) => c.id === characterId || c.name.toLowerCase() === characterId.toLowerCase());
    if (found) return found;
  }
  return list[0] ?? null;
}

/**
 * Speak `text` in the given espeak-ng voice. Returns the wav path and whether
 * playback was attempted/succeeded. `say=false` generates only.
 */
export interface SpeakResult {
  ok: boolean;
  text: string;
  wav: string | null;
  played: boolean;
}

export function speak(text: string, voice: string, opts: { say?: boolean; workdir?: string } = {}): Promise<SpeakResult> {
  const say = opts.say ?? true;
  const dir = opts.workdir ?? DATA_DIR;
  const safe = createHash('sha1').update(`${voice}:${text}`).digest('hex').slice(0, 10);
  const wav = path.join(dir, `voice-${safe}.wav`);

  return new Promise((resolve) => {
    execFile(
      'espeak-ng',
      ['-v', voice, '-w', wav, text.slice(0, 400)],
      { timeout: 15_000 },
      (genErr) => {
        if (genErr) {
          resolve({ ok: false, text: `espeak-ng failed: ${genErr.message}`, wav: null, played: false });
          return;
        }
        if (!say) {
          resolve({ ok: true, text: `Spoken to ${wav}`, wav, played: false });
          return;
        }
        // Play through the first available sink (paplay, aplay, then ffplay).
        tryPlay(wav, ['paplay', 'aplay'], (played, err) => {
          resolve({
            ok: true,
            text: played ? `Played "${text.slice(0, 60)}…" (${voice})` : `Generated ${wav} (no audio sink: ${err})`,
            wav,
            played,
          });
        });
      },
    );
  });
}

function tryPlay(wav: string, candidates: string[], done: (played: boolean, err?: string) => void): void {
  let i = 0;
  const next = (): void => {
    if (i >= candidates.length) {
      done(false, 'no audio playback tool found');
      return;
    }
    const bin = candidates[i++];
    execFile(bin, [wav], { timeout: 30_000 }, (err) => {
      if (err) next();
      else done(true);
    });
  };
  next();
}

/** espeak-ng available? (cached) */
let espeakOk: boolean | null = null;
export function espeakAvailable(): Promise<boolean> {
  if (espeakOk !== null) return Promise.resolve(espeakOk);
  return new Promise((resolve) => {
    execFile('which', ['espeak-ng'], (err, out) => {
      espeakOk = !err && Boolean((out as string).trim());
      resolve(espeakOk);
    });
  });
}
