// A hold's log entry and its timing for the media recorders (record-app.mjs, record-extension.mjs): pure, no Playwright, so the tests
// (desktop/test/media-camera.test.js) import it on any runner.
// The seconds a hold has left once its boxes are measured (round 2: measuring under load took ~0.5 s, the log still said the whole hold, so beat frames and
// posters landed after the page had moved on). The entry's t is stamped after measuring, so its `s` is this, and the recorder waits exactly this. Pure.
export const holdLeft = (hold, startedMs, nowMs) => Math.max(0.3, hold - (nowMs - startedMs) / 1000);
// A hold's log entry: what the camera needs (cameraKeys): its box, zoom, a cut at the page change, the phone copy's own zoom or box. `lookWidth` (CSS px)
// (`phoneLookWidth`: the same for the phone copy's own phoneLook) keeps the look's left part on purpose (round 2: a 1512-px card whose words sit on its left; the camera shows a look whole, so a wide one reads small).
export const leftPart = (box, width) => (box && width ? {...box, width: Math.min(box.width, width)} : box);
export const holdEvent = (item, box, phoneBox = null, s = item.hold) => ({type: 'hold', look: item.look || null, box: leftPart(box, item.lookWidth), s, ...(item.zoom ? {zoom: item.zoom} : {}),
  ...(item.cut ? {cut: true} : {}), ...(item.phoneZoom ? {phoneZoom: item.phoneZoom} : {}), ...(phoneBox ? {phoneBox: leftPart(phoneBox, item.phoneLookWidth)} : {}), ...(item.poster ? {poster: true} : {}), ...(item.say ? {say: item.say} : {}), ...(item.tag ? {tag: item.tag} : {}),
  ...(item.into ? {into: item.into} : {}), ...(item.lead ? {lead: true} : {}), ...(item.into === 'card' ? {card: {tag: item.tag || '', text: item.card || ''}} : {})});   // the transition into this look (transitions.mjs)
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
export const phoneTake = (piece, {window, zoom = null}) => ({...piece, window, ...(zoom ? {zoom, settings: {...piece.settings, zoom}} : {}),
  steps: piece.steps.map(step => (!step.hold ? step : {...wholeLook(step), fitScroll: true, ...(step.phoneLook ? {look: step.phoneLook} : {})}))});

// The scroll that brings a look's box to the window's middle (CSS px, + = down). Pure.
export const centreDelta = (box, view) => Math.round(box.y + box.height / 2 - view.h / 2);
// A fitScroll hold whose look is off screen (round 9: Set up's strategy look was 43% below the phone window): scroll the look's nearest
// scrolling ancestor (or the window) so the look sits in the middle, smoothly, as a person would. -> true when it scrolled. Takes a Playwright page.
export async function scrollLookIn(page, look, box, view) {
  const first = [look].flat().find(one => one !== 'panel');
  if (!first || !box) return false;
  return page.locator(first).first().evaluate((el, dy) => {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) { node.scrollBy({top: dy, behavior: 'smooth'}); return true; }
    }
    window.scrollBy({top: dy, behavior: 'smooth'});
    return true;
  }, centreDelta(box, view)).catch(() => false);
}
