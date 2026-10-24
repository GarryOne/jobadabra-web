// The site's files from a rendered master (media): MP4 (H.264, every browser) and WebM (VP9) within the piece's byte budget,
// a phone copy, a GIF, a poster (the first frame, or the scene's poster hold), and WebP stills. ffmpeg from PATH (brew on the CI runner).
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ff = (...args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {stdio: ['ignore', 'ignore', 'pipe']});
const size = file => fs.statSync(file).size;

// The first quality (CRF) whose file fits the budget: from sharp to small, two steps at a time. Pure.
export const crfLadder = (from, to) => Array.from({length: Math.floor((to - from) / 2) + 1}, (_, i) => from + 2 * i);

// The sharpest quality (lowest CRF) whose file fits: a binary search over the ladder (the file shrinks as CRF rises), so about 4 encodes instead of up
// to 9 (owner, 24 Oct 2026, "why it takes you so much time?": Track's WebM walked 8 slow encodes). fits(crf) encodes at crf and says whether it fits.
// -> {crf, tries}, or null when even the last fails (its file is the last one tried). Pure.
export function sharpestFit(ladder, fits) {
  let lo = 0, hi = ladder.length - 1, best = null;
  const tries = [];
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    tries.push(ladder[mid]);
    if (fits(ladder[mid])) { best = mid; hi = mid - 1; } else lo = mid + 1;
  }
  return best === null ? null : {crf: ladder[best], tries};
}

function withinBudget(make, file, budget, ladder) {
  if (!budget) { make(ladder[0]); return ladder[0]; }
  const found = sharpestFit(ladder, crf => { make(crf); return size(file) <= budget; });
  if (!found) throw new Error(`media: ${path.basename(file)} is ${(size(file) / 1e6).toFixed(2)} MB at the lowest quality, over its ${(budget / 1e6).toFixed(2)} MB budget (shorten the scene)`);
  if (found.tries.at(-1) !== found.crf) make(found.crf);   // the file left on disk is the chosen quality's
  return found.crf;
}

// The encoders every piece needs; a missing one stops the run before any recording (an ffmpeg built without WebP, run 39451422713).
export const ENCODERS = ['libx264', 'libvpx-vp9', 'libwebp'];
export function missingEncoders(list = execFileSync('ffmpeg', ['-hide_banner', '-encoders'], {encoding: 'utf8'})) {
  return ENCODERS.filter(name => !new RegExp(`\\s${name}\\s`).test(list));   // whole names: libwebp_anim is not libwebp
}

// Every video is written BT.709 and tagged BT.709 + the sRGB transfer (the app's CSS colours): untagged, Chrome decoded our
// BT.601 files as BT.709 and drew the app's cards bluer (owner, 24 Oct 2026: "a different background than it is actually on the
// real app"); tagged with the BT.709 transfer, it crushed the darks. Measured in Chrome: card 16,25,32 vs the app's 16,25,33.
export const COLOR_TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1', '-color_range', 'tv'];
export const videoFilter = scale => `${scale}:out_color_matrix=bt709:out_range=tv,format=yuv420p`;   // scale ends in its own options. Pure.

// -> {mp4, webm, poster, phone?, gif?}: file names in outDir, plus the bytes of each.
export function encodeVideo({master, phoneMaster = null, name, piece, outDir, posterAt = 0}) {
  const files = {mp4: `${name}.mp4`, webm: `${name}.webm`, poster: `${name}-poster.jpg`};
  const at = file => path.join(outDir, file);
  const fast = piece.speed > 1 ? `setpts=PTS/${piece.speed},fps=30,` : '';   // a sped-up clip: the whole flow in about 3 s
  const scale = `${fast}scale=${piece.width}:${piece.height}:flags=lanczos`;
  withinBudget(crf => ff('-i', master, '-vf', videoFilter(scale), ...COLOR_TAGS, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-movflags', '+faststart', '-an', at(files.mp4)),
    at(files.mp4), piece.budget, crfLadder(22, 34));
  withinBudget(crf => ff('-i', master, '-vf', videoFilter(scale), ...COLOR_TAGS, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-an', at(files.webm)),
    at(files.webm), piece.budget, crfLadder(34, 50));
  ff('-ss', String(posterAt), '-i', master, '-vf', scale, '-frames:v', '1', '-q:v', '3', at(files.poster));
  if (piece.phone) {   // a width (the desktop master made smaller), or {width, height, budget} with its own tighter master (the hero, owner 24 Oct 2026)
    const width = typeof piece.phone === 'object' ? piece.phone.width : piece.phone;
    files.phone = `${name}-${width}.mp4`;
    withinBudget(crf => ff('-i', phoneMaster || master, '-vf', videoFilter(`${fast}scale=${width}:-2:flags=lanczos`), ...COLOR_TAGS, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-movflags', '+faststart', '-an', at(files.phone)),
      at(files.phone), piece.phone.budget, crfLadder(22, 34));   // round 9: as sharp as the desktop copy
    if (phoneMaster) {   // the phone's own first frame: the site shows it before the clip plays
      files.phonePoster = `${name}-${width}-poster.jpg`;
      ff('-ss', String(posterAt), '-i', phoneMaster, '-vf', `scale=${width}:-2`, '-frames:v', '1', '-q:v', '3', at(files.phonePoster));
    }
  }
  if (piece.gif) {   // emails and READMEs: 10 fps, one palette for the whole clip, only changed areas redrawn
    files.gif = `${name}.gif`;
    ff('-i', master, '-vf', `fps=10,scale=${piece.gif}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, at(files.gif));
  }
  return {files, bytes: Object.fromEntries(Object.entries(files).map(([kind, file]) => [kind, size(at(file))]))};
}

// A still (the whole window, 1600 wide) or a close-up (kept at 2x) as WebP. -> {file, bytes, width, height}
export function encodeStill({png, name, kind, outDir}) {
  const file = `${kind}-${name}.webp`;
  ff('-i', png, ...(kind === 'still' ? ['-vf', 'scale=1600:-2:flags=lanczos'] : []), '-c:v', 'libwebp', '-quality', '84', path.join(outDir, file));
  const [width, height] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(outDir, file)], {encoding: 'utf8'}).trim().split(',').map(Number);
  return {file, bytes: size(path.join(outDir, file)), width, height};
}

// Seconds of a video file.
export const duration = file => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {encoding: 'utf8'}).trim());

// The mean brightness of an image, 0..1 (the dark-theme check).
export function brightness(file) {
  const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', 'scale=64:-2,format=gray', '-frames:v', '1', '-f', 'rawvideo', '-'], {maxBuffer: 1e7});
  return raw.reduce((sum, value) => sum + value, 0) / raw.length / 255;
}
