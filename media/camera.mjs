// The product videos' camera and cursor, as pure functions of the recorder's click log (media): where the view zooms, where the
// cursor glides, when a click ring shows. The renderer (render.cjs) draws real recorded frames through this camera, so the app's pixels are never redrawn.
// Coordinates are the page's CSS pixels. Guard: desktop/test/media-camera.test.js.

export const MAX_ZOOM = 3;   // a click's zoom (scenes.mjs TAP_ZOOM, owner 25 Oct 2026: "zoom in more agressively where the click goes")
export const FILL = 0.9;           // a zoomed box fills this share of the view
export const LOOK_HEIGHT = 0.6;    // a tall box (a drawer, a list) is framed by its top part: where the action is
export const CLICK_ZOOM = 2;       // a click zooms onto its target (owner, 21 Oct 2026: "when there is a click, zoom on that click")
export const CONTEXT = 0.4;        // a first hold with no box (a context look) shows the whole screen this long (output seconds); the lead-in before the first look is context too
export const ZOOM_IN = 0.55;       // output seconds a camera move takes (a sped-up clip stretches it in recorded time)
export const SETTLE = 0.25;        // output seconds the camera stays on a click's target after the press, so the click is seen
export const RING = 0.6;           // seconds a click ring grows and fades
export const REST = 0.6;           // output seconds a look that opened wide rests after its glide in, at least (run 26: a phone hold's scroll left none)

import {GLIDE_IN, OPEN_WIDE, pageChange} from './hold.mjs';
import {blendAt, cutMoment, transitions} from './transitions.mjs';
import {wholeFrame} from './whole.mjs';

export const ease = x => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };

export const PHONE_GAIN = 1.8;    // the phone copy zooms this much closer than the desktop one (owner, 24 Oct 2026: "a tighter mobile crop")
export const PHONE_MAX = 3.3;     // ... up to here: frames are 2x the page (round 9: 2.5x the window), so a 3.3x crop still fills the 1080-wide phone copy

// The camera state that frames `box` at zoom z: centred on it, so a box in a corner puts the camera in that corner (cameraAt keeps the view on the page).
// A box wider than the zoomed view is read from its left edge (names and scores first), not cropped on both sides. `aspect`: the output's (16:10, or the phone's).
// Round 4 (owner, 24 Oct 2026: "we cropped too hard, let's leave a bit of space"): the box keeps LOOK_MARGIN on every side, the top of a tall one too.
const frame = (look, z, viewport, aspect) => {
  const box = padded(look), w = viewport.w / z, h = w / aspect;
  return {cx: box.width > w ? box.x + w / 2 : box.x + box.width / 2, cy: box.y + Math.min(box.height, h) / 2, z};
};

// The hero shows a look's WHOLE width (round 2, owner 24 Oct 2026: "wrong cropping": a card wider than its zoomed view lost its right side, its button
// with it): the zoom asked for is lowered until the box fits with a small margin, never below the whole page. -> the zoom used. Pure.
export const LOOK_MARGIN = 40;   // CSS px kept on each side of a look (round 4: 12 px read as cropped)
export const padded = box => ({x: box.x - LOOK_MARGIN, y: box.y - LOOK_MARGIN, width: box.width + 2 * LOOK_MARGIN, height: box.height + 2 * LOOK_MARGIN});
export const fitWidth = (box, z, viewport) => Math.min(z, Math.max(1, viewport.w / padded(box).width));
// A hero look whose zoom fitWidth had to lower by more than this share reads small: the recording names it (`onFit`) so a narrower look is picked.
export const FIT_WARN = 0.85;
// The desktop copy never zooms out below this to keep a frame edge clean (whole.mjs floor; owner, 25 Oct 2026: "zoom deeper, about 1.5x ... not just 10%"): a line of words
// at the edge, outside the look, may be cut instead (edges.mjs logs it). media/fits.mjs MIN_ZOOM is the same bar.
export const DESKTOP_FLOOR = 1.5;
// ... and a click's zoom on the desktop copy never backs off below this (owner, 25 Oct 2026, Set up: "zoom in more on the click area": the clean-edge search had pulled
// the zoom on Use Free AI back to ~1.5): it is the close-up, a cut word at its edge is context.
export const CLICK_FLOOR = 2.2;
// ... and its frame slides at most this far (CSS px) off the look's centre for clean edges: the Find jobs card read off-centre (owner, 25 Oct 2026, two shots)
export const DESKTOP_SHIFT = 40;

// log: {viewport: {w, h}, events: [{t, type: 'click'|'press'|'hold'|'mark', box?, zoom?, cut?, phoneZoom?, phoneBox?, opensWide?}]} -> [{t, cx, cy, z, glide?}], time-ordered; a key is where
// the camera has ARRIVED at t. Default: the whole screen shows only at the start (context); a click zooms onto its target while the cursor glides there; a hold
// with a box zooms onto that box (its own zoom, else the box fitted). `steady` (the hero, owner 24 Oct 2026: "zoom toward the result, then hold"): the piece opens
// already framed on its first look, a click moves nothing unless it carries a zoom, and a look marked `cut` switches at the page change (the first mark or
// press since the previous look) instead of gliding. `phone` ({aspect}): the phone copy's camera, each zoom PHONE_GAIN closer (or the step's phoneZoom),
// up to PHONE_MAX and never so wide that the view leaves the page. `speed`: the clip is played faster, so moves are stretched in recorded time.
// `steady` looks fit their box's width (fitWidth), the phone copy's too (round 8, owner 24 Oct 2026: "on mobile ... the videos are not centered"): a tighter
// phone shot comes from a narrower phoneLook, never from cutting the look; onFit(event, asked, used) hears each lowered zoom.
// When a look that opens wide (hold.mjs openWide) shows the whole window and glides in, in recorded seconds: from (its cut, or the hold, whichever
// is later; 0 for the piece's first look), open (how long the whole window shows), glide. The look then rests REST before its hold ends or the
// next screen cuts in. Shared by cameraKeys and the stray-frame check (cuts.mjs, run 27: it read the wide opening as another page). Pure.
export function wideOpening(events, i, speed = 1, first = false) {
  const event = events[i], nextCut = events.findIndex((later, j) => j > i && later.type === 'hold' && later.cut && later.box);
  const from = first ? 0 : Math.max(event.cut ? cutMoment(events, i) : event.t, event.t);
  const end = Math.min(event.t + (event.s || 0), nextCut < 0 ? Infinity : cutMoment(events, nextCut)) - REST * speed;
  const glide = Math.min(GLIDE_IN * speed, Math.max(0.05, end - from));
  return {from, open: Math.max(0, Math.min(OPEN_WIDE * speed, end - from - glide)), glide};
}

export function cameraKeys({viewport, events, speed = 1, steady = false, phone = null, onFit = null}) {
  const aspect = phone ? phone.aspect : viewport.w / viewport.h;
  const least = Math.max(1, viewport.w / aspect / viewport.h);   // the widest view that still fits the page's height
  const zoomed = (event, z) => Math.max(least, phone ? Math.min(PHONE_MAX, event.phoneZoom ?? z * PHONE_GAIN) : Math.min(MAX_ZOOM, z));
  const full = {cx: viewport.w / 2, cy: viewport.h / 2, z: least};
  const keys = [{t: 0, ...full}];
  const move = (t, state) => { if (t > keys.at(-1).t) keys.push({t, ...state}); };
  const dur = ZOOM_IN * speed;
  events.forEach((event, i) => {
    if (event.type === 'click' && event.box && (!steady || event.zoom)) {
      const press = events.slice(i + 1).find(next => next.type === 'press');
      const fit = 0.6 * Math.min(viewport.w / event.box.width, viewport.h / event.box.height), z = zoomed(event, Math.max(1.4, Math.min(event.zoom ?? CLICK_ZOOM, fit)));
      // a steady click zoom is framed whole like a look (run 25: Set up's zoom onto Save cut a line of words at the left), by the page's last edges
      const edges = steady && events.slice(0, i).filter(prev => prev.type === 'hold' && prev.edges).at(-1)?.edges;
      move(press ? press.t : event.t + 0.7, edges ? wholeFrame({frameAt: zoom => frame(event.box, zoom, viewport, aspect), z, least, look: padded(event.box), edges, viewport, aspect, floor: phone ? 0 : CLICK_FLOOR, shift: phone ? Infinity : DESKTOP_SHIFT})
        : frame(event.box, z, viewport, aspect));
    }
    if (event.type !== 'hold') return;
    const earlier = events.slice(0, i);
    const first = !earlier.some(prev => prev.type === 'hold' || (prev.type === 'click' && !steady));   // the piece's first look
    const look = (phone && event.phoneBox) || event.box;   // the phone copy may frame its own box (phoneLook)
    if (!look || event.zoom === 1) { if (first || event.zoom === 1) move(event.t + (first ? CONTEXT * speed : dur), full); return; }
    const box = {...look, height: Math.min(look.height, viewport.h * LOOK_HEIGHT)};
    const fit = FILL * Math.min(viewport.w / box.width, viewport.h / box.height);
    const asked = zoomed(event, Math.max(1, event.zoom ?? fit));
    const used = steady ? Math.max(least, fitWidth(box, asked, viewport)) : asked;   // the phone copy too (round 8: its wide looks lost their right side)
    if (used < asked) onFit?.(event, asked, used);
    // both copies' edges fall in gaps, never through words or a card (whole.mjs; round 9, owner 24 Oct 2026, phones: "the video is stripped";
    // then of the desktop copy, with two shots of the logo and cards cut at its edges: "port this to desktop as well")
    const target = event.edges ? wholeFrame({frameAt: z => frame(box, z, viewport, aspect), z: used, least, look: padded(box), edges: event.edges, viewport, aspect, floor: phone ? 0 : DESKTOP_FLOOR, shift: phone ? Infinity : DESKTOP_SHIFT})
      : frame(box, used, viewport, aspect);
    if (target.z < used - 1e-6) onFit?.(event, asked, target.z);   // zoomed out for clean edges: the log names it like a fitted look
    // every new screen opens on the whole window, then glides in (hold.mjs openWide; owner 25 Oct 2026: "how to get there ... the context")
    // It always ends with the look at rest for REST (the phone take's scroll can use a hold's time): the wide moment shrinks first, then the glide.
    // The hold ends at its own end or at the next screen's cut, whichever comes first (run 26: Set up's proposal painted mid-hold).
    const openWide = () => {
      const {from, open, glide} = wideOpening(events, i, speed, first);
      if (open > 0) move(from + open, full);
      move(from + open + glide, {...target, glide});
    };
    if (steady && first) { if (event.opensWide) openWide(); else keys[0] = {t: 0, ...target}; return; }
    const lastLook = earlier.filter(prev => prev.type === 'hold').at(-1);
    if (event.cut) {
      const at = cutMoment(events, i);   // the first page change since the last look, else when the page changed by itself (transitions.mjs)
      move(at - 0.001, {cx: keys.at(-1).cx, cy: keys.at(-1).cy, z: keys.at(-1).z});
      move(at, event.opensWide ? full : target);
      if (event.opensWide) openWide();
      return;
    }
    const after = earlier.reverse().find(prev => prev.type === 'press');
    const start = first ? 0 : (after ? Math.max(0, after.t + SETTLE * speed - event.t) : 0);
    move(event.t + start + dur, target);
  });
  return keys.sort((a, b) => a.t - b.t);
}

// The camera at time t: eased from the key before t to the next one, the move filling the last `dur` seconds before the next key; zoom eases geometrically
// (feels even); the view never leaves the page. -> {x, y, w, h}: the page area shown, in CSS px. `phone`: {aspect} of the phone copy.
export function cameraAt(keys, t, viewport, speed = 1, phone = null) {
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1] || a;
  const span = Math.max(0.0005, Math.min(b.glide ?? ZOOM_IN * speed, b.t - a.t));   // a glide in (opensWide) takes its own, slower time
  const u = b === a ? 1 : ease((t - (b.t - span)) / span);
  const z = a.z * (b.z / a.z) ** u, cx = a.cx + (b.cx - a.cx) * u, cy = a.cy + (b.cy - a.cy) * u;
  const w = viewport.w / z, h = phone ? w / phone.aspect : viewport.h / z;
  return {x: Math.min(Math.max(cx - w / 2, 0), viewport.w - w), y: Math.min(Math.max(cy - h / 2, 0), viewport.h - h), w, h};
}

// The cursor at time t: at rest, then gliding to each click's target between its 'click' and 'press' events.
// -> {x, y, press}: page CSS px; press = seconds since the last press (null before any), for the click ring.
export function cursorAt(events, t, viewport) {
  let x = viewport.w * 0.62, y = viewport.h * 0.55, press = null;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.type !== 'click' || event.t > t || !event.box) continue;
    const pressed = events.slice(i + 1).find(next => next.type === 'press');
    const end = pressed ? pressed.t : event.t + 0.7;
    const u = ease((t - event.t) / Math.max(0.1, end - event.t - 0.08));
    const tx = event.box.x + event.box.width / 2, ty = event.box.y + event.box.height / 2;
    x += (tx - x) * u; y += (ty - y) * u;
    if (pressed && t >= pressed.t) press = t - pressed.t;
  }
  return {x, y, press};
}

// A hero clip starts at its first look (round 2, owner 24 Oct 2026: Find "starts on the list already full": the frames before the first look showed the
// page before its scene set it up). -> the log with every time moved so the first look's hold starts at 0 (plus FIRST_LAG for the screen to repaint);
// the frame shown then becomes frame 0, earlier frames and events are dropped. No look: the log unchanged. Pure.
export const FIRST_LAG = 0.3;
export function fromFirstLook(log) {
  const hold = log.events.find(event => event.type === 'hold' && event.box);
  if (!hold) return log;
  const t0 = hold.t + FIRST_LAG, at = frameAt(log.frames, t0);
  const frames = log.frames.slice(at).map((frame, i) => ({...frame, t: i ? Number((frame.t - t0).toFixed(3)) : 0}));
  const events = log.events.filter(event => event === hold || event.t >= t0).map(event => ({...event, t: Math.max(0, Number((event.t - t0).toFixed(3))), ...(event === hold ? {s: Math.max(0.1, event.s - FIRST_LAG)} : {})}));
  return {...log, frames, events};
}

// A part that ends on a press (a tap marked `end`, round 6: the Apply press hands over to the Applying card in picture in picture): the recording
// keeps running after it, so every frame and event after the 'end' mark is dropped; the next part comes in by its join. A quiet page sends no frame
// while the cursor glides (take 5: the part ended at 1.3 s, before its press), so the last frame is held up to the mark. No mark: unchanged. Pure.
export function untilEnd(log) {
  const end = log.events.find(event => event.type === 'end');
  if (!end) return log;
  const frames = log.frames.filter((frame, i) => frame.t <= end.t || i === 0), last = frames.at(-1);
  if (last.t < end.t) frames.push({...last, t: end.t});
  return {...log, frames, events: log.events.filter(event => event.t <= end.t && event !== end)};
}

// A clip that ends on a still page keeps its last hold whole: the recorder gets a frame only when the page changes, and the video ends at the last
// frame, so a quiet last hold was cut short and the poster (90% into it) fell past the end (Track on the 3-core runner, run 40156280319: poster at
// 38.98 s, frames to 38.9 s). The last frame is held to the end of the last hold, as untilEnd does for a press. Pure.
export function toLastHold(log) {
  const end = Math.max(0, ...log.events.filter(event => event.type === 'hold').map(event => Number((event.t + event.s).toFixed(3))));
  const last = log.frames.at(-1);
  return last && end > last.t ? {...log, frames: [...log.frames, {...last, t: end, held: true}]} : log;   // held: no new capture (check.mjs stallsOf)
}

// The poster's moment: the end of the hold marked poster (the filled form, ready to submit), else the first frame. Pure.
export function posterTime(events = []) {
  const hold = events.find(event => event.type === 'hold' && event.poster);
  return hold ? Number((hold.t + hold.s * 0.9).toFixed(2)) : 0;
}

// Each beat's moment in the played clip (round 2, owner 24 Oct 2026): the looks' holds in order, matched to the scene's looks that name a beat, at 90% of
// the hold, in output seconds (the clip plays `speed` times faster). What the side-by-side and the beats sheet show, one frame per step. Pure.
export function beatTimes(events = [], steps = [], speed = 1) {
  // every hold, with a look or not: the recorders log each one (round 5: "Ready to submit" was a hold on the same framing, no look, and had no beat)
  const stills = steps.filter(step => step.hold), holds = events.filter(event => event.type === 'hold');
  return stills.map((step, i) => (step.beat && holds[i] ? {t: Number(((holds[i].t + holds[i].s * 0.9) / speed).toFixed(2)), beat: step.beat} : null)).filter(Boolean);
}

// Every output frame of a video at `fps`: which recorded frame, the page area shown, the cursor, and inside a transition (transitions.mjs) the old
// screen and how far it is mixed (`from`, `kind`, `mix`) or a card's words and opacity (`card`, `cardAlpha`). What render.cjs draws. Pure.
// log: {viewport, frames: [{t, file}], events}. cursor: false hides it (a piece with no clicks). steady/phone: as cameraKeys.
export function renderPlan(log, fps = 30, speed = 1, {steady = false, phone = null, onFit = null} = {}) {
  const keys = cameraKeys({...log, speed, steady, phone, onFit}), end = log.frames.at(-1).t, cursor = log.events.some(event => event.type === 'click');
  const list = steady ? transitions(log, speed) : [], out = [];
  for (let i = 0; i <= Math.floor(end * fps); i++) {
    const t = i / fps, view = cameraAt(keys, t, log.viewport, speed, phone), at = cursorAt(log.events, t, log.viewport), blend = blendAt(list, t, speed);
    // fade, slide, tiles: the old screen is the frame shown just before the cut, through the camera it had then (render.cjs mixes them)
    const before = blend?.kind ? blend.at - 0.002 : null;
    const from = before === null ? {} : {from: {file: log.frames[frameAt(log.frames, before)].file, ...cameraAt(keys, before, log.viewport, speed, phone)}, kind: blend.kind, mix: blend.mix};
    // a caption gives way to a title card before the card is half in (owner, 25 Oct 2026, Track: the next part's caption showed over the Gmail one): the old caption
    // is gone and the new one waits until the card is half out (render.cjs multiplies the caption's alpha by sayKeep)
    const card = blend?.card ? {card: blend.card, cardAlpha: blend.alpha, sayKeep: Math.max(0, 1 - 2 * blend.alpha)} : {};
    out.push({file: log.frames[frameAt(log.frames, t)].file, ...view, cx: at.x, cy: at.y, press: at.press, cursor, ...from, ...card});
  }
  return out;
}

// The frame shown at time t: the last recorded frame at or before t (frames: [{t}] in time order). -> index.
export function frameAt(frames, t) {
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid].t <= t) lo = mid; else hi = mid - 1; }
  return lo;
}

// A crop inside the window (a card may reach past its edge). -> null when nothing is left. Pure.
export function clipTo(box, view) {
  const x = Math.max(0, box.x), y = Math.max(0, box.y), width = Math.min(view.w, box.x + box.width) - x, height = Math.min(view.h, box.y + box.height) - y;
  return width >= 1 && height >= 1 ? {x, y, width, height} : null;
}
