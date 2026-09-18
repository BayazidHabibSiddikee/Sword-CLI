import { speak } from '../voice.js';
import type { AgentTool } from '../types.js';

const argText = (args: Record<string, unknown>, key: string): string | undefined =>
  typeof args[key] === 'string' ? (args[key] as string) : undefined;

export const voiceTools: AgentTool[] = [
  {
    name: 'speak',
    description:
      'Speak a short status or message out loud using the session\'s character voice (TTS). Returns the generated wav path. Use for notifications: task started, tool finished, final answer summary, errors. Keep it under ~400 chars.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to speak' },
        voice: { type: 'string', description: 'Optional espeak-ng voice override (e.g. en-gb, ja, de)' },
        say: { type: 'boolean', description: 'Default true: attempt audio playback. false = generate wav only.' },
      },
      required: ['text'],
    },
    source: 'builtin',
    async execute(args, ctx) {
      const text = argText(args, 'text');
      if (!text?.trim()) return { ok: false, text: 'speak: "text" is required' };
      const voice = argText(args, 'voice') ?? ctx.voice ?? 'en-gb';
      const say = args.say === undefined ? true : args.say === true;
      const result = await speak(text.trim(), voice, { say, workdir: ctx.workdir });
      return { ok: result.ok, text: result.text };
    },
  },
];
