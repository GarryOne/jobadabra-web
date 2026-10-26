// One page, rendered through the REAL Worker (workers/www/index.js) on demo data, shot at every width and theme, and refused when it is unstyled
// (owner, 25 Oct 2026: jobadabra-web#92's Before/After images were the admin page as raw HTML, rendered without the layout that adds its CSS).
//   tools/site-run.sh node tools/page-shot.mjs --path /admin/promo-codes --width 1440,390 --theme dark,light --out <dir> [--name before] [--seed promo-codes] [--full] [--scroll '<selector>']
// Writes <dir>/<name>-<width>[-<theme>].png (theme in the name only when more than one). Exit 1 when the page is unstyled (nothing is written for it).
// The data is an in-memory database built from db/migrations/ plus a seed (tools/page-shot-seeds.mjs); the owner login is the test key. The live site is never contacted:
// every request to another host is blocked. Run inside the overlay (tools/site-run.sh), from the checkout of the tree to shoot (before: a worktree of the old commit).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {unstyledReasons} from './page-shot-check.mjs';
import {seeds} from './page-shot-seeds.mjs';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/).filter(Boolean).map(part => { const [k, ...v] = part.split(' '); return [k, v.join(' ') || true]; }));
const root = process.cwd();
const pagePath = args.path, out = path.resolve(args.out || '.');
if (!pagePath || !pagePath.startsWith('/')) { console.error('usage: tools/site-run.sh node tools/page-shot.mjs --path /admin/promo-codes [--width 1440,390] [--theme dark,light] --out <dir> [--name before] [--seed promo-codes] [--full]'); process.exit(2); }
const widths = String(args.width || '1440,390').split(',').map(Number), themes = String(args.theme || 'dark').split(','), name = args.name || 'shot';
const ORIGIN = 'https://www.jobpilotto.top', KEY = 'page-shot-key';
const TYPES = {'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm'};

function d1() {
  const db = new DatabaseSync(':memory:');
  for (const file of fs.readdirSync(path.join(root, 'db/migrations')).filter(f => f.endsWith('.sql')).sort()) db.exec(fs.readFileSync(path.join(root, 'db/migrations', file), 'utf8'));
  const statement = (sql, bound = []) => ({bind: (...values) => statement(sql, values), run: async () => { const r = db.prepare(sql).run(...bound); return {meta: {changes: Number(r.changes)}}; },
    all: async () => ({results: db.prepare(sql).all(...bound)}), first: async () => db.prepare(sql).get(...bound)});
  return {prepare: sql => statement(sql)};
}
const assetsDir = path.join(root, 'web/public');
const ASSETS = {fetch: request => {   // what Workers static assets do for web/public
  let rel = decodeURIComponent(new URL(request.url).pathname); if (rel.endsWith('/')) rel += 'index.html';
  let file = path.join(assetsDir, rel); if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
  if (!file.startsWith(assetsDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('Not found', {status: 404});
  return new Response(fs.readFileSync(file), {headers: {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream'}});
}};
const kv = new Map();
const env = {STATS: d1(), STATS_KEY: 'page-shot-browser-key', STATS_API_KEY: KEY, STATS_SALT: 's', PRO_PLAN: 'test', PROMO_CODE_KEY: 'page-shot-code-key', ASSETS,
  WAITLIST: {get: async k => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, list: async () => ({keys: []})}};
const worker = (await import(pathToFileURL(path.join(root, 'workers/www/index.js')))).default;
const call = (pathname, init = {}) => worker.fetch(new Request(`${ORIGIN}${pathname}`, {...init, headers: {Authorization: `Bearer ${KEY}`, Origin: ORIGIN, 'User-Agent': 'Mozilla/5.0 (Macintosh)', ...init.headers}}), env, {});
if (args.seed) {
  if (!seeds[args.seed]) { console.error(`unknown seed "${args.seed}" (tools/page-shot-seeds.mjs has: ${Object.keys(seeds).join(', ')})`); process.exit(2); }
  await seeds[args.seed]({env, call});
}

const server = http.createServer(async (req, res) => {   // the browser talks to this; the Worker sees the real origin and the owner login
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise(resolve => { const parts = []; req.on('data', c => parts.push(c)); req.on('end', () => resolve(Buffer.concat(parts))); });
  const response = await call(req.url, {method: req.method, body, headers: {'Content-Type': req.headers['content-type'] || 'text/plain'}});
  res.writeHead(response.status, Object.fromEntries([...response.headers].filter(([k]) => k !== 'content-encoding' && k !== 'set-cookie')));
  res.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

// playwright-core: the tree's own, else the public checkout's (the overlay has no node_modules)
const pwHome = [root, process.env.JOBADABRA_PUBLIC, path.join(process.env.HOME || '', 'jobadabra')].filter(Boolean).find(dir => fs.existsSync(path.join(dir, 'desktop/e2e/node_modules/playwright-core')));
if (!pwHome) { console.error('page-shot: playwright-core not found (npm ci in desktop/e2e of the public repo, or set JOBADABRA_PUBLIC)'); process.exit(2); }
const {chromium} = createRequire(path.join(pwHome, 'desktop', 'e2e', 'package.json'))('playwright-core');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch(fs.existsSync(CHROME) ? {executablePath: CHROME} : {});
fs.mkdirSync(out, {recursive: true});
let failed = false;
try {
  for (const width of widths) for (const theme of themes) {
    const context = await browser.newContext({viewport: {width, height: width > 600 ? 900 : 844}, deviceScaleFactor: width > 600 ? 1 : 2, colorScheme: theme, reducedMotion: 'reduce'});
    await context.route(url => !url.href.startsWith(base), route => route.abort());   // never the live site
    const page = await context.newPage(), bad = [];
    page.on('requestfailed', r => { if (r.url().startsWith(base)) bad.push({url: r.url(), type: r.resourceType(), reason: r.failure()?.errorText}); });
    page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400 && ['stylesheet', 'font'].includes(r.request().resourceType())) bad.push({url: r.url(), type: r.request().resourceType(), reason: `HTTP ${r.status()}`}); });
    const response = await page.goto(base + pagePath, {waitUntil: 'networkidle'});
    await page.evaluate(() => document.fonts.ready);
    const seen = await page.evaluate(() => { const b = getComputedStyle(document.body), h = getComputedStyle(document.documentElement);
      return {bodyFont: b.fontFamily, bodyBackground: b.backgroundColor, background: h.backgroundColor, sheets: [...document.styleSheets].filter(s => { try { return s.cssRules.length; } catch { return true; } }).length}; });
    const reasons = unstyledReasons({...seen, failed: bad, status: response.status()});
    const file = path.join(out, `${name}-${width}${themes.length > 1 ? `-${theme}` : ''}.png`);
    if (reasons.length) { failed = true; console.error(`UNSTYLED ${pagePath} at ${width}px ${theme}: ${reasons.join('; ')}`); }
    else {
      if (args.scroll) { await page.locator(String(args.scroll)).first().scrollIntoViewIfNeeded(); await page.waitForTimeout(500); }   // --scroll '<selector>': shoot that part of the page (a full-page shot leaves iframes blank)
      await page.screenshot({path: file, fullPage: !!args.full}); console.log(file);
    }
    await context.close();
  }
} finally { await browser.close(); server.close(); }
process.exit(failed ? 1 : 0);
