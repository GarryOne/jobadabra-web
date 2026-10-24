// Cuts out the frames between a hero step's page change and the moment its next look is on screen (media): those frames showed the old framing over a
// new page (owner, 24 Oct 2026: "a small glitch in the first clip, showing something about Sonnet") or the new framing over a page still changing.
// Pure; run by media.mjs after fromFirstLook. Guard: desktop/test/media-camera.test.js ("a cut look starts when its content is on screen").
import {FIRST_LAG, frameAt} from './camera.mjs';
import {pageChange} from './hold.mjs';

const round = t => Number(t.toFixed(3));

// The recorder sees a look in the page a moment before a frame of it arrives (a re-record still cut one frame early, onto the old page): each 'ready'
// moves to the first frame recorded after it (within a second). Pure.
export function readyAtFrames(log) {
  return {...log, events: log.events.map(event => {
    if (event.type !== 'ready') return event;
    const frame = log.frames.find(f => f.t > event.t);
    return frame && frame.t - event.t <= 1 ? {...event, t: frame.t} : event;
  })};
}

// Each `cut` look's span to drop: from the first page change after the previous look (a mark or a press) to its content on screen (the recorder's
// 'ready' event, moved to its first frame by readyAtFrames, else the hold's start + FIRST_LAG). -> [{from, to}] in time order. Pure.
export function changeSpans(log) {
  const spans = [];
  log.events.forEach((event, i) => {
    if (event.type !== 'hold' || !event.cut || !event.box) return;
    const earlier = log.events.slice(0, i), prev = earlier.filter(e => e.type === 'hold').at(-1);
    if (!prev) return;
    const change = earlier.find(e => pageChange(e) && e.t > prev.t);
    if (!change) return;
    const ready = earlier.find(e => e.type === 'ready' && e.t >= change.t);
    const to = Math.min(ready ? ready.t : event.t + FIRST_LAG, event.t + Math.max(0, event.s - 0.5));
    if (to - change.t > 0.05) spans.push({from: change.t, to});
  });
  return spans;
}

// The log without the recorded span [a, b]: the frame on screen at b is shown from a, later frames and events move up by b - a; the page change at a
// stays (the camera cuts there), a hold inside the span starts at a, shorter by what was cut; other events inside are dropped. Pure.
export function cutOut(log, a, b) {
  const d = b - a, shown = log.frames[frameAt(log.frames, b)];
  const frames = log.frames.filter(frame => frame.t <= a);
  if (shown.t > a) frames.push({...shown, t: a});   // after any frame at a: the camera cuts at a too
  for (const frame of log.frames) if (frame.t > b) frames.push({...frame, t: round(frame.t - d)});
  const events = [];
  for (const event of log.events) {
    if (event.t < a || (event.t === a && event.type !== 'hold')) events.push(event);
    else if (event.t > b) events.push({...event, t: round(event.t - d)});
    else if (event.type === 'hold') events.push({...event, t: a, s: Math.max(0.1, round(event.s - (b - event.t)))});
  }
  return {...log, frames, events};
}

// Every cut look's span dropped, the last first so earlier times stay put. Pure.
export function dropChanges(raw) {
  const log = readyAtFrames(raw);
  return changeSpans(log).reverse().reduce((out, span) => cutOut(out, span.from, span.to), log);
}

// The gate on the played clip (round 3, owner 24 Oct 2026: "check against yourself"): around each cut look, the frames from the previous look's end to
// the cut must still show the previous look's page, and the first half second after it the new look's page; a frame of another page differs from its
// look's beat frame by far more than typing, a cursor or a progress bar (measured: clean cuts <= 0.7, the five glitches 5.6 to 16.9, in mean grey levels
// on a 64x40 thumbnail). thumb(j): video frame j's thumbnail (Uint8Array); speed: how much faster the clip plays; log: after dropChanges.
// -> [{look, at, side, diff}] for each cut with a stray frame (its worst one). Pure.
export const STRAY_MAX = 3;
export const THUMB = {w: 64, h: 40};
// When the camera cuts to the look at log.events[i] (as cameraKeys does): the first page change after the previous look, else the moment the page
// changed by itself ('ready'), else the hold's start. Pure.
export function cutTime(log, i) {
  const hold = log.events[i], prev = log.events.slice(0, i).filter(e => e.type === 'hold' && e.box).at(-1);
  if (!prev) return hold.t;
  const after = event => event.t > prev.t && event.t <= hold.t + FIRST_LAG;
  return (log.events.find(e => pageChange(e) && after(e)) ?? log.events.find(e => e.type === 'ready' && after(e)) ?? hold).t;
}
const meanDiff = (a, b) => { let sum = 0; for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]); return sum / a.length; };
// windows: the transitions (transitions.mjs, recorded seconds): their mixed frames are neither page, so the check stops where one starts and
// starts again where it ends.
export function strayFrames({log, thumb, frames, speed = 1, fps = 30, max = STRAY_MAX, windows = []}) {
  const holds = log.events.filter(event => event.type === 'hold' && event.box);
  const video = t => Math.min(frames - 1, Math.round(t / speed * fps));
  const beat = hold => video(hold.t + hold.s * 0.9);
  const out = [];
  holds.forEach((hold, k) => {
    if (!hold.cut || !k) return;
    const prev = holds[k - 1], cut = cutTime(log, log.events.indexOf(hold));
    let worst = null;
    const look = (from, to, refs, side) => { for (let j = from; j < to; j++) { const diff = Math.min(...refs.map(ref => meanDiff(thumb(j), thumb(ref)))); if (diff > max && (!worst || diff > worst.diff)) worst = {look: hold.look, at: Number((j / fps).toFixed(2)), side, diff: Number(diff.toFixed(1))}; } };
    const mixed = windows.find(w => w.from <= cut + 0.05 && w.to >= cut - 0.05);
    // Before the cut, the old look's last frame is a second reference when it is still the old page (twice as close to the old beat as to the new):
    // a page that changes a little by itself late in the hold (run 24: Track's "Last refresh" line hiding) is not another page.
    const holdEnd = video(prev.t + prev.s), last = Math.max(beat(prev), holdEnd - 1);
    const lastOld = 2 * meanDiff(thumb(last), thumb(beat(prev))) < meanDiff(thumb(last), thumb(beat(hold)));
    look(holdEnd, video(mixed ? Math.min(cut, mixed.from) : cut), lastOld ? [beat(prev), last] : [beat(prev)], 'before');
    // After the cut, a look that fills in by itself (the search card's numbers) still differs from its own end: the frame half a second in is a second
    // reference, but only when it is the new page (not the old page, and closer to the new beat than to the old one), so an old page that lingers is
    // still caught. Not "twice as close" (run 24): in the phone copy one card fills the frame before and after Find's cut, and the new beat, late in the
    // search, is 1.75x closer only.
    const start = mixed ? video(mixed.to) : video(cut), end = Math.min(frames, start + Math.round(fps / 2)), settled = end - 1;
    const toOld = meanDiff(thumb(settled), thumb(beat(prev))), isNew = toOld > max && meanDiff(thumb(settled), thumb(beat(hold))) < toOld;
    look(start + 1, end, isNew ? [beat(hold), settled] : [beat(hold)], 'after');
    if (worst) out.push(worst);
  });
  return out;
}

// A cut look the phone take scrolled into its window (hold.mjs scrollLookIn, run 24): its box is measured after the scroll, so the page's change is
// looked for in the previous look's box, where the camera still is (the frame just before the scroll is the new page there), and the scroll's frames
// are cut out: the old look, then the new look already in place, never the new page sliding under the old look. -> the log. Pure.
function scrolledCut(log, {prev, cut, scroll, scrolled, thumb}) {
  // the old look's first tenth is the old page: the new one can paint anywhere in that hold (run 25: Set up's proposal came mid-hold, the phone
  // look's card a moment later, so 'ready' and its 90% beat were both late), so it is looked for from there, not from the beat
  let start = cut;
  const from = prev.t + prev.s * 0.1, old = log.frames[frameAt(log.frames, from)], fresh = log.frames[frameAt(log.frames, scroll.t)];
  const byAction = log.events.some(event => pageChange(event) && event.t > prev.t && event.t === cut);
  if (!byAction && old && fresh && old.file !== fresh.file) {
    const a = thumb(old.file, prev.box), b = thumb(fresh.file, prev.box);
    const looksNew = frame => 2 * meanDiff(thumb(frame.file, prev.box), b) < meanDiff(thumb(frame.file, prev.box), a);
    const early = meanDiff(a, b) > STRAY_MAX && log.frames.find(frame => frame.t > from && frame.t <= scroll.t && looksNew(frame));
    if (early) start = Math.min(cut, round(early.t - 0.001));
  }
  if (start >= scrolled.t) return log;
  const out = start < cut ? {...log, events: [...log.events, {type: 'ready', t: start}].sort((x, y) => x.t - y.t)} : log;
  return cutOut(out, start, scrolled.t);
}

// Each cut checked against the recorded frames themselves (round 3): 'ready' is noticed by polling, so a page that changes by itself (no click or page step
// before its cut look: the AI's proposal replacing "reading your CV") painted up to ~0.1 s before it, and a page painted late (the calendar) still showed
// after it. Read in the new look's box (what the camera shows: a card appearing in a wide page barely changes the whole page). A frame is the new page
// when it is twice as close to the new look's beat frame as to the previous look's. So: a self-changing page is cut at its
// first new frame; old frames after any cut are cut out (cutOut). thumb(file, box): a recorded frame's thumbnail of that box (CSS px). -> the log. Pure.
export function frameCuts({log, thumb}) {
  let out = log;
  const count = log.events.filter(event => event.type === 'hold' && event.box).length;
  for (let k = 1; k < count; k++) {
    const holds = out.events.filter(event => event.type === 'hold' && event.box), hold = holds[k], prev = holds[k - 1];
    if (!hold.cut) continue;
    const cut = cutTime(out, out.events.indexOf(hold)), seen = prev.t + prev.s * 0.9;
    const scroll = out.events.find(event => event.type === 'scroll' && event.t > prev.t && event.t < hold.t);
    const scrolled = scroll && out.events.find(event => event.type === 'scrolled' && event.t >= scroll.t && event.t <= hold.t);
    if (scrolled) { out = scrolledCut(out, {prev, cut, scroll, scrolled, thumb}); continue; }
    const old = out.frames[frameAt(out.frames, seen)], fresh = out.frames[frameAt(out.frames, hold.t + hold.s * 0.9)];
    if (!old || !fresh || old.file === fresh.file) continue;
    const box = hold.box, a = thumb(old.file, box), b = thumb(fresh.file, box);
    if (meanDiff(a, b) <= STRAY_MAX) continue;   // nothing to tell apart
    const looksNew = frame => 2 * meanDiff(thumb(frame.file, box), b) < meanDiff(thumb(frame.file, box), a);   // mostly there: a fade's first third stays out
    const byAction = out.events.some(event => pageChange(event) && event.t > prev.t && event.t === cut);
    const early = !byAction && out.frames.find(frame => frame.t > seen && frame.t < cut && looksNew(frame));
    if (early) { out = {...out, events: [...out.events, {type: 'ready', t: round(early.t - 0.001)}].sort((x, y) => x.t - y.t)}; continue; }
    // up to the new look's hold at least: a quiet page sends no frame until the hold forces one (round 7: Track's Actions came 2.2 s after its cut)
    const until = Math.max(cut + 1.5, hold.t + 0.5);
    // after the cut, the new page as its look shows it, by the gate's own measure (strayFrames): a half-painted page "closer to new" is not it
    // (round 7: Track's Actions half drawn at the cut, held 1.1 s by a quiet page; looksNew let it through, the gate failed)
    const settled = frame => meanDiff(thumb(frame.file, box), b) <= STRAY_MAX;
    const after = out.frames.slice(frameAt(out.frames, cut)).filter(frame => frame.t <= until), firstNew = after.find(settled);
    if (firstNew && after[0] && !settled(after[0])) out = cutOut(out, cut, firstNew.t);
  }
  return out;
}
