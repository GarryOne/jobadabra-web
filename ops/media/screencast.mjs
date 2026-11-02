// A page's CDP screencast to numbered JPEG files with each frame's own time, and the step log both recorders share (media).
// The renderer resamples the frames to a fixed rate, so an uneven capture rate never changes the video's speed.
import fs from 'node:fs';
import path from 'node:path';

export async function startScreencast(page, dir, {quality = 92, maxWidth = 3600, maxHeight = 2250} = {}) {
  fs.mkdirSync(dir, {recursive: true});
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  let t0 = null;
  cdp.on('Page.screencastFrame', frame => {
    cdp.send('Page.screencastFrameAck', {sessionId: frame.sessionId}).catch(() => {});
    if (t0 == null) return;
    const file = `f${String(frames.length).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(dir, file), Buffer.from(frame.data, 'base64'));
    frames.push({t: Math.max(0, frame.metadata.timestamp - t0), file});
  });
  await cdp.send('Page.startScreencast', {format: 'jpeg', quality, maxWidth, maxHeight, everyNthFrame: 1});
  await page.waitForTimeout(300);
  t0 = Date.now() / 1000;
  // A still page sends no frame until something changes, so a quiet first screen would have none: nudge the paint once to get its frame.
  const nudge = async () => { await page.evaluate(() => { document.documentElement.style.opacity = '0.995'; return new Promise(done => setTimeout(() => { document.documentElement.style.opacity = ''; done(); }, 60)); }).catch(() => {}); await page.waitForTimeout(120); };
  await nudge();
  return {
    clock: () => Date.now() / 1000 - t0,
    paint: nudge,   // one forced frame: each hold calls it, so a hold with no frame after it is a stalled capture (check.mjs captureGaps)
    stop: async () => {
      await nudge();   // a last frame, so a still ending is as long as it was held
      await cdp.send('Page.stopScreencast').catch(() => {});
      await cdp.detach().catch(() => {});
      if (!frames.length) throw new Error('media: the screencast sent no frame');
      return frames;
    },
  };
}

// The click log: each event stamped with the screencast's clock.
export function stepLog(clock, paint = async () => {}) {
  const events = [];
  return {events, paint, add: event => events.push({t: Number(clock().toFixed(3)), ...event})};
}
