import gTTS from 'gtts';
import player from 'play-sound';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const audioPlayer = player({});

export function speak(text) {
  return new Promise((resolve) => {
    try {
      const tts = new gTTS(text, 'en');
      const filepath = join(tmpdir(), 'swordcli-tts.mp3');
      tts.save(filepath, function (err) {
        if (err) return resolve();
        audioPlayer.play(filepath, () => resolve());
      });
    } catch {
      resolve();
    }
  });
}
