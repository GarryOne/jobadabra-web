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
import {captionAt, captionSize, captionTimes, SAY_FADE, sayTrack, vttOf} from './captions.mjs';
import {captureGaps, leftWords, pieceProblems, realEmails} from './check.mjs';
import {brightness, duration, encodeStill, encodeVideo, framesIn, missingEncoders} from './encode.mjs';
import {edgeCuts, edgeReport} from './edges.mjs';
import {gradeSvg} from './grade.mjs';
import {manifest, stillEntry, videoEntry} from './manifest.mjs';
import {recordAppVideo, shootApp} from './record-app.mjs';
import {recordExtensionVideo} from './record-extension.mjs';
import {jpegWidth, loadPersona, parseArgs, planOf, withPlan} from './options.mjs';
import {partsOf, SNIPS, STILLS, VIDEOS} from './scenes.mjs';
import {rewordLog} from './words.mjs';
import {phoneTake} from './hold.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const desktop = path.resolve(here, '..', 'desktop');
const FPS = 30;

// Writes a render job and runs render.cjs on it; a render that ends short (round 9: the phone copy's renderer quit 17 frames in, exit 0, on a Mac
// low on memory, and the clip came out 0.4 s long) is run once more, then stops the piece. -> out.
function runRender(job, name, tries = 2) {
  const file = path.join(path.dirname(job.out), `${path.basename(job.out, '.mp4')}.json`);
  fs.writeFileSync(file, JSON.stringify({...job, gradeSvg: gradeSvg()}));   // every clip graded the same way, the app's pixels only (grade.mjs)
  for (let attempt = 1; ; attempt++) {
    const run = spawnSync(path.join(desktop, 'node_modules', '.bin', 'electron'), [path.join(here, 'render.cjs'), file], {stdio: 'inherit', timeout: 15 * 60000});
    // run.error: it never started (24 Oct 2026, a Mac out of memory printed "failed (null)"): name the cause
    if (run.status !== 0) throw new Error(`media: ${name}: the renderer failed (${run.error ? `could not start: ${run.error.message}` : run.status ?? run.signal})`);
    const made = fs.existsSync(job.out) ? framesIn(job.out) : 0;
    if (made === job.frames.length) return job.out;
    if (attempt >= tries) throw new Error(`media: ${name}: ${path.basename(job.out)} has ${made} of ${job.frames.length} frames: the renderer ended early twice (memory?)`);
    console.log(`media: ${name}: ${path.basename(job.out)} has ${made} of ${job.frames.length} frames: rendering it again`);
  }
}

// Words only (media.mjs --words <set dir>, words.mjs): the set's kept recordings, redrawn with the scenes' current words; null = record.
let wordsFrom = null;

// One take of a clip: recorded (or, words only, the set's kept take redrawn with the scenes' words), cut at its looks and checked. The desktop take
// uses the scene's window; the phone take (round 9) the phone shape's narrow window, where the app lays out one column. -> {log, dir, scale}
async function takeOf(name, piece, persona, dir) {
  const record = piece.source === 'extension' ? recordExtensionVideo : recordAppVideo, label = path.basename(dir);
  // a capture that stalled on a loaded Mac is recorded again (check.mjs captureGaps), at most twice; then pieceProblems fails the piece
  let recorded;
  if (wordsFrom) {
    const kept = path.join(wordsFrom, label);
    if (!fs.existsSync(path.join(kept, 'log.json'))) throw new Error(`media: ${label}: no kept recording in ${kept} (tools/hero.sh keeps one per set)`);
    fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
    fs.cpSync(path.join(kept, 'frames'), path.join(dir, 'frames'), {recursive: true});
    recorded = rewordLog(JSON.parse(fs.readFileSync(path.join(kept, 'log.json'), 'utf8')), piece, label);
    fs.writeFileSync(path.join(dir, 'log.json'), JSON.stringify(recorded, null, 1));
    console.log(`media: ${label}: words only, redrawn from ${kept}`);
  } else for (let attempt = 1; attempt <= 3; attempt++) {
    fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
    recorded = await record({persona, piece, dir});
    const gaps = captureGaps(recorded);
    if (!gaps.length || attempt === 3) break;
    console.log(`media: ${label}: the capture stalled (no frame at ${gaps.map(gap => `${gap.t.toFixed(1)} s`).join(', ')}): recording again (${attempt + 1} of 3)`);
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
  console.log(`media: ${label}: recorded ${log.frames.length} frames, ${log.frames.at(-1).t.toFixed(1)} s`);
  return {log, dir, scale: jpegWidth(fs.readFileSync(path.join(dir, 'frames', log.frames[0].file))) / log.viewport.w};
}

// A frame drawn without its caption and tag: the phone copy's (round 9), whose captions the site shows under the video.
const noWords = ({say, sayAge, tag, ...frame}) => frame;

async function recordClip(name, persona, work, {tune = piece => piece, layer = false} = {}) {
  const piece = tune(openOnCard(withPlan(VIDEOS[name], planOf(name))));   // a part that comes in by a card opens on it (transitions.mjs)
  const stale = leftWords(`${piece.caption || ''} ${piece.shows} ${piece.alt || ''}`, persona.forbid);
  if (stale.length) throw new Error(`${name}: the plan's words name the default demo person (${stale.join(', ')}): run direct.mjs ${name} again`);
  const phoneShape = typeof piece.phone === 'object' ? piece.phone : null;
  const main = await takeOf(name, piece, persona, path.join(work, name));
  // phones: the same steps again in a narrow window, the app in one column (round 9, owner 24 Oct 2026, of three options: "Narrow window"), so a
  // phone frame shows whole cards with big text; the phone camera puts its edges in gaps (whole.mjs) and edgesOk proves it
  const narrow = phoneShape?.window ? await takeOf(name, phoneTake(piece, phoneShape), persona, path.join(work, `${name}-phone`)) : null;
  const steady = piece.camera === 'steady';
  // a hero look too wide for its zoom is shown whole at a lower zoom (camera.mjs fitWidth); much lower reads small, so the log names it (round 2)
  const onFit = (event, asked, used) => console.log(`media: ${name}: look ${JSON.stringify(event.look)} shown whole at zoom ${used.toFixed(2)} (asked ${asked.toFixed(2)})${used < asked * FIT_WARN ? ': SMALL TEXT, pick a narrower look' : ''}`);
  let said = [];   // the phone copy's captions in its played seconds: the site shows them under it (captions.mjs sayTrack)
  const render = (take, out, width, height, phone = null) => {
    edgesOk(name, take.log, piece.speed || 1, steady, phone);
    const captions = captionTimes(take.log);   // the hero's step captions (captions.mjs), drawn by render.cjs on the desktop copy only (round 9)
    const frames = renderPlan(take.log, FPS, piece.speed || 1, {steady, phone, onFit}).map((frame, i) => ({...frame, ...captionAt(captions, i / FPS)}));
    if (phone) said = sayTrack(frames, FPS, piece.speed || 1);
    return runRender({framesDir: path.join(take.dir, 'frames'), frames: phone ? frames.map(noWords) : frames, scale: take.scale, width, height, fps: FPS, ring: RING, captionSize: captionSize(width, Boolean(phone)), sayFade: SAY_FADE, out, ffmpeg: 'ffmpeg'}, name);
  };
  const checked = () => {
    const problems = [main, narrow].filter(Boolean).flatMap(take => pieceProblems({name: path.basename(take.dir), source: piece.source, log: take.log,
      posterBrightness: brightness(path.join(take.dir, 'frames', take.log.frames[0].file)), forbid: persona.forbid, quiet: piece.quiet}));
    if (problems.length) throw new Error(problems.join('\n'));
  };
  const layerOf = take => ({name, log: take.log, dir: path.join(take.dir, 'frames'), scale: take.scale});
  if (layer) { checked(); return {...layerOf(main), piece, phone: layerOf(narrow || main)}; }
  const master = render(main, path.join(main.dir, 'master.mp4'), piece.width, piece.height);
  const phoneMaster = phoneShape ? render(narrow || main, path.join(main.dir, 'master-phone.mp4'), phoneShape.width, phoneShape.height, {aspect: phoneShape.width / phoneShape.height}) : null;
  checked();
  return {name, piece, log: main.log, phoneLog: (narrow || main).log, master, phoneMaster, said, seconds: duration(master), phoneSeconds: phoneMaster ? duration(phoneMaster) : null};
}

// A phone copy whose view cuts a line of words or a card at its left or right edge stops (edges.mjs; round 9, owner 24 Oct 2026: "the video is
// stripped"); the desktop copy's cuts are named in the log. A kept recording from before round 9 has no edges: nothing to check.
function edgesOk(name, log, speed, steady, phone) {
  const hits = edgeCuts(log, speed, {steady, phone});
  if (!hits.length) return;
  const report = edgeReport(name, hits, phone ? 'phone' : 'desktop');
  if (phone && process.env.HERO_EDGES !== 'warn') throw new Error(report);
  console.log(report);
}

// A piece played picture in picture with another recording of the same moment (pip.mjs; owner, 24 Oct 2026, Apply: the Applying card and Chrome,
// swapped when the lead changes). The piece is recorded first; the other's `review` is paced on the piece's real fill (sync → its next mark), so
// the card ticks while the fields fill. -> a clip like recordClip's, with its own beats and poster (no stray-frame check: no cut inside).
// The phone copy composes the two phone takes (round 9), with its own captions and poster.
async function recordPip(name, persona, work) {
  const piece = VIDEOS[name], speed = piece.speed || 1;
  const b = await recordClip(name, persona, work, {layer: true});
  const fill = fillSeconds(b.log);   // its sync to the panel's done state
  const pace = steps => steps.map(step => (step.review && fill ? {...step, review: {...step.review, every: Math.round(fill * 1000 / step.review.fields.length)}} : step));
  const a = await recordClip(piece.pip, persona, work, {layer: true, tune: other => ({...other, steps: pace(other.steps)})});
  console.log(`media: ${name}: picture in picture with ${piece.pip}${fill ? `, the card paced on a ${fill.toFixed(1)} s fill` : ''}`);
  const dir = path.join(work, name);
  let said = [];
  const compose = (out, width, height, phone = null) => {
    const recs = [a, b].map(rec => ({...(phone ? rec.phone : rec), name: rec.name}));
    for (const rec of recs) edgesOk(rec.name, rec.log, speed, true, phone);
    const plan = pipPlan({a: recs[0], b: recs[1], width, height, fps: FPS, speed, phone});
    if (phone) said = sayTrack(plan.frames, FPS, speed);   // the phone copy: no captions on it (round 9), the site shows these
    runRender({framesDir: dir, frames: phone ? plan.frames.map(noWords) : plan.frames, scale: 1, width, height, fps: FPS, ring: RING, captionSize: captionSize(width, Boolean(phone)), sayFade: SAY_FADE, out, ffmpeg: 'ffmpeg'}, name);
    return plan;
  };
  const plan = compose(path.join(dir, 'master.mp4'), piece.width, piece.height);
  const phoneShape = typeof piece.phone === 'object' ? piece.phone : null;
  const phonePlan = phoneShape ? compose(path.join(dir, 'master-phone.mp4'), phoneShape.width, phoneShape.height, {aspect: phoneShape.width / phoneShape.height}) : null;
  const beats = [a, b].flatMap(rec => beatTimes(rec.log.events, rec.piece.steps, speed).map(beat => ({...beat, t: Number((plan.at(rec.name, beat.t * speed) / speed).toFixed(2))})))
    .filter(beat => beat.t >= 0).sort((x, y) => x.t - y.t);
  const master = path.join(dir, 'master.mp4'), phoneMaster = phoneShape ? path.join(dir, 'master-phone.mp4') : null;
  return {name, piece, pip: true, beats, posterAt: Math.max(0, plan.seconds - 0.2 * speed), phonePosterAt: phonePlan ? Math.max(0, phonePlan.seconds - 0.2 * speed) : null,
    master, phoneMaster, said, seconds: duration(master), phoneSeconds: phoneMaster ? duration(phoneMaster) : null};
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
  const phoneStarts = clips.map((_, i) => clips.slice(0, i).reduce((sum, clip) => sum + (clip.phoneSeconds ?? clip.seconds), 0));   // the phone takes run their own time
  const posterOf = (at, logOf, pipAt) => clips.map((clip, i) => (clip.pip ? at[i] + pipAt(clip) : clip.piece.steps.some(step => step.poster) ? at[i] + posterTime(logOf(clip).events) : null)).filter(t => t !== null).at(-1) ?? 0;
  const posterAt = posterOf(starts, clip => clip.log, clip => clip.posterAt), phonePosterAt = posterOf(phoneStarts, clip => clip.phoneLog || clip.log, clip => clip.phonePosterAt ?? clip.posterAt);
  const {files, bytes} = encodeVideo({master, phoneMaster, name, piece, outDir: out, posterAt, phonePosterAt});
  console.log(`media: ${name}: ${Object.entries(bytes).map(([kind, n]) => `${kind} ${(n / 1e6).toFixed(2)} MB`).join(', ')}`);
  if (piece.camera === 'steady') {   // no frame of another page around a cut (cuts.mjs strayFrames), read off each played copy, part by part
    const strayIn = (file, at, logOf) => {
      const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(out, file), '-vf', `scale=${THUMB.w}:${THUMB.h},format=gray`, '-f', 'rawvideo', '-'], {maxBuffer: 1 << 28});
      const size = THUMB.w * THUMB.h, total = Math.floor(raw.length / size);
      return clips.flatMap((clip, i) => {
        if (clip.pip) return [];   // two recordings with no cut inside: each was checked as it was recorded
        const from = Math.round(at[i] / speed * FPS), to = i + 1 < clips.length ? Math.round(at[i + 1] / speed * FPS) : total, log = logOf(clip);
        return strayFrames({log, frames: to - from, thumb: j => raw.subarray((from + j) * size, (from + j + 1) * size), speed, fps: FPS, windows: transitions(log, speed)})
          .map(s => ({...s, file, at: Number((s.at + from / FPS).toFixed(2))}));
      });
    };
    const stray = [...strayIn(files.mp4, starts, clip => clip.log), ...(phoneMaster && files.phone ? strayIn(files.phone, phoneStarts, clip => clip.phoneLog || clip.log) : [])];
    if (stray.length) throw new Error(stray.map(s => `media: ${name}: ${s.file}: a frame of another page at ${s.at} s, ${s.side} the cut to ${JSON.stringify(s.look)} (differs ${s.diff} > ${STRAY_MAX}): record again; if it repeats, the cut's timing is wrong (cuts.mjs)`).join('\n'));
  }
  const seconds = duration(path.join(out, files.mp4));
  const said = clips.flatMap((clip, i) => (clip.said || []).map(cue => ({...cue, t: Number((cue.t + phoneStarts[i] / speed).toFixed(3))})));
  if (files.phone && said.some(cue => cue.say)) {   // the captions the phone copy leaves out, in its own time, for the site to show under it (captions.mjs vttOf)
    files.captions = `${name}.vtt`;
    fs.writeFileSync(path.join(out, files.captions), vttOf(said, duration(path.join(out, files.phone))));
    bytes.captions = fs.statSync(path.join(out, files.captions)).size;
  }
  const beats = clips.flatMap((clip, i) => (clip.pip ? clip.beats : beatTimes(clip.log.events, clip.piece.steps, speed)).map(b => ({...b, t: Number((b.t + starts[i] / speed).toFixed(2))})));
  return videoEntry({name, piece, files, bytes, seconds, beats});
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
