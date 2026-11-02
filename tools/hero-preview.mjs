// The hero's side-by-side review image (owner, 24 Oct 2026: "judge readability inside the hero, not fullscreen"): today's live hero | this tree's hero,
// at a desktop and a phone width, inside the real page, same scale. Round 2 (owner, 24 Oct 2026: steps missing, wrong crops, nobody saw it before
// shipping): every phase shows EVERY beat of the new clip (its manifest's beats, captioned with what the viewer should read) under three moments of
// today's clip, not only the result. Demo media only; a fresh browser profile (no cookies).
//   node tools/hero-preview.mjs --out <png> [--media <media set dir>] [--before <url>] [--web website/public] [--tree .overlay]
//   --media   a set from media/media.mjs (its files win over website/public/media), to review clips before placing them
//   --before  the page to compare against (default https://www.jobadabra.top; "none" leaves the left column out)
//   --only    desktop | phone: one width (a PR's Before/After image per width)
// Prints the PNG path and each frame's caption. Used by the redo-site-hero-video skill (.claude/skills).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/).filter(Boolean).map(part => { const [k, ...v] = part.split(' '); return [k, v.join(' ')]; }));
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.resolve(args.out || 'hero-preview.png');
const web = path.resolve(repo, args.web || 'website/public');
const media = args.media ? path.resolve(args.media) : null;
const before = args.before === 'none' ? null : (args.before || 'https://www.jobadabra.top');
const tree = path.resolve(repo, args.tree || '.overlay');
const require = createRequire(path.join(tree, 'desktop', 'e2e', 'package.json'));
const {chromium} = require('playwright-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';   // has the H.264 decoder the phone copies need
const SIZES = [{name: 'Desktop 1440', width: 1440, height: 900, scale: 1}, {name: 'Phone 390', width: 390, height: 844, scale: 2, mobile: true}];
const only = (args.only || '').toLowerCase();
const PHASES = ['Set up', 'Find', 'Apply', 'Track'];
const TYPES = {'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon'};

// Serves web/public, a media set laid over /media/, with ranges (video seeking needs them).
function serve() {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    let file = path.join(web, rel);
    if (media && rel.startsWith('/media/') && fs.existsSync(path.join(media, rel.slice(7)))) file = path.join(media, rel.slice(7));
    if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
    if (!file.startsWith(web) && !(media && file.startsWith(media))) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    const size = fs.statSync(file).size, type = TYPES[path.extname(file)] || 'application/octet-stream';
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range) {
      const start = Number(range[1] || 0), end = range[2] ? Number(range[2]) : size - 1;
      res.writeHead(206, {'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1});
      fs.createReadStream(file, {start, end}).pipe(res);
    } else { res.writeHead(200, {'content-type': type, 'accept-ranges': 'bytes', 'content-length': size}); fs.createReadStream(file).pipe(res); }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const PIECES = ['hero-onboarding', 'hero', 'hero-fill', 'hero-track'];
// The moments to show per phase: the set's beats (media.mjs writes them into its manifest.json), else the clip's last moment; today's clips: three moments.
const setBeats = (() => {
  try { return Object.fromEntries(JSON.parse(fs.readFileSync(path.join(media, 'manifest.json'), 'utf8')).items.filter(entry => entry.beats).map(entry => [entry.name, entry.beats])); } catch { return {}; }
})();
const momentsOf = (k, live) => live ? [{at: 0.12}, {at: 0.5}, {at: 0.96}] : (setBeats[PIECES[k]] || [{at: 0.96, beat: 'result'}]).map(beat => (beat.t != null ? {t: beat.t, beat: beat.beat} : beat));

// A stage (this tree's, or today's live one): each step clicked, paused, sought to each moment, the stage shot with its caption.
async function shootStage(page, url, live = false) {
  await page.goto(url, {waitUntil: 'networkidle'});
  await page.locator('#hero-stage').scrollIntoViewIfNeeded();
  await page.addStyleTag({content: '.stage-screen::after { display: none !important }'});   // the play mark of a paused stage (round 4): the preview pauses to shoot, the frame stays clear
  const phases = [];
  for (let k = 0; k < PHASES.length; k++) {
    const shots = [];
    for (const moment of momentsOf(k, live)) {
      const caption = await page.evaluate(async ({k, moment}) => {
        const root = document.getElementById('hero-stage');
        root.querySelectorAll('.stage-steps button:not(.stage-pause)')[k].click();
        if (root.querySelector('.stage-pause').getAttribute('aria-label') === 'Pause') root.querySelector('.stage-pause').click();
        const clip = root.querySelectorAll('video.slide')[k];
        clip.preload = 'auto';
        if (clip.readyState < 1) { clip.load(); await new Promise(done => { clip.addEventListener('loadedmetadata', done, {once: true}); setTimeout(done, 8000); }); }
        const end = Math.max(0, (clip.duration || 1) - 0.1);
        clip.currentTime = Math.min(end, moment.t ?? (clip.duration || 1) * moment.at);
        await new Promise(done => { clip.addEventListener('seeked', done, {once: true}); setTimeout(done, 4000); });
        const words = sel => root.querySelector(sel)?.textContent || '';
        return `${moment.beat || `${clip.currentTime.toFixed(1)} s`} · ${words('.stage-later')} ${words('.stage-cap b')} · ${clip.currentSrc.split('/').pop()} ${clip.videoWidth}x${clip.videoHeight}`;
      }, {k, moment});
      await page.waitForTimeout(500);
      shots.push({png: await page.locator('#hero-stage').screenshot(), caption});
    }
    phases.push(shots);
  }
  return phases;
}

// The page to compare against: whatever its hero is, the region around its first video, at four moments of its loop.
async function shootBefore(page, url) {
  await page.goto(url, {waitUntil: 'networkidle'});
  const hero = page.locator('video').first().locator('xpath=ancestor::*[self::section or contains(@class, "hero")][1]');
  await hero.scrollIntoViewIfNeeded();
  const shots = [];
  for (const at of [3, 9, 15, 21]) {
    await page.waitForTimeout(Math.max(0, at * 1000 - (shots.length ? (shots.length * 6 + 3) * 1000 : 0)));
    shots.push({png: await hero.screenshot(), caption: `live hero at ${at} s`});
  }
  return shots;
}

const server = await serve();
const local = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({headless: true, ...(fs.existsSync(CHROME) ? {executablePath: CHROME} : {})});
const rows = [];
try {
  for (const size of SIZES.filter(one => !only || one.name.toLowerCase().startsWith(only))) {
    const open = async () => (await browser.newContext({viewport: {width: size.width, height: size.height}, deviceScaleFactor: size.scale, isMobile: Boolean(size.mobile), hasTouch: Boolean(size.mobile)})).newPage();
    const now = await shootStage(await open(), local);
    let then = [];
    if (before) { const page = await open(); await page.goto(before, {waitUntil: 'networkidle'}); then = await page.locator('#hero-stage').count() ? await shootStage(page, before, true) : (await shootBefore(page, before)).map(shot => [shot]); }
    PHASES.forEach((phase, k) => rows.push({size: size.name, phase, now: now[k], then: then[k] || []}));
  }
  const img = shot => `<figure><img src="data:image/png;base64,${shot.png.toString('base64')}"><figcaption>${shot.caption.replace(/</g, '&lt;')}</figcaption></figure>`;
  const strip = (label, shots, phone) => `<div class="strip ${phone ? 'phone' : ''}"><b>${label}</b><div class="frames">${shots.map(img).join('')}</div></div>`;
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#111;color:#eee;font:14px system-ui}h2{font-size:16px;margin:30px 0 8px;color:#ffb224}
    .strip{margin:6px 0 14px}.strip>b{display:block;color:#aaa;font-size:12px;margin-bottom:4px}.frames{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px;align-items:start}
    .phone .frames{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}img{max-width:100%;border:1px solid #333}figure{margin:0}figcaption{color:#ccc;font-size:12px;margin-top:4px}</style>
    <div style="color:#ffb224;font-weight:600">Hero side-by-side: per phase, today's clip (3 moments) over the new clip (every beat). New: this tree${media ? ', ' + path.basename(media) : ''}</div>
    ${rows.map(row => `<h2>${row.size} · ${row.phase}</h2>${before ? strip(`Today (${before})`, row.then, row.size.startsWith('Phone')) : ''}${strip('New', row.now, row.size.startsWith('Phone'))}`).join('')}`;
  const sheet = await (await browser.newContext({viewport: {width: 1800, height: 900}})).newPage();
  await sheet.setContent(html, {waitUntil: 'load'});
  fs.writeFileSync(out, await sheet.screenshot({fullPage: true, ...(/\.jpe?g$/i.test(out) ? {type: 'jpeg', quality: 82} : {})}));   // a PR's .jpg is a real JPEG (round 2: PNG bytes under .jpg)
  rows.forEach(row => row.now.forEach(shot => console.log(`hero-preview: ${row.size} · ${row.phase}: ${shot.caption}`)));
  console.log(`hero-preview: ${out}`);
} finally { await browser.close(); server.close(); }
