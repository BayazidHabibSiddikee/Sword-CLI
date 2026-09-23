/**
 * video_edit — structured video operations via ffmpeg. The agent picks an op
 * and structured params; the ffmpeg command is built HERE (never free-form
 * shell from the model), and every path is confined to the session workdir.
 *
 * Ops: make_test_video | cut | concat | title | subtitles | extract_frames | probe
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { containPath, relativeLabel } from './file.js';
import type { AgentTool, ToolResult } from '../types.js';

const argText = (args: Record<string, unknown>, key: string): string | undefined =>
  typeof args[key] === 'string' ? (args[key] as string) : undefined;
const argNum = (args: Record<string, unknown>, key: string): number | undefined =>
  typeof args[key] === 'number' ? args[key] : undefined;

function containsForbiddenChars(s: string): boolean {
  // Structured values must never carry shell metacharacters — the ffmpeg
  // args are spawned (no shell), but subtitles/drawtext text is still a
  // filter-argument escape hazard.
  return /[;&|`$\\]/.test(s);
}

/** Escape a string for use inside an ffmpeg filter graph argument. */
function ffEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/,/g, '\\,');
}

/** Probe a media file; returns a human summary (duration, streams, size). */
export async function probeMedia(file: string): Promise<string> {
  const { out } = await runBin('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height', '-of', 'default=noprint_wrappers=1', file]);
  return out.trim() || '(no ffprobe output)';
}

function runBin(bin: string, args: string[], timeoutMs = 300_000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      const out = `${stdout ?? ''}${stderr ?? ''}`;
      resolve({ ok: !err, out: out.slice(-20_000) });
    });
  });
}

export const videoTools: AgentTool[] = [
  {
    name: 'video_edit',
    description: [
      'Structured video editing via ffmpeg. All file paths are relative to the workdir.',
      'Ops:',
      '- make_test_video {seconds?, width?, height?, fps?} — generate a test clip (testsrc + sine tone) so you can demo/verify other ops.',
      '- probe {input} — ffprobe summary (duration/streams).',
      '- cut {input, in, out} — trim a range (seconds, e.g. "0:05" or 30); re-encodes for frame accuracy.',
      '- concat {inputs[], output} — join clips in order (same codec/size needed; re-encodes).',
      '- title {input, text, pos?, fontsize?, duration_s?} — overlay a text title (pos: top|bottom|center).',
      '- subtitles {input, srt} — burn in an .srt caption file.',
      '- extract_frames {input, every_n?, out_prefix?} — dump frames as PNGs.',
      'Returns ffprobe summary of the output + ffmpeg status.',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['make_test_video', 'probe', 'cut', 'concat', 'title', 'subtitles', 'extract_frames'] },
        input: { type: 'string', description: 'Source file (workdir-relative)' },
        inputs: { type: 'array', items: { type: 'string' }, description: 'For concat: list of input files' },
        in: { type: 'number', description: 'cut start (seconds)' },
        out: { type: 'number', description: 'cut end (seconds)' },
        text: { type: 'string', description: 'title text' },
        pos: { type: 'string', enum: ['top', 'bottom', 'center'], description: 'title position' },
        fontsize: { type: 'number' },
        srt: { type: 'string', description: 'subtitles: .srt file path' },
        every_n: { type: 'number', description: 'extract_frames: every Nth frame' },
        out_prefix: { type: 'string', description: 'extract_frames: output frame prefix' },
        seconds: { type: 'number', description: 'make_test_video duration' },
        width: { type: 'number' },
        height: { type: 'number' },
        fps: { type: 'number' },
        output: { type: 'string', description: 'Output filename (workdir-relative). Default: auto.' },
      },
      required: ['op'],
    },
    source: 'builtin',
    async execute(args, ctx): Promise<ToolResult> {
      const op = args.op as string;
      try {
        switch (op) {
          case 'make_test_video': {
            const seconds = Math.min(60, argNum(args, 'seconds') ?? 4);
            const width = argNum(args, 'width') ?? 640;
            const height = argNum(args, 'height') ?? 360;
            const fps = argNum(args, 'fps') ?? 25;
            const output = argText(args, 'output') ?? 'test_video.mp4';
            const outPath = containPath(ctx.workdir, output);
            if (!outPath) return { ok: false, text: `output path escapes workdir: ${output}` };
            const { ok, out } = await runBin('ffmpeg', [
              '-y', '-f', 'lavfi', '-i', `testsrc=duration=${seconds}:size=${width}x${height}:rate=${fps}`,
              '-f', 'lavfi', '-i', 'sine=frequency=440:duration=' + seconds,
              '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', outPath,
            ], 120_000);
            if (!ok) return { ok: false, text: `ffmpeg failed: ${out}` };
            const probe = await probeMedia(outPath).catch(() => '(probe unavailable)');
            return { ok: true, text: `Created ${relativeLabel(ctx.workdir, outPath)}\n${probe}` };
          }
          case 'probe': {
            const input = argText(args, 'input');
            if (!input) return { ok: false, text: 'probe requires "input"' };
            const inPath = containPath(ctx.workdir, input);
            if (!inPath) return { ok: false, text: `input escapes workdir: ${input}` };
            return { ok: true, text: await probeMedia(inPath) };
          }
          case 'cut': {
            const input = argText(args, 'input');
            const inS = argNum(args, 'in');
            const outS = argNum(args, 'out');
            if (!input || inS === undefined || outS === undefined) {
              return { ok: false, text: 'cut requires "input", "in" and "out" (seconds)' };
            }
            const inPath = containPath(ctx.workdir, input);
            if (!inPath) return { ok: false, text: `input escapes workdir: ${input}` };
            const output = argText(args, 'output') ?? `cut_${path.basename(input)}`;
            const outPath = containPath(ctx.workdir, output);
            if (!outPath) return { ok: false, text: `output escapes workdir: ${output}` };
            const { ok, out } = await runBin('ffmpeg', [
              '-y', '-ss', String(inS), '-to', String(outS), '-i', inPath,
              '-c:v', 'libx264', '-c:a', 'aac', outPath,
            ], 300_000);
            if (!ok) return { ok: false, text: `ffmpeg cut failed: ${out}` };
            const probe = await probeMedia(outPath).catch(() => '');
            return { ok: true, text: `Cut ${inS}s→${outS}s → ${relativeLabel(ctx.workdir, outPath)}\n${probe}` };
          }
          case 'concat': {
            const inputs = (args.inputs ?? []) as unknown[];
            if (!Array.isArray(inputs) || inputs.length === 0) {
              return { ok: false, text: 'concat requires "inputs" (array of file paths)' };
            }
            const resolved: string[] = [];
            for (const p of inputs) {
              if (typeof p !== 'string') return { ok: false, text: 'inputs must be strings' };
              const rp = containPath(ctx.workdir, p);
              if (!rp) return { ok: false, text: `input escapes workdir: ${p}` };
              resolved.push(rp);
            }
            const output = argText(args, 'output') ?? 'concat.mp4';
            const outPath = containPath(ctx.workdir, output);
            if (!outPath) return { ok: false, text: `output escapes workdir: ${output}` };
            // concat demuxer needs a list file inside the workdir
            const listRel = `.concat_list_${Date.now()}.txt`;
            const listPath = path.join(ctx.workdir, listRel);
            await fs.writeFile(listPath, resolved.map((f) => `file '${path.relative(ctx.workdir, f)}'`).join('\n'));
            const { ok, out } = await runBin('ffmpeg', [
              '-y', '-f', 'concat', '-safe', '0', '-i', listRel,
              '-c:v', 'libx264', '-c:a', 'aac', outPath,
            ], 600_000);
            await fs.unlink(listPath).catch(() => {});
            if (!ok) return { ok: false, text: `ffmpeg concat failed: ${out}` };
            const probe = await probeMedia(outPath).catch(() => '');
            return { ok: true, text: `Concatenated ${resolved.length} clips → ${relativeLabel(ctx.workdir, outPath)}\n${probe}` };
          }
          case 'title': {
            const input = argText(args, 'input');
            const text = argText(args, 'text');
            if (!input || !text) return { ok: false, text: 'title requires "input" and "text"' };
            if (containsForbiddenChars(text)) return { ok: false, text: 'title text contains forbidden characters' };
            const inPath = containPath(ctx.workdir, input);
            if (!inPath) return { ok: false, text: `input escapes workdir: ${input}` };
            const pos = argText(args, 'pos') ?? 'bottom';
            const fontsize = argNum(args, 'fontsize') ?? 48;
            const yExpr = pos === 'top' ? 'h-th-20' : pos === 'center' ? '(h-th)/2' : 'h-th-20';
            const output = argText(args, 'output') ?? `title_${path.basename(input)}`;
            const outPath = containPath(ctx.workdir, output);
            if (!outPath) return { ok: false, text: `output escapes workdir: ${output}` };
            const vf = `drawtext=text='${ffEscape(text)}':fontsize=${fontsize}:fontcolor=white:box=1:boxcolor=black@0.5:x=(w-text_w)/2:y=${yExpr}`;
            const { ok, out } = await runBin('ffmpeg', [
              '-y', '-i', inPath, '-vf', vf, '-c:a', 'copy', outPath,
            ], 600_000);
            if (!ok) return { ok: false, text: `ffmpeg title failed: ${out}` };
            return { ok: true, text: `Title added → ${relativeLabel(ctx.workdir, outPath)}` };
          }
          case 'subtitles': {
            const input = argText(args, 'input');
            const srt = argText(args, 'srt');
            if (!input || !srt) return { ok: false, text: 'subtitles requires "input" and "srt"' };
            const inPath = containPath(ctx.workdir, input);
            const srtPath = containPath(ctx.workdir, srt);
            if (!inPath || !srtPath) return { ok: false, text: `path escapes workdir` };
            const output = argText(args, 'output') ?? `subs_${path.basename(input)}`;
            const outPath = containPath(ctx.workdir, output);
            if (!outPath) return { ok: false, text: `output escapes workdir: ${output}` };
            const rel = path.relative(ctx.workdir, srtPath).replace(/'/g, '');
            const vf = `subtitles='${ffEscape(rel)}'`;
            const { ok, out } = await runBin('ffmpeg', [
              '-y', '-i', inPath, '-vf', vf, '-c:a', 'copy', outPath,
            ], 600_000);
            if (!ok) return { ok: false, text: `ffmpeg subtitles failed: ${out}` };
            return { ok: true, text: `Subtitles burned in → ${relativeLabel(ctx.workdir, outPath)}` };
          }
          case 'extract_frames': {
            const input = argText(args, 'input');
            if (!input) return { ok: false, text: 'extract_frames requires "input"' };
            const inPath = containPath(ctx.workdir, input);
            if (!inPath) return { ok: false, text: `input escapes workdir: ${input}` };
            const every = Math.max(1, argNum(args, 'every_n') ?? 30);
            const prefix = (argText(args, 'out_prefix') ?? 'frame').replace(/[^\w.-]/g, '_');
            const outDir = containPath(ctx.workdir, '.');
            if (!outDir) return { ok: false, text: 'workdir not accessible' };
            const pattern = path.join(outDir, `${prefix}_%03d.png`);
            const { ok, out } = await runBin('ffmpeg', [
              '-y', '-i', inPath, '-vf', `fps=1/${every}`, pattern,
            ], 300_000);
            if (!ok) return { ok: false, text: `ffmpeg extract_frames failed: ${out}` };
            const frames = (await fs.readdir(outDir).catch(() => [] as string[])).filter((f) => f.startsWith(prefix) && f.endsWith('.png'));
            return { ok: true, text: `Extracted ${frames.length} frame(s) → ${prefix}_*.png (every ${every}s)\n${frames.slice(0, 10).join('\n')}` };
          }
          default:
            return { ok: false, text: `Unknown video op "${op}". Valid: make_test_video, probe, cut, concat, title, subtitles, extract_frames` };
        }
      } catch (err) {
        return { ok: false, text: `video_edit error: ${(err as Error).message}` };
      }
    },
  },
];

export { probeMedia as probe };
