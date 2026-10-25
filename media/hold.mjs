// A hold's log entry and its timing for the media recorders (record-app.mjs, record-extension.mjs): pure, no Playwright, so the tests
// (desktop/test/media-camera.test.js) import it on any runner.
// The seconds a hold has left once its boxes are measured (round 2: measuring under load took ~0.5 s, the log still said the whole hold, so beat frames and
// posters landed after the page had moved on). The entry's t is stamped after measuring, so its `s` is this, and the recorder waits exactly this. Pure.
// It keeps at least half the hold (run 28, a loaded Mac: measuring took 1.5 of Track's 1.8-s practise look, 0.3 s were left, the camera never arrived).
export const HOLD_KEEP = 0.5;
export const holdLeft = (hold, startedMs, nowMs) => Math.max(hold * HOLD_KEEP, hold - (nowMs - startedMs) / 1000);
// A hold's log entry: what the camera needs (cameraKeys): its box, zoom, a cut at the page change, the phone copy's own zoom or box. `lookWidth` (CSS px)
// (`phoneLookWidth`: the same for the phone copy's own phoneLook) keeps the look's left part on purpose (round 2: a 1512-px card whose words sit on its left; the camera shows a look whole, so a wide one reads small).
export const leftPart = (box, width) => (box && width ? {...box, width: Math.min(box.width, width)} : box);
export const holdEvent = (item, box, phoneBox = null, s = item.hold) => ({type: 'hold', look: item.look || null, box: leftPart(box, item.lookWidth), s, ...(item.zoom ? {zoom: item.zoom} : {}),
  ...(item.cut ? {cut: true} : {}), ...(item.phoneZoom ? {phoneZoom: item.phoneZoom} : {}), ...(phoneBox ? {phoneBox: leftPart(phoneBox, item.phoneLookWidth)} : {}), ...(item.poster ? {poster: true} : {}), ...(item.say ? {say: item.say} : {}), ...(item.tag ? {tag: item.tag} : {}),
  ...(item.into ? {into: item.into} : {}), ...(item.lead ? {lead: true} : {}), ...(item.wide ? {wide: true} : {}), ...(item.wand ? {wand: true} : {}), ...(item.opensWide ? {opensWide: true} : {}), ...(item.into === 'card' ? {card: {tag: item.tag || '', text: item.card || ''}} : {})});   // the transition into this look (transitions.mjs)
// How much of a look's box is outside the window. A look measured off screen is framed on whatever sits at the window's
// edge (round 5: the Applying page kept the Jobs page's scroll, her job's header was at y -308 and the camera showed the needs list): the recorders stop. Pure.
// The share of a look's box outside the window, 0..1: a form a few px taller than the window (its bottom padding) is fine, a header above it is not.
export const offScreen = (box, view) => {
  if (!box || !view || !box.width || !box.height) return 0;
  const w = Math.max(0, Math.min(box.x + box.width, view.w) - Math.max(box.x, 0)), h = Math.max(0, Math.min(box.y + box.height, view.h) - Math.max(box.y, 0));
  return Number((1 - (w * h) / (box.width * box.height)).toFixed(3));
};
export const OFF_MAX = 0.1;   // more than this hidden stops the recording
// An event where the page changed: a mark (an action's moment), or a press that acts at once. A press `held` on screen first (PRESS_SHOW) changes
// nothing; the mark logged when its action runs does. Read by camera.mjs and cuts.mjs. Pure.
export const pageChange = event => event.type === 'mark' || (event.type === 'press' && !event.held);
// Output seconds a press stays on screen before the page reacts (round 4, owner 24 Oct 2026: "when clicking Apply, the screen changes too fast, let's wait
// half a second"): every press in a video, recorded as PRESS_SHOW x the clip's speed.
export const PRESS_SHOW = 0.5;
// How many CSS px of a line of words the edge of `lookWidth` cuts through (round 4: the centred Find jobs card kept its left 1040 px; its description ran
// across that edge). A lookWidth ends in a gap between columns (round 2: the job row's fit, role, company): words wholly right of it are left out on
// purpose, a line crossing it is cut. lines: the look's text, one box per laid-out line. -> 0 when no line crosses the edge. Pure.
export const wordsCut = (box, width, lines) => {
  if (!box || !width || !lines?.length) return 0;
  const edge = box.x + Math.min(box.width, width);
  return Math.max(0, ...lines.filter(line => line.x < edge - 1).map(line => Math.round(line.x + line.width - edge)));
};
// A left part (lookWidth) whose edge cuts a line of words moves back to the gap before that line, until no line is cut (PR5, 25 Oct 2026: the
// 1440-px desktop page reflowed Find's row and "Ready to submit" crossed the 862 px picked on the 1800-px page). -> the width, or null when the gap is
// under GAP_FLOOR of the asked width (then the look needs another part). Pure.
export const GAP_FLOOR = 0.6;
export const gapWidth = (box, width, lines, margin = 8) => {
  let w = width;
  while (w && wordsCut(box, w, lines) > 4) {
    const edge = box.x + Math.min(box.width, w), crossing = lines.filter(line => line.x < edge - 1 && line.x + line.width > edge + 4);
    w = crossing.length ? Math.floor(Math.min(...crossing.map(line => line.x)) - box.x - margin) : w - 1;
    if (w < width * GAP_FLOOR) return null;
  }
  return w;
};
// The look the recorder watches for after step i (record-app.mjs logs 'ready' when it is on screen, cuts.mjs drops the frames before it): the next look
// if it is marked `cut`, else null. Pure.
export const nextCut = (steps, i) => { const look = steps.slice(i + 1).find(step => step.hold && step.look); return look?.cut ? {look: look.look} : null; };
// Picture in picture (pip.mjs): a step marked `sync` logs where its recording meets the other one (the fill starts, the card starts following it);
// a step marked `lead` that is not a hold logs that its recording becomes the main picture (a hold carries `lead` in its own entry). Before the step.
export const stepMarks = (item, log) => {
  if (item.sync && !item.fill) log.add({type: 'sync'});   // a fill syncs at its first filled field (record-extension.mjs)
  if (item.lead && !item.hold) log.add({type: 'lead'});
};

// The phone take's steps: its own window, and each look its phoneLook (round 9: the desktop look "first row down to hers" did not fit the narrow
// window, whose rows stack on 3 lines, and stopped the take); the phone camera frames that look whole (whole.mjs). shape: the piece's phone
// {window, zoom}: the app's text size in that window (its settings' zoom; the extension's page is the window shrunk by it). Pure.
// Its holds may scroll (fitScroll): the phone window is 528 css px tall, so a look the desktop take shows in place can sit below it.
// Every phone look is shown whole: no left part (lookWidth / phoneLookWidth, hand-picked for the wide layout; run 20: Track's 460-px part cut a
// line of words in the one-column layout), the whole-frame camera (whole.mjs) keeps the edges clean.
const wholeLook = ({lookWidth, phoneLookWidth, ...step}) => step;
// The desktop take: the app at the piece's desktop text size (scenes.mjs DESKTOP: a 1440-px page instead of 1800, text 25% bigger). Pure.
export const desktopTake = piece => (piece.source === 'app' && piece.desktop?.zoom ? {...piece, settings: {...piece.settings, zoom: piece.desktop.zoom}} : piece);
export const phoneTake = (piece, {window, zoom = null}) => ({...piece, window, ...(zoom ? {zoom, settings: {...piece.settings, zoom}} : {}),
  steps: piece.steps.map(step => (!step.hold ? step : {...wholeLook(step), fitScroll: true, ...(step.phoneLook ? {look: step.phoneLook} : {})}))});

// Every new screen opens on the whole app window, then glides in (owner, 25 Oct 2026, a general rule: "Let the user understand where is that zoomed
// part placed in the app. Basically how to get there"): the first look and every cut look of a steady piece hold OPEN_WIDE + GLIDE_IN output seconds
// longer, so the look still rests its own time after the camera arrives (camera.mjs). Pure. Guard: desktop/test/media-camera.test.js.
// ms a hold waits for its look to become visible before it stops with "nothing to look at" (both recorders)
export const SHOW_WAIT = 10000;
export const OPEN_WIDE = 0.6;   // output seconds the whole window shows before the glide
export const GLIDE_IN = 0.9;    // output seconds the glide in takes (a click's or a look's own move is ZOOM_IN, 0.55)
export const opensWide = (steps, i) => Boolean(steps[i].hold && steps[i].look && steps[i].zoom !== 1 && (steps[i].cut || !steps.slice(0, i).some(step => step.hold)));
export const openWide = piece => (piece.camera !== 'steady' ? piece : {...piece,
  steps: piece.steps.map((step, i, steps) => (opensWide(steps, i) ? {...step, hold: Number((step.hold + (OPEN_WIDE + GLIDE_IN) * (piece.speed || 1)).toFixed(3)), opensWide: true} : step))});

// Runs in the page on a click target: the other control (button, link, field) under its middle, or null when the click reaches the target itself.
export function clickedControl(el) {
  const r = el.getBoundingClientRect(), at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  const control = at?.closest('button, a, input, select, textarea, [role=button]');
  return control && control !== el && el.contains(control) ? `${control.tagName.toLowerCase()}.${[...control.classList].join('.')}` : null;
}

// The scroll that brings a look's box to the window's middle (CSS px, + = down). Pure.
export const centreDelta = (box, view) => Math.round(box.y + box.height / 2 - view.h / 2);
// A fitScroll hold whose look is off screen (round 9: Set up's strategy look was 43% below the phone window): scroll the look's nearest
// scrolling ancestor (or the window) so the look sits in the middle, smoothly, as a person would, and wait for it to end. -> true when it scrolled.
// The scroll is logged as 'scroll' (its start) and 'scrolled' (its end, as two events so every step that moves times moves both): its frames show
// the new page sliding under the old look, so frameCuts cuts them out (run 24). Takes a Playwright page and the step log.
export async function scrollLookIn(page, look, box, view, log) {
  const first = [look].flat().find(one => one !== 'panel');
  if (!first || !box) return false;
  log.add({type: 'scroll'});
  const scrolled = await page.locator(first).first().evaluate((el, dy) => {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) { node.scrollBy({top: dy, behavior: 'smooth'}); return true; }
    }
    window.scrollBy({top: dy, behavior: 'smooth'});
    return true;
  }, centreDelta(box, view)).catch(() => false);
  if (!scrolled) { log.events.splice(log.events.findLastIndex(event => event.type === 'scroll'), 1); return false; }
  await page.waitForTimeout(600);   // a smooth scroll's end
  log.add({type: 'scrolled'});
  return true;
}
