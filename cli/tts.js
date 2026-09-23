import gTTS from 'gtts';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function playAudio(file) {
  return new Promise((resolve) => {
    // mpg123 is perfectly safe for CLI background audio, does not grab TTY
    const child = spawn('mpg123', ['-q', file], { stdio: 'ignore' });
    child.on('close', resolve);
    child.on('error', () => {
       // fallback to mpv
       const fallback = spawn('mpv', ['--no-terminal', file], { stdio: 'ignore' });
       fallback.on('close', resolve);
       fallback.on('error', resolve);
    });
  });
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
