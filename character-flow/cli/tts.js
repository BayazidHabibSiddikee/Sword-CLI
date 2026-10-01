// Terminal bell only — deliberately dependency-free.
//
// This used to render the text to an MP3 with gTTS and then throw the file
// away: playAudio() rang the bell and resolved, so the network call and the
// dependency bought nothing. It also dragged in a critical form-data advisory
// (gtts → request) with no upstream fix, so the MP3 step is gone; if real
// speech is wanted again, add a player that actually plays the audio.

/** Ring the terminal bell. Never throws, never touches the network. */
export function speak() {
  try { process.stdout.write('\x07'); } catch { /* not a TTY */ }
  return Promise.resolve();
}
