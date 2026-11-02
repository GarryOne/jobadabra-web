// The stray-frame check run on the render plan before any render (media.mjs recordClip): each planned frame's thumbnail is cut from a small grey
// copy of its recorded frame through the camera's view, so a frame of another page around a cut stops the run minutes in, not after the 20-minute
// render (run 27: the wide openings' false alarms came at minute 25). The check on the played copies (media.mjs) stays the final gate.
// Guard: desktop/test/media-prestray.test.js.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {renderPlan} from './camera.mjs';
import {strayFrames, THUMB} from './cuts.mjs';
import {transitions} from './transitions.mjs';

export const SMALL_W = 480;   // px of the grey copy each recorded frame is read at: a 64-px thumbnail of a 2.5x zoom still has ~3 px per cell

// A planned frame's thumbnail: the view's area (CSS px) of a small grey image (SMALL_W wide, scale px per CSS px), each cell the mean of its pixels.
// small: {w, h, data: Uint8Array}. -> Uint8Array(THUMB.w * THUMB.h). Pure.
export function thumbOf(small, view, scale) {
  const out = new Uint8Array(THUMB.w * THUMB.h);
  const x0 = view.x * scale, y0 = view.y * scale, cw = (view.w * scale) / THUMB.w, ch = (view.h * scale) / THUMB.h;
  for (let ty = 0; ty < THUMB.h; ty++) for (let tx = 0; tx < THUMB.w; tx++) {
    const xa = Math.max(0, Math.floor(x0 + tx * cw)), xb = Math.min(small.w, Math.max(xa + 1, Math.floor(x0 + (tx + 1) * cw)));
    const ya = Math.max(0, Math.floor(y0 + ty * ch)), yb = Math.min(small.h, Math.max(ya + 1, Math.floor(y0 + (ty + 1) * ch)));
    let sum = 0, n = 0;
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { sum += small.data[y * small.w + x]; n++; }
    out[ty * THUMB.w + tx] = n ? Math.round(sum / n) : 0;
  }
  return out;
}

// Stray frames in a take's render plan, in recorded seconds (the plan is drawn in recorded time; the copies play it `speed` times faster).
// small(file): the recorded frame as {w, h, data} at SMALL_W wide. -> strayFrames' list. Pure but small.
export function planStrays({log, speed = 1, fps = 30, phone = null, small}) {
  const plan = renderPlan(log, fps, speed, {steady: true, phone});
  const scale = SMALL_W / log.viewport.w;
  return strayFrames({log, frames: plan.length, thumb: j => thumbOf(small(plan[j].file), plan[j], scale), speed: 1, fps, windows: transitions(log, speed)});
}

// Every recorded frame of a take read once, grey, SMALL_W wide, in one ffmpeg call. -> small(file).
export function smallFrames(framesDir, log) {
  const files = [...new Set(log.frames.map(frame => frame.file))], w = SMALL_W, h = Math.round(SMALL_W * log.viewport.h / log.viewport.w);
  const list = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prestray-')), 'list.txt');
  fs.writeFileSync(list, files.map(file => `file '${path.join(framesDir, file).replace(/'/g, "'\\''")}'\nduration 1`).join('\n'));
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=${w}:${h},format=gray`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], {maxBuffer: 1 << 30});
  fs.rmSync(path.dirname(list), {recursive: true, force: true});
  const size = w * h, index = new Map(files.map((file, i) => [file, i]));
  return file => ({w, h, data: raw.subarray(index.get(file) * size, (index.get(file) + 1) * size)});
}
