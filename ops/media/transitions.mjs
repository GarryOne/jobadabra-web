// The hero's transitions between screens (media; round 6, owner 24 Oct 2026: "make a nice transition effect, not just an instant screen/image
// replacement ... use most of them: fade, slide, tiles, title card, whenever it fits better"). Each cut look, part join and clip switch names its
// kind in scenes.mjs (`into`): slide = one screen to another; tiles = time passed; card = a short card says how she got there; fade = the same
// screen changing. render.cjs draws them, camera.mjs renderPlan says which frame is in which, cuts.mjs checks the frames outside them. Pure.
// Guard: desktop/test/media-transitions.test.js.
import {pageChange} from './hold.mjs';

export const KINDS = ['fade', 'slide', 'tiles', 'card'];
// Output seconds each takes; a card fades in over the old screen, stays (time added to the clip), then fades out over the new one.
export const LENGTH = {fade: 0.45, slide: 0.5, tiles: 0.7};
export const CARD = {in: 0.3, hold: 0.8, out: 0.3};
export const CARD_TEXT_MAX = 40;   // characters: the card's words, read in under a second

// When the camera cuts to the look at events[i]: the first page change after the previous look, else the moment the page changed by itself
// ('ready'), else the hold's start (camera.mjs cameraKeys cuts here). Pure.
export function cutMoment(events, i) {
  const earlier = events.slice(0, i), lastLook = earlier.filter(prev => prev.type === 'hold').at(-1);
  const after = prev => !lastLook || prev.t > lastLook.t;
  const change = earlier.find(prev => pageChange(prev) && after(prev)), shown = earlier.find(prev => prev.type === 'ready' && after(prev));
  return change ? change.t : shown ? shown.t : events[i].t;
}

// Every transition of a recorded log, in recorded seconds: [{kind, at, from, to, card?}]; `at` is the cut, from..to the frames it covers.
// A clip's first look may open on a card (a part whose join is a card): at 0, no fade-in. Run on the log withCards made. Pure.
export function transitions(log, speed = 1) {
  const out = [];
  log.events.forEach((event, i) => {
    if (event.type !== 'hold' || !event.into) return;
    const first = !log.events.slice(0, i).some(prev => prev.type === 'hold');
    if (!first && !event.cut) return;
    if (first && event.into !== 'card') return;   // a part's join is drawn by media.mjs joined
    const at = first ? 0 : cutMoment(log.events, i);
    if (event.into === 'card') out.push({kind: 'card', at, from: first ? 0 : at - CARD.in * speed, to: at + (CARD.hold + CARD.out) * speed, card: event.card});
    else out.push({kind: event.into, at, from: at, to: at + LENGTH[event.into] * speed});
  });
  return out;
}

// The log with each card's hold added at its cut: the old screen's last frame stays under the card, later frames and events move on by the
// card's time; a hold that started at the cut gets it added. Last first, so earlier times stay put. Pure.
export function withCards(log, speed = 1) {
  const d = Number((CARD.hold * speed).toFixed(3)), round = t => Number(t.toFixed(3));
  const cards = log.events.map((event, i) => ({event, i})).filter(({event, i}) => event.type === 'hold' && event.into === 'card'
    && (event.cut || !log.events.slice(0, i).some(prev => prev.type === 'hold')));
  return cards.reverse().reduce((out, {event}) => {
    const i = out.events.indexOf(out.events.find(e => e.t === event.t && e.type === 'hold' && e.look === event.look));
    const first = !out.events.slice(0, i).some(prev => prev.type === 'hold'), at = first ? 0 : cutMoment(out.events, i);
    return {...out,
      frames: out.frames.map(frame => (frame.t > at ? {...frame, t: round(frame.t + d)} : frame)),
      events: out.events.map((e, k) => (e.t > at ? {...e, t: round(e.t + d)} : k === i ? {...e, s: round(e.s + d)} : e))};
  }, log);
}

// What a frame at recorded time t draws on top of the plain frame: {kind, mix 0..1, at} for fade/slide/tiles (the old screen is the frame shown just
// before `at`), {card, alpha} for a card. null outside every transition. Pure.
export function blendAt(list, t, speed = 1) {
  const ease = x => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };
  const on = list.find(item => t >= item.from && t < item.to);
  if (!on) return null;
  if (on.kind !== 'card') return {kind: on.kind, at: on.at, mix: ease((t - on.from) / (on.to - on.from))};
  const fadeOut = on.at + CARD.hold * speed;
  const alpha = t < on.at ? ease((t - on.from) / (CARD.in * speed)) : t < fadeOut ? 1 : 1 - ease((t - fadeOut) / (CARD.out * speed));
  return {card: on.card, alpha};
}

// The ffmpeg filter that plays a piece's parts in order, each coming in by its kind over the last frame of the one before (held, so no part loses
// time): fade, slide (a soft wipe from the right), tiles; a part that opens on its own card comes in by a fade. lengths: each master's seconds,
// kinds: each later part's `into`, slide: seconds per transition in the masters (recorded time). -> {filter, out}. Pure.
export const XFADE = {fade: 'fade', slide: 'smoothleft', tiles: 'pixelize', card: 'fade'};
export function joinFilter(lengths, kinds, speed = 1) {
  const parts = [];
  let last = '[0:v]', at = 0;
  for (let i = 1; i < lengths.length; i++) {
    const kind = kinds[i - 1] || 'slide', d = Number(((kind === 'card' ? CARD.in : LENGTH[kind]) * speed).toFixed(3));
    at += lengths[i - 1];
    parts.push(`${last}tpad=stop_mode=clone:stop_duration=${d},settb=AVTB[p${i}]`, `[${i}:v]settb=AVTB[n${i}]`,
      `[p${i}][n${i}]xfade=transition=${XFADE[kind]}:duration=${d}:offset=${at.toFixed(3)}[j${i}]`);
    last = `[j${i}]`;
  }
  return {filter: parts.join(';'), out: last};
}

// A part whose join is a card (`into: 'card'`, `card`: its words) opens on that card: its first look carries it (withCards adds the time). Pure.
export const openOnCard = piece => (piece.into !== 'card' ? piece
  : {...piece, steps: piece.steps.map((step, k, all) => (k === all.findIndex(each => each.hold) ? {...step, into: 'card', card: piece.card} : step))});
