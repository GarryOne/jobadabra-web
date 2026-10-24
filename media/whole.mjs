// The phone copy's frame shows whole things (round 9, owner 24 Oct 2026: "on mobile, the video is stripped ... I don't see the full video frame";
// chose "whole column, centred"): given the words and cards on screen at a look (edges.mjs edgesScript), the camera picks, nearest its own
// centred frame, a view whose left and right edges both fall in a gap, never through a line of words or a card that would fit; when none exists at
// its zoom, it zooms out a step and looks again. Pure, no imports (camera.mjs uses it, edges.mjs checks the result). Guard: desktop/test/media-edges.test.js.

export const EDGE_SLACK = 4;   // CSS px a line or card may cross an edge by (anti-aliasing, a shadow) before it reads as cut
export const CARD_FIT = 0.92;  // a card narrower than this share of the view could have been shown whole
const STEP = 0.98;             // each zoom-out step keeps this share of the zoom (fine: a clean window may exist only within ~30 px of widths)

// Whether a vertical line at x cuts something shown between top and bottom: a line of words, or a card narrower than CARD_FIT of the view. Pure.
export function cutsAt(x, edges, top, bottom, viewW) {
  return edges.some(item => item.y + item.h > top + EDGE_SLACK && item.y < bottom - EDGE_SLACK && item.x < x - EDGE_SLACK && item.x + item.w > x + EDGE_SLACK
    && !(item.k === 'card' && item.w > viewW * CARD_FIT));
}

// frameAt(z) -> {cx, cy, z}: the camera's own centred frame at zoom z (camera.mjs). look: the box that must stay in view (padded).
// -> the frame nearest frameAt(z) whose edges cut nothing, at the highest zoom from z down to `least` that has one; frameAt(least) if none. Pure.
export function wholeFrame({frameAt, z, least, look, edges, viewport, aspect}) {
  for (let zoom = z; ; zoom = Math.max(least, zoom * STEP)) {
    const base = frameAt(zoom), w = viewport.w / zoom, h = w / aspect;
    const top = Math.min(Math.max(base.cy - h / 2, 0), viewport.h - h), bottom = top + h;
    const lo = Math.max(0, look.x + look.width - w), hi = Math.min(viewport.w - w, look.x);   // left edges that keep the look in view, on the page
    const want = Math.min(Math.max(base.cx - w / 2, 0), viewport.w - w);
    const clean = left => !cutsAt(left, edges, top, bottom, w) && !cutsAt(left + w, edges, top, bottom, w);
    if (clean(want)) return base;
    let best = null;
    for (let left = Math.floor(lo); left <= hi; left += 2) if (clean(left) && (best === null || Math.abs(left - want) < Math.abs(best - want))) best = left;
    if (best !== null) return {cx: best + w / 2, cy: base.cy, z: zoom};
    if (zoom <= least) return base;
  }
}
