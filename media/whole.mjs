// The phone copy's frame shows whole things (round 9, owner 24 Oct 2026: "on mobile, the video is stripped ... I don't see the full video frame";
// chose "whole column, centred"): given the words and cards on screen at a look (edges.mjs edgesScript), the camera picks, nearest its own
// centred frame, a view whose left and right edges both fall in a gap, never through a line of words or a card that would fit; when none exists at
// its zoom, it zooms out a step and looks again. Pure, no imports (camera.mjs uses it, edges.mjs checks the result). Guard: desktop/test/media-edges.test.js.

export const EDGE_SLACK = 4;   // CSS px a line or card may cross an edge by (anti-aliasing, a shadow) before it reads as cut
export const CARD_FIT = 0.92;  // a card narrower than this share of the WIDEST view could have been shown whole (round 9: a card wider than the
                               // current view but not the widest was cut: the Free card, the text box)
const STEP = 0.995;            // each zoom-out step keeps this share of the zoom: a frame pinned at the page border moves its far edge only by
                               // zooming, and a clean spot in a 16-px gutter is ~8 px wide (0.98 jumped 20-30 px past it; round 9)

export const EDGE_CLEAR = 12;  // CSS px a shown line or card keeps from the frame's edge (round 9: a card border touching it read as cut)

// What a frame edge at x (side 'left': the view starts there; 'right': it ends there) cuts or touches between top and bottom: a line of words, or a
// card narrower than CARD_FIT of the widest view the camera can show (maxW: the page width at the least zoom). -> the items. Pure.
// An edge on the page's own border (x <= 0 or >= pageW) cuts nothing: nothing lies beyond it (round 9: the whole window read as cut at its sidebar).
export function edgeItems(x, side, edges, top, bottom, maxW, pageW = Infinity) {
  if (side === 'left' ? x <= 0.5 : x >= pageW - 0.5) return [];
  return edges.filter(item => item.y + item.h > top + EDGE_SLACK && item.y < bottom - EDGE_SLACK && !(item.k === 'card' && item.w > maxW * CARD_FIT)
    && (side === 'left' ? item.x + item.w > x + EDGE_SLACK && item.x < x + EDGE_CLEAR : item.x < x - EDGE_SLACK && item.x + item.w > x - EDGE_CLEAR));
}
export const cutsAt = (x, side, edges, top, bottom, maxW, pageW) => edgeItems(x, side, edges, top, bottom, maxW, pageW).length > 0;

// frameAt(z) -> {cx, cy, z}: the camera's own centred frame at zoom z (camera.mjs). look: the box that must stay in view (padded).
// -> the frame nearest frameAt(z) whose edges cut nothing, at the highest zoom from z down to `least` that has one; frameAt(least) if none. Pure.
export function wholeFrame({frameAt, z, least, look, edges, viewport, aspect}) {
  for (let zoom = z; ; zoom = Math.max(least, zoom * STEP)) {
    const base = frameAt(zoom), w = viewport.w / zoom, h = w / aspect;
    const top = Math.min(Math.max(base.cy - h / 2, 0), viewport.h - h), bottom = top + h;
    const lo = Math.max(0, look.x + look.width - w), hi = Math.min(viewport.w - w, look.x);   // left edges that keep the look in view, on the page
    const want = Math.min(Math.max(base.cx - w / 2, 0), viewport.w - w);
    const maxW = viewport.w / least, clean = left => !cutsAt(left, 'left', edges, top, bottom, maxW, viewport.w) && !cutsAt(left + w, 'right', edges, top, bottom, maxW, viewport.w);
    if (clean(want)) return base;
    let best = null;
    for (let left = Math.floor(lo); left <= hi; left += 2) if (clean(left) && (best === null || Math.abs(left - want) < Math.abs(best - want))) best = left;
    if (best !== null) return {cx: best + w / 2, cy: base.cy, z: zoom};
    if (zoom <= least) return base;
  }
}
