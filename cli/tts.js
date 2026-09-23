import gTTS from 'gtts';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function playAudio(file) {
  process.stdout.write('\x07'); // Terminal bell
  return new Promise((resolve) => resolve());
}

export function speak(text) {
  return new Promise((resolve) => {
    try {
      const tts = new gTTS(text, 'en');
      const filepath = join(tmpdir(), 'swordcli-tts.mp3');
      tts.save(filepath, function (err) {
        if (err) return resolve();
        playAudio(filepath).then(resolve);
      });
    } catch {
      resolve();
    }
  });
}
