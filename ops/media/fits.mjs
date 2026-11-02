// The desktop hero's depth gate (owner, 25 Oct 2026: "zoom deeper, about 1.5x ... not just 10%. Probably about 50%"). A look wider than its zoomed view
// is shown whole at a lower zoom (camera.mjs fitWidth), and a whole card lands near 1.0-1.2x: small text. A desktop look that ends below MIN_ZOOM stops the
// piece before any render, naming the look, its width and the width that fits; the fix is a narrower look (a button and its label, one field), never a
// lower bar. A look that is meant to show a whole screen says `wide: true` in scenes.mjs. Pure. Guard: desktop/test/media-fits.test.js.
import {LOOK_MARGIN, renderPlan} from './camera.mjs';

export const MIN_ZOOM = 1.5;
// The widest look (CSS px) that still shows whole at `zoom` on a page `viewport.w` wide.
export const widestAt = (zoom, viewport) => Math.floor(viewport.w / zoom - 2 * LOOK_MARGIN);

// log -> [{look, say, asked, used, width, fits}], the desktop copy's looks that end below MIN_ZOOM (the lowest zoom of each look kept).
export function shallowLooks(log, speed = 1, steady = true) {
  const seen = new Map();
  renderPlan(log, 30, speed, {steady, onFit: (event, asked, used) => {
    const old = seen.get(event);
    if (!old || used < old.used) seen.set(event, {event, asked, used});
  }});
  const shallow = [];
  for (const {event, asked, used} of seen.values()) {
    if (event.wide || used >= MIN_ZOOM - 1e-6) continue;
    shallow.push({look: event.look, say: event.say, asked, used, width: Math.round(event.box.width), fits: widestAt(MIN_ZOOM, log.viewport)});
  }
  return shallow;
}

export const fitReport = (name, hits) => hits.map(hit => `media: ${name} (desktop): look ${JSON.stringify(hit.look)}${hit.say ? ` ("${hit.say}")` : ''} ends at zoom ${hit.used.toFixed(2)} `
  + `(asked ${hit.asked.toFixed(2)}), below ${MIN_ZOOM}: SMALL TEXT. Its box is ${hit.width} px wide, ${MIN_ZOOM}x shows ${hit.fits}: pick a narrower look (a button and its label, one field), or mark a whole-screen look wide: true`).join('\n');
