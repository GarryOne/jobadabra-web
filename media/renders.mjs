// Renders run side by side (round 9, owner 24 Oct 2026: "Is there anyway we can speed up the recording process? ... can we parallelize it more?"):
// a render used one of the Mac's 8 cores for ~2-3 min per copy, one copy after another, ~80% of a hero redo. media.mjs records every take first
// (checks included, so a bad scene stops in a minute), then renders every copy through this queue, HERO_RENDERS at once (default 3: each
// renderer holds its frames, and a Mac low on memory ended one early in round 9). Guard: desktop/test/media-render.test.js.
import {spawn} from 'node:child_process';

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
