// Nothing is cut at a hero frame's left or right edge (round 9, owner 24 Oct 2026, on phones: "the video is stripped ... I don't see the full video
// frame"; chose "whole column, centred"): at each look the recorder notes the lines of words and the cards on screen (edgesScript, run in the page),
// the phone camera frames around them (whole.mjs), and edgeCuts finds those the camera's view crosses at its left or right edge when the look is shown. A line of words is never cut; a card that would
// fit in the view is shown whole. Used by media.mjs before it draws a copy. Pure but edgesScript. Guard: desktop/test/media-edges.test.js.
import {cameraAt, cameraKeys} from './camera.mjs';
import {edgeItems, edgeItemsY} from './whole.mjs';

// Runs in the page (page.evaluate): the visible lines of words and the cards (an element with a visible border and a rounded corner) inside the
// window. -> [{k: 'text'|'card', x, y, w, h, text}] in CSS px.
export function edgesScript() {
  const W = innerWidth, H = innerHeight, out = [], seen = r => r.width > 0 && r.height > 0 && r.right > 0 && r.left < W && r.bottom > 0 && r.top < H;
  const range = document.createRange(), walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim() || !node.parentElement?.checkVisibility?.({opacityProperty: true, visibilityProperty: true})) continue;
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) if (seen(r)) out.push({k: 'text', x: r.x, y: r.y, w: r.width, h: r.height, text: node.textContent.trim().slice(0, 30)});
  }
  for (const el of document.body.querySelectorAll('*')) {
    const style = getComputedStyle(el), r = el.getBoundingClientRect();
    if (!seen(r) || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) continue;
    const border = parseFloat(style.borderLeftWidth) > 0 && style.borderLeftStyle !== 'none' && !/rgba\(.*, 0\)$/.test(style.borderLeftColor);
    if (border && parseFloat(style.borderTopLeftRadius) > 0 && r.height > 24) out.push({k: 'card', x: r.x, y: r.y, w: r.width, h: r.height, text: (el.id ? `#${el.id}` : `.${[...el.classList].slice(0, 2).join('.')}`)});
  }
  return out;
}

// What a view cuts: lines of words and cards (that would fit the widest view, maxW) its left or right edge crosses or touches (whole.mjs
// edgeItems, the rule the phone camera frames by). Only what shows inside the view's height counts. -> [{k, side, text}]. Pure.
// pageH: the page's height, to check the top and bottom edges too (run 25), maxH the tallest view's height (without it, left and right only).
export function cutsIn(view, edges, maxW = view.w, pageW = Infinity, pageH = null, maxH = Infinity) {
  const at = (x, side) => edgeItems(x, side, edges, view.y, view.y + view.h, maxW, pageW).map(item => ({k: item.k, side, text: item.text}));
  const atY = (y, side) => (pageH === null ? [] : edgeItemsY(y, side, edges, view.x, view.x + view.w, maxH, pageH).map(item => ({k: item.k, side, text: item.text})));
  return [...at(view.x, 'left'), ...at(view.x + view.w, 'right'), ...atY(view.y, 'top'), ...atY(view.y + view.h, 'bottom')];
}

const SAMPLES = 10;
// Each look of a recording whose view cuts something for most of its hold. opts: renderPlan's
// {steady, phone}. -> [{look, say, cuts}] for the looks that cut, so the scenes can name a whole card (phoneLook) instead. Pure.
// keys: the camera's keys to check (default: the camera's own; a test passes a camera that did not see the edges).
export function edgeCuts(log, speed = 1, {steady = false, phone = null, keys = cameraKeys({...log, speed, steady, phone})} = {}) {
  const aspect = phone ? phone.aspect : log.viewport.w / log.viewport.h, least = Math.max(1, log.viewport.w / aspect / log.viewport.h);   // as camera.mjs
  return log.events.filter(event => event.type === 'hold' && event.edges && (event.box || event.phoneBox)).map(event => {
    // a cut is one most of the hold shows (SAMPLES points): the camera glides in and out at a hold's ends, and may arrive late in it (run 18: the
    // end of a hold was mid-glide; run 20: picture in picture arrived after the hold's middle), so one moment can read a passing edge as a cut
    // ... and only once it has arrived: a screen that opens wide glides in over the hold's first part (hold.mjs openWide)
    const seen = new Map(), end = event.t + (event.s || 0), from = Math.max(event.t, ...keys.filter(key => key.t > event.t && key.t < end).map(key => key.t));
    for (let k = 0; k < SAMPLES; k++) {
      const view = cameraAt(keys, from + (end - from) * (k + 0.5) / SAMPLES, log.viewport, speed, phone);
      const now = new Map(cutsIn(view, event.edges, log.viewport.w / least, log.viewport.w, log.viewport.h, log.viewport.w / least / aspect).map(cut => [`${cut.k} ${cut.side} ${cut.text}`, cut]));
      for (const [key, cut] of now) seen.set(key, {cut, n: (seen.get(key)?.n || 0) + 1});   // once per moment (ten rows cut at once are one moment)
    }
    const cuts = [...seen.values()].filter(({n}) => n > SAMPLES / 2).map(({cut}) => cut);
    return {look: (phone && event.phoneBox ? event.phoneLook : null) || event.look, say: event.say, cuts};
  }).filter(hit => hit.cuts.length);
}

// One readable line per look that cuts. -> string.
export const edgeReport = (name, hits, copy) => hits.map(hit => `media: ${name} (${copy}): look ${JSON.stringify(hit.look)}${hit.say ? ` ("${hit.say}")` : ''} cuts `
  + hit.cuts.slice(0, 4).map(cut => `${cut.k} "${cut.text}" at the ${cut.side}`).join(', ') + `: frame a whole card or column (phoneLook) or a narrower one`).join('\n');
