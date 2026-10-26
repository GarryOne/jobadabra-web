// The site sends Windows visitors to the Microsoft Store and the extension's button to the Chrome Web Store (owner, 26 Oct 2026: "Store first,
// .exe small"): a Store install never shows SmartScreen or Edge's Keep/Delete. The .exe stays one small link. Every click is still counted.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import worker from '../../workers/www/index.js';
import {STORES} from '../../api/downloads.js';

function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../../db/migrations/0001_stats.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../../db/migrations/0032_download_net.sql', import.meta.url), 'utf8'));
  const statement = (sql, args = []) => ({bind: (...values) => statement(sql, values), run: async () => db.prepare(sql).run(...args),
    all: async () => ({results: db.prepare(sql).all(...args)})});
  return {db, prepare: sql => statement(sql)};
}
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0';
const click = path => new Request(`https://www.jobadabra.top${path}`, {headers: {'CF-Connecting-IP': '1.2.3.4', 'User-Agent': WINDOWS}});
const env = () => ({STATS: d1(), STATS_SALT: 'salt', ASSETS: {fetch: () => new Response('asset')}, fetcher: async () => new Response('', {status: 503})});

test('the Windows button opens the Microsoft Store listing, and the click is counted', async () => {
  const e = env();
  const response = await worker.fetch(click('/download/windows?from=download'), e, {});
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), 'https://apps.microsoft.com/detail/9NW1JJ7Z90MP');
  assert.deepEqual(e.STATS.db.prepare('SELECT platform, button FROM downloads').all().map(r => ({...r})), [{platform: 'windows', button: 'download'}]);
});

test('the small .exe link still gives the GitHub installer', async () => {
  const e = env();
  const response = await worker.fetch(click('/download/windows-exe?from=download'), e, {});
  assert.equal(response.status, 302);
  assert.match(response.headers.get('Location'), /^https:\/\/github\.com\/GarryOne\/jobadabra\/releases\/latest\/download\/.+-x64\.exe$/);
  assert.equal(e.STATS.db.prepare('SELECT platform FROM downloads').get().platform, 'windows-exe');
});

test('Add to Chrome opens the Chrome Web Store listing of our extension', async () => {
  const response = await worker.fetch(click('/download/chrome?from=download'), env(), {});
  assert.equal(response.headers.get('Location'), 'https://chromewebstore.google.com/detail/nmbnjhmpofifgcdalfefddbiihccogoi');
  assert.deepEqual(Object.keys(STORES).sort(), ['chrome', 'windows']);
});

test('the download page leads with both stores and keeps the .exe as a small link', () => {
  const page = readFileSync(new URL('../../web/public/download.html', import.meta.url), 'utf8');
  assert.match(page, /href="\/download\/windows\?from=download"[^>]*>Get it from the Microsoft Store</);
  assert.match(page, /href="\/download\/windows-exe\?from=download"/);
  assert.match(page, /href="\/download\/chrome\?from=download"[^>]*>Add to Chrome</);
});

// The class: no current page (web/public, not the archived /old/ pages) still tells Windows users to click past a warning.
test('no page tells Windows visitors to click "More info → Run anyway" or calls Windows unsigned', () => {
  const dir = new URL('../../web/public/', import.meta.url);
  const pages = readdirSync(dir).filter(name => name.endsWith('.html'));
  assert.ok(pages.length > 10, `positive control: ${pages.length} pages read`);
  const stale = pages.filter(name => /Run anyway|Not signed by (Apple or )?Microsoft|Neither is signed|Installers are not signed|your computer asks once/i.test(readFileSync(new URL(name, dir), 'utf8')));
  assert.deepEqual(stale, []);
});

test('every Windows download link on every page goes through the Store route; the .exe link is only the download page\'s small one', () => {
  const dir = new URL('../../web/public/', import.meta.url);
  const pages = readdirSync(dir).filter(name => name.endsWith('.html'));
  const links = pages.flatMap(name => [...readFileSync(new URL(name, dir), 'utf8').matchAll(/href="([^"]*(?:windows|\.exe)[^"]*)"/gi)]
    .map(([, href]) => ({name, href})));
  assert.ok(links.filter(l => l.href.startsWith('/download/windows?')).length >= 8, `positive control: ${links.length} Windows links read`);
  const wrong = links.filter(({name, href}) => !href.startsWith('/download/windows?') && !(name === 'download.html' && href.startsWith('/download/windows-exe?')));
  assert.deepEqual(wrong, []);
});
