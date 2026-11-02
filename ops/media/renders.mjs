// Renders run side by side (round 9, owner 24 Oct 2026: "Is there anyway we can speed up the recording process? ... can we parallelize it more?"):
// a render used one of the Mac's 8 cores for ~2-3 min per copy, one copy after another, ~80% of a hero redo. media.mjs records every take first
// (checks included, so a bad scene stops in a minute), then renders every copy through this queue, HERO_RENDERS at once (default 3: each
// renderer holds its frames, and a Mac low on memory ended one early in round 9). Guard: desktop/test/media-render.test.js.
import {execFileSync, spawn} from 'node:child_process';

export const RENDERS = Math.max(1, Number(process.env.HERO_RENDERS) || 3);
// Takes recorded at once (HERO_TAKES, default 2): each its own app or Chrome, temp folder and port; a capture that stalls under the load is
// recorded again (check.mjs captureGaps), so more at once is slower, not wrong.
export const TAKES = Math.max(1, Number(process.env.HERO_TAKES) || 2);

// At most n jobs at once: run(job) waits for a free slot, runs job(), frees the slot when it settles. -> run. Pure (no I/O).
export function limiter(n) {
  let running = 0;
  const waiting = [];
  return async job => {
    if (running >= n) await new Promise(resolve => waiting.push(resolve));
    else running++;
    try { return await job(); } finally {
      const next = waiting.shift();
      if (next) next(); else running--;   // the slot passes straight to the next job
    }
  };
}

// A child process to its end. -> {status, signal, error}: error when it never started; killed (SIGKILL) after timeoutMs.
export const runChild = (command, args, timeoutMs) => new Promise(resolve => {
  const child = spawn(command, args, {stdio: 'inherit'});
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
  child.on('error', error => { clearTimeout(timer); resolve({status: null, signal: null, error}); });
  child.on('exit', (status, signal) => { clearTimeout(timer); resolve({status, signal, error: null}); });
});

// Each copy rendered in pieces at once (owner 25 Oct 2026: "let's do both", the hardware master and chunks): HERO_CHUNKS pieces (default 4) of at
// least MIN_CHUNK frames, each its own renderer through the same queue, joined without re-encoding. A frame carries all it needs (its screen, camera,
// transition, caption), so a piece draws the same pixels as the whole. -> [[from, to)], in order. Pure.
export const CHUNKS = Math.max(1, Number(process.env.HERO_CHUNKS) || 4);
export const MIN_CHUNK = 90;
export function chunksOf(count, n = CHUNKS, min = MIN_CHUNK) {
  const pieces = Math.max(1, Math.min(n, Math.floor(count / min)));
  return Array.from({length: pieces}, (_, i) => [Math.round(i * count / pieces), Math.round((i + 1) * count / pieces)]);
}

// The master's codec: the Mac's video chip (h264_videotoolbox) where ffmpeg has it, else x264 (the CI runner). The master is encoded again for the
// site (encode.mjs), so it only has to be near lossless: a high constant bitrate. HERO_HW=0 forces x264. -> ffmpeg args.
export const X264 = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '12'];
export const VIDEOTOOLBOX = ['-c:v', 'h264_videotoolbox', '-b:v', '40M', '-g', '60'];
let probed = null;
const videotoolbox = () => (probed ??= (() => { try { return /\bh264_videotoolbox\b/.test(execFileSync('ffmpeg', ['-hide_banner', '-encoders'], {encoding: 'utf8'})); } catch { return false; } })());
export const masterEncoder = (env = process.env, hasChip = videotoolbox) => (env.HERO_HW !== '0' && hasChip() ? VIDEOTOOLBOX : X264);
