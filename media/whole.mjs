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
// margin: CSS px stricter than the check (the camera frames with MARGIN, so float rounding between its frame and the played view never reads as a cut;
// run 18: a sidebar card 0.04 px past the edge).
export function edgeItems(x, side, edges, top, bottom, maxW, pageW = Infinity, margin = 0) {
  if (side === 'left' ? x <= 0.5 : x >= pageW - 0.5) return [];
  const slack = EDGE_SLACK - margin, clear = EDGE_CLEAR + margin;
  return edges.filter(item => item.y + item.h > top + slack && item.y < bottom - slack && !(item.k === 'card' && item.w > maxW * CARD_FIT)
    && (side === 'left' ? item.x + item.w > x + slack && item.x < x + clear : item.x < x - slack && item.x + item.w > x - clear));
}
// The same for a frame's top or bottom edge at y (side 'top' | 'bottom') between left and right (run 25: the bottom edge cut Set up's Back and
// Continue): a line of words (a button's label too) the edge runs through. Cards may run on past it (a list or a form continuing below reads as
// "more below", not as cut), and words need only not be crossed: with the left/right rule's 12-px clearance and cards, nearly every shot found no
// clean height and zoomed out to the whole window (measured on run 25), leaving nothing to glide into. The page's own top and bottom cut nothing. Pure.
export function edgeItemsY(y, side, edges, left, right, maxH, pageH = Infinity, margin = 0) {
  if (side === 'top' ? y <= 0.5 : y >= pageH - 0.5) return [];
  const slack = EDGE_SLACK - margin;
  return edges.filter(item => item.k === 'text' && item.x + item.w > left + slack && item.x < right - slack
    && (side === 'top' ? item.y + item.h > y + slack && item.y < y + margin : item.y < y - slack && item.y + item.h > y - margin));   // margin: stricter
}
export const MARGIN = 2;
export const cutsAt = (x, side, edges, top, bottom, maxW, pageW, margin = 0) => edgeItems(x, side, edges, top, bottom, maxW, pageW, margin).length > 0;

// frameAt(z) -> {cx, cy, z}: the camera's own centred frame at zoom z (camera.mjs). look: the box that must stay in view (padded).
// -> the frame nearest frameAt(z) whose four edges cut nothing, at the highest zoom from z down to `least` that has one; frameAt(least) if none
// (the whole page: its own borders cut nothing). Top and bottom first (at the centred left), then left and right at that height. Pure.
// floor (the desktop copy, owner 25 Oct 2026: "zoom deeper, about 1.5x"): never zoom out below it to find a clean edge; at the floor, the frame whose left and
// right edges cut the fewest lines and cards (nearest the centred one) is the answer, and the log names what it cuts (edges.mjs, desktop: context, not an error).
export function wholeFrame({frameAt, z, least, look, edges, viewport, aspect, floor = 0}) {
  const maxW = viewport.w / least, maxH = maxW / aspect, bottom = Math.max(least, Math.min(z, floor));
  for (let zoom = z; ; zoom = Math.max(bottom, zoom * STEP)) {
    const base = frameAt(zoom), w = viewport.w / zoom, h = w / aspect;
    const want = Math.min(Math.max(base.cx - w / 2, 0), viewport.w - w), wantTop = Math.min(Math.max(base.cy - h / 2, 0), viewport.h - h);
    const near = edges.filter(item => item.x + item.w > want - EDGE_CLEAR && item.x < want + w + EDGE_CLEAR);
    const flat = top => !edgeItemsY(top, 'top', near, want, want + w, maxH, viewport.h, MARGIN).length && !edgeItemsY(top + h, 'bottom', near, want, want + w, maxH, viewport.h, MARGIN).length;
    let top = flat(wantTop) ? wantTop : null;
    if (top === null) {
      const lo = Math.max(0, look.y + Math.min(look.height, h) - h), hi = Math.min(viewport.h - h, look.y);   // tops that keep the look's top part in view
      for (let t = Math.floor(lo); t <= hi; t += 2) if (flat(t) && (top === null || Math.abs(t - wantTop) < Math.abs(top - wantTop))) top = t;
      if (top === null && hi >= viewport.h - h - 0.5 && flat(viewport.h - h)) top = viewport.h - h;   // pinned to the page's bottom
    }
    if (top !== null) {
      const bottom = top + h, cy = top + h / 2;
      const lo = Math.max(0, look.x + look.width - w), hi = Math.min(viewport.w - w, look.x);   // left edges that keep the look in view, on the page
      const clean = left => !cutsAt(left, 'left', edges, top, bottom, maxW, viewport.w, MARGIN) && !cutsAt(left + w, 'right', edges, top, bottom, maxW, viewport.w, MARGIN);
      if (clean(want)) return {cx: want + w / 2, cy, z: zoom};
      let best = null;
      for (let left = Math.floor(lo); left <= hi; left += 2) if (clean(left) && (best === null || Math.abs(left - want) < Math.abs(best - want))) best = left;
      if (best !== null) return {cx: best + w / 2, cy, z: zoom};
    }
    if (zoom <= bottom) {
      if (bottom <= least) return frameAt(least);
      const base = frameAt(zoom), w = viewport.w / zoom, h = w / aspect, want = Math.min(Math.max(base.cx - w / 2, 0), viewport.w - w);
      const top = Math.min(Math.max(base.cy - h / 2, 0), viewport.h - h), lo = Math.max(0, look.x + look.width - w), hi = Math.min(viewport.w - w, look.x);
      const cost = left => edgeItems(left, 'left', edges, top, top + h, maxW, viewport.w, MARGIN).length + edgeItems(left + w, 'right', edges, top, top + h, maxW, viewport.w, MARGIN).length;
      let best = want;
      for (let left = Math.floor(lo); left <= hi; left += 2) if (cost(left) < cost(best) || (cost(left) === cost(best) && Math.abs(left - want) < Math.abs(best - want))) best = left;
      return {cx: best + w / 2, cy: base.cy, z: zoom};
    }
  }
}
