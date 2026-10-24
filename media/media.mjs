// The product's screenshots and videos, made with nobody's hands (owner, 20 Oct 2026): records the app (demo mode, dark) and the real extension on a
// fictional form, adds zooms, cursor and clicks in code from the click log, checks every piece, writes the site's files + manifest.json.
//   node media/media.mjs                                   all pieces → <tmp>/jobadabra-media
//   node media/media.mjs hero stills --out <dir>        some pieces (hero, extension-fill, stills, snips); a partial run keeps the others in manifest.json
//   node media/media.mjs --persona <folder>             another search profile (default: personas/nurse-lyon): files laid over desktop/demo + media.json
//   node media/media.mjs --keep                         keep the frames and logs (<out>/.work) for the director (direct.mjs) or a look
// Zooms and captions the AI director chose are in plans/<piece>.json (direct.mjs); without one, the camera frames each hold's `look`.
// Run by hand with tools/media.sh (the one local command; CI never records, owner 21 Oct 2026). Guards: desktop/test/media-*.test.js.
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {beatTimes, FIT_WARN, fromFirstLook, posterTime, renderPlan, RING, untilEnd} from './camera.mjs';
import {dropChanges, frameCuts, STRAY_MAX, strayFrames, THUMB} from './cuts.mjs';
import {joinFilter, openOnCard, transitions, withCards} from './transitions.mjs';
import {fillSeconds, pipPlan} from './pip.mjs';
import {captionAt, captionSize, captionTimes, SAY_FADE} from './captions.mjs';
import {captureGaps, leftWords, pieceProblems, realEmails} from './check.mjs';
import {brightness, duration, encodeStill, encodeVideo, missingEncoders} from './encode.mjs';
import {gradeSvg} from './grade.mjs';
import {manifest, stillEntry, videoEntry} from './manifest.mjs';
import {recordAppVideo, shootApp} from './record-app.mjs';
import {recordExtensionVideo} from './record-extension.mjs';
import {jpegWidth, loadPersona, parseArgs, planOf, withPlan} from './options.mjs';
import {partsOf, SNIPS, STILLS, VIDEOS} from './scenes.mjs';
import {rewordLog} from './words.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const desktop = path.resolve(here, '..', 'desktop');
const FPS = 30;

// Writes a render job and runs render.cjs on it. -> out.
function runRender(job, name) {
  const file = path.join(path.dirname(job.out), `${path.basename(job.out, '.mp4')}.json`);
  fs.writeFileSync(file, JSON.stringify({...job, gradeSvg: gradeSvg()}));   // every clip graded the same way, the app's pixels only (grade.mjs)
  const run = spawnSync(path.join(desktop, 'node_modules', '.bin', 'electron'), [path.join(here, 'render.cjs'), file], {stdio: 'inherit', timeout: 15 * 60000});
  // run.error: it never started (24 Oct 2026, a Mac out of memory printed "failed (null)"): name the cause
  if (run.status !== 0) throw new Error(`media: ${name}: the renderer failed (${run.error ? `could not start: ${run.error.message}` : run.status ?? run.signal})`);
  return job.out;
}

// One recorded clip (a piece, or a part of one): frames, log, the masters (recorded time; encode.mjs plays them `speed` times faster). Checked here.
// tune(piece): the steps as this recording needs them (a picture in picture's pace); layer: no masters (pip.mjs draws it inside another picture).
// Words only (media.mjs --words <set dir>, words.mjs): the set's kept recordings, redrawn with the scenes' current words; null = record.
let wordsFrom = null;

async function recordClip(name, persona, work, {tune = piece => piece, layer = false} = {}) {
  const piece = tune(openOnCard(withPlan(VIDEOS[name], planOf(name))));   // a part that comes in by a card opens on it (transitions.mjs)
  const stale = leftWords(`${piece.caption || ''} ${piece.shows} ${piece.alt || ''}`, persona.forbid);
  if (stale.length) throw new Error(`${name}: the plan's words name the default demo person (${stale.join(', ')}): run direct.mjs ${name} again`);
  const dir = path.join(work, name);
  const record = piece.source === 'extension' ? recordExtensionVideo : recordAppVideo;
  // a capture that stalled on a loaded Mac is recorded again (check.mjs captureGaps), at most twice; then pieceProblems fails the piece
  let recorded;
  if (wordsFrom) {
    const kept = path.join(wordsFrom, name);
    if (!fs.existsSync(path.join(kept, 'log.json'))) throw new Error(`media: ${name}: no kept recording in ${kept} (tools/hero.sh keeps one per set)`);
    fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
    fs.cpSync(path.join(kept, 'frames'), path.join(dir, 'frames'), {recursive: true});
    recorded = rewordLog(JSON.parse(fs.readFileSync(path.join(kept, 'log.json'), 'utf8')), piece, name);
    fs.writeFileSync(path.join(dir, 'log.json'), JSON.stringify(recorded, null, 1));
    console.log(`media: ${name}: words only, redrawn from ${kept}`);
  } else for (let attempt = 1; attempt <= 3; attempt++) {
    fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
    recorded = await record({persona, piece, dir});
    const gaps = captureGaps(recorded);
    if (!gaps.length || attempt === 3) break;
    console.log(`media: ${name}: the capture stalled (no frame at ${gaps.map(gap => `${gap.t.toFixed(1)} s`).join(', ')}): recording again (${attempt + 1} of 3)`);
  }
  // the hero starts at its first look (camera.mjs), each cut look when it shows, checked against its frames (cuts.mjs)
  const px = jpegWidth(fs.readFileSync(path.join(dir, 'frames', recorded.frames[0].file))) / recorded.viewport.w, thumbs = new Map();
  const thumb = (file, box) => {   // a frame's grey thumbnail of a box in CSS px (cuts.mjs frameCuts), clamped to the page
    const x = Math.max(0, Math.round(box.x * px)), y = Math.max(0, Math.round(box.y * px)), key = `${file} ${x} ${y} ${box.width} ${box.height}`;
    const w = Math.max(2, Math.round(box.width * px)), h = Math.max(2, Math.round(box.height * px)), crop = `crop=min(${w}\\,iw-${x}):min(${h}\\,ih-${y}):${x}:${y}`;
    if (!thumbs.has(key)) thumbs.set(key, execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(dir, 'frames', file), '-vf', `${crop},scale=${THUMB.w}:${THUMB.h},format=gray`, '-f', 'rawvideo', '-']));
    return thumbs.get(key);
  };
  // a title card's time is added at its cut (transitions.mjs withCards): the beats, captions and the gate all read this log
  const log = piece.camera === 'steady' ? withCards(frameCuts({log: dropChanges(fromFirstLook(untilEnd(recorded))), thumb}), piece.speed || 1) : recorded;
  console.log(`media: ${name}: recorded ${log.frames.length} frames, ${log.frames.at(-1).t.toFixed(1)} s`);
  const first = fs.readFileSync(path.join(dir, 'frames', log.frames[0].file));
  const scale = jpegWidth(first) / log.viewport.w, steady = piece.camera === 'steady';
  // a hero look too wide for its zoom is shown whole at a lower zoom (camera.mjs fitWidth); much lower reads small, so the log names it (round 2)
  const onFit = (event, asked, used) => console.log(`media: ${name}: look ${JSON.stringify(event.look)} shown whole at zoom ${used.toFixed(2)} (asked ${asked.toFixed(2)})${used < asked * FIT_WARN ? ': SMALL TEXT, pick a narrower look' : ''}`);
  // The site's copy, and for a piece with a phone shape ({width, height}: the hero) a second master with its own tighter camera (camera.mjs PHONE_*).
  const render = (out, width, height, phone = null) => {
    const captions = captionTimes(log);   // the hero's step captions (captions.mjs), drawn by render.cjs
    const frames = renderPlan(log, FPS, piece.speed || 1, {steady, phone, onFit}).map((frame, i) => ({...frame, ...captionAt(captions, i / FPS)}));
    return runRender({framesDir: path.join(dir, 'frames'), frames, scale, width, height, fps: FPS, ring: RING, captionSize: captionSize(width, Boolean(phone)), sayFade: SAY_FADE, out, ffmpeg: 'ffmpeg'}, name);
  };
  const problemsOf = () => pieceProblems({name, source: piece.source, log, posterBrightness: brightness(path.join(dir, 'frames', log.frames[0].file)), forbid: persona.forbid, quiet: piece.quiet});
  if (layer) { const problems = problemsOf(); if (problems.length) throw new Error(problems.join('\n')); return {name, piece, log, dir: path.join(dir, 'frames'), scale}; }
  const master = render(path.join(dir, 'master.mp4'), piece.width, piece.height);
  const phoneShape = typeof piece.phone === 'object' ? piece.phone : null;
  const phoneMaster = phoneShape ? render(path.join(dir, 'master-phone.mp4'), phoneShape.width, phoneShape.height, {aspect: phoneShape.width / phoneShape.height}) : null;
  const problems = problemsOf();
  if (problems.length) throw new Error(problems.join('\n'));
  return {name, piece, log, master, phoneMaster, seconds: duration(master)};
}

// A piece played picture in picture with another recording of the same moment (pip.mjs; owner, 24 Oct 2026, Apply: the Applying card and Chrome,
// swapped when the lead changes). The piece is recorded first; the other's `review` is paced on the piece's real fill (sync → its next mark), so
// the card ticks while the fields fill. -> a clip like recordClip's, with its own beats and poster (no stray-frame check: no cut inside).
async function recordPip(name, persona, work) {
  const piece = VIDEOS[name], speed = piece.speed || 1;
  const b = await recordClip(name, persona, work, {layer: true});
  const fill = fillSeconds(b.log);   // its sync to the panel's done state
  const pace = steps => steps.map(step => (step.review && fill ? {...step, review: {...step.review, every: Math.round(fill * 1000 / step.review.fields.length)}} : step));
  const a = await recordClip(piece.pip, persona, work, {layer: true, tune: other => ({...other, steps: pace(other.steps)})});
  console.log(`media: ${name}: picture in picture with ${piece.pip}${fill ? `, the card paced on a ${fill.toFixed(1)} s fill` : ''}`);
  const dir = path.join(work, name), recs = [a, b].map(rec => ({name: rec.name, log: rec.log, dir: rec.dir, scale: rec.scale}));
  const compose = (out, width, height, phone = null) => {
    const plan = pipPlan({a: recs[0], b: recs[1], width, height, fps: FPS, speed, phone});
    runRender({framesDir: dir, frames: plan.frames, scale: 1, width, height, fps: FPS, ring: RING, captionSize: captionSize(width, Boolean(phone)), sayFade: SAY_FADE, out, ffmpeg: 'ffmpeg'}, name);
    return plan;
  };
  const plan = compose(path.join(dir, 'master.mp4'), piece.width, piece.height);
  const phoneShape = typeof piece.phone === 'object' ? piece.phone : null;
  if (phoneShape) compose(path.join(dir, 'master-phone.mp4'), phoneShape.width, phoneShape.height, {aspect: phoneShape.width / phoneShape.height});
  const beats = [a, b].flatMap(rec => beatTimes(rec.log.events, rec.piece.steps, speed).map(beat => ({...beat, t: Number((plan.at(rec.name, beat.t * speed) / speed).toFixed(2))})))
    .filter(beat => beat.t >= 0).sort((x, y) => x.t - y.t);
  const master = path.join(dir, 'master.mp4');
  return {name, piece, pip: true, beats, posterAt: Math.max(0, plan.seconds - 0.2 * speed), master, phoneMaster: phoneShape ? path.join(dir, 'master-phone.mp4') : null, seconds: duration(master)};
}

// Masters of a piece's parts, one after the other (round 3, owner 24 Oct 2026: Apply starts in the app, then the browser), each coming in by its
// part's `into` (round 6: never an instant replacement; transitions.mjs joinFilter). -> the joined file.
function joined(files, kinds, speed, out) {
  if (files.length === 1) return files[0];
  const {filter, out: last} = joinFilter(files.map(file => duration(file)), kinds, speed);
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...files.flatMap(file => ['-i', file]), '-filter_complex', `${filter};${last}format=yuv420p[v]`,
    '-map', '[v]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p', out]);
  return out;
}

// A video piece with its parts (scenes.mjs partsOf): each recorded on its own app state, moment and steps, played in order.
async function makeVideo(name, persona, work, out) {
  const clips = [];
  for (const part of partsOf(name)) clips.push(await (part === name && VIDEOS[name].pip ? recordPip(name, persona, work) : recordClip(part, persona, work)));
  const {piece} = clips.find(clip => clip.name === name), speed = piece.speed || 1, dir = path.join(work, name);
  const starts = clips.map((_, i) => clips.slice(0, i).reduce((sum, clip) => sum + clip.seconds, 0));   // recorded seconds where each part starts
  const kinds = clips.slice(1).map(clip => clip.piece.into);   // how each later part comes in
  const master = joined(clips.map(clip => clip.master), kinds, speed, path.join(dir, 'master-joined.mp4'));
  const phoneMaster = clips[0].phoneMaster ? joined(clips.map(clip => clip.phoneMaster), kinds, speed, path.join(dir, 'master-phone-joined.mp4')) : null;
  const posterAt = clips.map((clip, i) => (clip.pip ? starts[i] + clip.posterAt : clip.piece.steps.some(step => step.poster) ? starts[i] + posterTime(clip.log.events) : null)).filter(at => at !== null).at(-1) ?? 0;
  const {files, bytes} = encodeVideo({master, phoneMaster, name, piece, outDir: out, posterAt});
  console.log(`media: ${name}: ${Object.entries(bytes).map(([kind, n]) => `${kind} ${(n / 1e6).toFixed(2)} MB`).join(', ')}`);
  if (piece.camera === 'steady') {   // no frame of another page around a cut (cuts.mjs strayFrames), read off the played clip, part by part
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(out, files.mp4), '-vf', `scale=${THUMB.w}:${THUMB.h},format=gray`, '-f', 'rawvideo', '-'], {maxBuffer: 1 << 28});
    const size = THUMB.w * THUMB.h, total = Math.floor(raw.length / size);
    const stray = clips.flatMap((clip, i) => {
      if (clip.pip) return [];   // two recordings with no cut inside: each was checked as it was recorded
      const from = Math.round(starts[i] / speed * FPS), to = i + 1 < clips.length ? Math.round(starts[i + 1] / speed * FPS) : total;
      return strayFrames({log: clip.log, frames: to - from, thumb: j => raw.subarray((from + j) * size, (from + j + 1) * size), speed, fps: FPS, windows: transitions(clip.log, speed)})
        .map(s => ({...s, at: Number((s.at + from / FPS).toFixed(2))}));
    });
    if (stray.length) throw new Error(stray.map(s => `media: ${name}: a frame of another page at ${s.at} s, ${s.side} the cut to ${JSON.stringify(s.look)} (differs ${s.diff} > ${STRAY_MAX}): record again; if it repeats, the cut's timing is wrong (cuts.mjs)`).join('\n'));
  }
  const beats = clips.flatMap((clip, i) => (clip.pip ? clip.beats : beatTimes(clip.log.events, clip.piece.steps, speed)).map(b => ({...b, t: Number((b.t + starts[i] / speed).toFixed(2))})));
  return videoEntry({name, piece, files, bytes, seconds: duration(path.join(out, files.mp4)), beats});
}

async function makeStills(kinds, persona, work, out) {
  const dir = path.join(work, 'stills');
  fs.mkdirSync(dir, {recursive: true});
  const shots = await shootApp({persona, stills: kinds.includes('stills') ? STILLS : {}, snips: kinds.includes('snips') ? SNIPS : {}, dir});
  return shots.map(shot => {
    const emails = realEmails(shot.text);
    if (emails.length) throw new Error(`media: ${shot.kind} ${shot.name}: an e-mail address that may be real is on screen: ${emails.join(', ')}`);
    const left = leftWords(shot.text, persona.forbid);
    if (left.length) throw new Error(`media: ${shot.kind} ${shot.name}: the default demo person shows through: ${left.join(', ')}`);
    const encoded = encodeStill({png: shot.file, name: shot.name, kind: shot.kind, outDir: out});
    return stillEntry({name: shot.name, kind: shot.kind, ...encoded, shows: (shot.kind === 'still' ? STILLS : SNIPS)[shot.name].shows});
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const persona = loadPersona(options.persona);
  const missing = missingEncoders();
  if (missing.length) throw new Error(`this ffmpeg lacks ${missing.join(', ')} (brew install ffmpeg)`);
  const work = path.join(options.out, '.work');
  if (options.words) {
    if (options.words === options.out) throw new Error('media: --words reads another set: give a new --out');
    wordsFrom = path.join(options.words, '.work');
  }
  fs.mkdirSync(work, {recursive: true});
  execFileSync(process.execPath, [path.join(desktop, 'scripts', 'stage.mjs')], {cwd: desktop, stdio: 'ignore'});   // the app imports shared/ (npm start does the same)
  const entries = [];
  for (const name of options.pieces.filter(piece => VIDEOS[piece] && !VIDEOS[piece].part)) entries.push(await makeVideo(name, persona, work, options.out));
  const kinds = options.pieces.filter(piece => piece === 'stills' || piece === 'snips');
  if (kinds.length) entries.push(...await makeStills(kinds, persona, work, options.out));
  const file = path.join(options.out, 'manifest.json');
  const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {cwd: desktop, encoding: 'utf8'}).trim();
  fs.writeFileSync(file, `${JSON.stringify(manifest({entries, previous, made: {sha, at: new Date().toISOString(), persona: persona.name}}), null, 2)}\n`);
  if (!options.keep) fs.rmSync(work, {recursive: true, force: true});
  console.log(`media: DONE ${entries.length} piece(s) → ${options.out}`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) main().catch(error => { console.error(`media: FAILED ${error.message}`); process.exit(1); });
