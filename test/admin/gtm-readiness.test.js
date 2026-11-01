// /admin/testing/gtm-readiness (owner, 1 Nov 2026): a journey's stability from the run rows (stable = last 10 runs green and no red in 3 days), the verdict in words, the gauge, Tier 2 from its tallies,
// the collector's PUT validated, owner only, in the Testing menu. Numbers are a hand count on a fixed fixture.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import worker from '../../workers/www/index.js';
import {PAGES} from '../../admin/admin.js';
import {cleanSnapshot, ingest, MAX_T1} from '../../admin/gtm-intel.js';
import {page} from '../../admin/gtm-readiness.js';
import {tier1Rows, tier2Rows, verdict} from '../../admin/gtm-readiness-data.js';

const now = new Date('2026-11-01T12:00:00Z');
const journeys = [{id: 'J0', name: 'The app starts: every screen draws', tier: 1}, {id: 'J1', name: 'Set up <the> app', tier: 1}, {id: 'J2', name: 'Find jobs', tier: 1}, {id: 'J3', name: 'Few runs', tier: 1}, {id: 'J4', name: 'No runs', tier: 1},
  {id: 'K', name: 'Kept steps', tier: 1}, {id: 'J8', name: 'Tailor a CV', tier: 2}, {id: 'J9', name: 'Board', tier: 2}];
// run n is on day (n/4 days back) and has id 1000 - n (a newer run has a higher id); row = [runId, day, kind, os, journey, seen, failed, cut]
const day = n => new Date(now.getTime() - Math.floor(n / 4) * 86400000).toISOString().slice(0, 10);
const rows = [], id = n => 1000 - n;
for (let n = 1; n <= 30; n++) {
  rows.push([id(n), day(n), 'after-merge', 'mac', 'J0', 1, 0, 0], [id(n), day(n), 'after-merge', 'windows', 'J0', 1, 0, 0]);   // 30 green runs: stable
  rows.push([id(n), day(n), 'beta', 'mac', 'J1', 2, 0, 0], [id(n), day(n), 'beta', 'windows', 'J1', 2, n === 5 ? 1 : 0, 0]);   // run 5 (day 1 = 31 Oct) red on Windows only: red for the run, inside the 3 days
  rows.push([id(n), day(n), 'nightly', 'mac', 'J2', 1, 0, n === 25 ? 1 : 0]);   // run 25 (6 days back) cut off: red, outside the 3 quiet days, and outside the last 10 runs
}
for (let n = 1; n <= 4; n++) rows.push([id(n), day(n), 'beta', 'mac', 'J3', 1, 0, 0]);
rows.push([id(1), day(1), 'beta', 'mac', 'K', 3, 1, 0]);
rows.push([id(2), day(2), 'beta', 'mac', 'J4', 0, 0, 0]);   // seen 0: the suite never reached the journey: no observation
const snapshot = cleanSnapshot({journeys, tier1: rows, tier2: [{day: '2026-11-01', journey: 'J8', tests: 4, runs: 50, red: 1}, {day: '2026-10-31', journey: 'J8', tests: 4, runs: 50, red: 0}, {day: '2026-10-31', journey: 'J9', tests: 2, runs: 10, red: 0}]}, now);

test('stable = the last 10 runs green and no red in 3 days; a red on one OS is a red run; fewer than 10 runs is not stable', () => {
  const by = Object.fromEntries(tier1Rows(snapshot, now).map(row => [row.id, row]));
  assert.equal(by.J0.state, 'stable');
  assert.equal(by.J0.runs, 30);
  assert.equal(by.J1.state, 'unstable', 'run 5 is red inside the last 10 runs and inside 3 days');
  assert.deepEqual([by.J1.lastBad.runId, by.J1.os.mac.green, by.J1.os.windows.green], [995, 1, 29 / 30]);
  assert.equal(by.J2.state, 'stable', 'a cut-off 6 days back, outside the last 10 runs and the quiet days');
  assert.equal(by.J2.lastBad.runId, 975);
  assert.equal(by.J3.state, 'few');
  assert.equal(by.J4.state, 'none', 'seen 0 is no observation');
  assert.equal(by.J2.share, 29 / 30);
});

test('the last 20 runs are oldest to newest; the kept row is last and is not in the gauge', () => {
  const list = tier1Rows(snapshot, now);
  assert.equal(list.at(-1).id, 'K');
  assert.deepEqual(list.find(row => row.id === 'J0').strip.map(run => run.runId).slice(-3), [997, 998, 999]);
  assert.equal(list.find(row => row.id === 'J0').strip.length, 20);
  const say = verdict(list);
  assert.deepEqual([say.stable, say.total], [2, 4], 'J0 and J2 stable; J1 and J3 (few runs) not; K and J4 (no runs) left out');
  assert.match(say.text, /^2 of 4 Tier 1 journeys stable; J1 Set up <the> app red 31 Oct; J3 Few runs only 4 runs$/);
});

test('the trend compares two 14-day windows, and needs 5 runs in each', () => {
  const old = [];
  for (let n = 0; n < 6; n++) old.push([500 + n, '2026-10-10', 'beta', 'mac', 'J0', 1, n < 3 ? 1 : 0, 0]);   // 14 to 27 days back: half red
  const withOld = cleanSnapshot({journeys, tier1: [...rows, ...old]}, now);
  assert.equal(tier1Rows(withOld, now).find(row => row.id === 'J0').trend, 'up');
  assert.equal(tier1Rows(snapshot, now).find(row => row.id === 'J0').trend, null, 'no previous window');
});

test('Tier 2: runs, reds and the last red per journey from the daily tallies', () => {
  const by = Object.fromEntries(tier2Rows(snapshot, now).map(row => [row.id, row]));
  assert.deepEqual([by.J8.runs, by.J8.red, by.J8.share, by.J8.tests, by.J8.lastRed.day], [100, 1, 0.99, 4, '2026-11-01']);
  assert.deepEqual([by.J9.runs, by.J9.lastRed], [10, null]);
});

test('the page: gauge, verdict, states with words, run links, the Trello card, no unescaped name; no data and an empty snapshot say so', () => {
  const html = page(snapshot, {now});
  assert.match(html, /2\/4<\/text>/);
  assert.match(html, /<b>2 of 4 Tier 1 journeys stable; J1 Set up &lt;the&gt; app red 31 Oct; J3 Few runs only 4 runs<\/b>/);
  assert.doesNotMatch(html, /Set up <the>/);
  assert.match(html, /Not stable<\/span>/);
  assert.match(html, /Under 10 runs/);
  assert.match(html, /actions\/runs\/995">#995<\/a>/);
  assert.match(html, /Trello 02/, 'J1 maps to card 02');
  assert.match(html, /Tier 2[^]*J8[^]*99%/);
  assert.match(page(null, {now}), /No data yet/);
});

test('the collector body is validated: old rows, unknown journeys, kinds and OSes are dropped; a long list keeps its newest rows', () => {
  assert.equal(cleanSnapshot({journeys: 'x'}, now), null);
  const clean = cleanSnapshot({journeys: [...journeys, {id: 'bad id', name: 'x', tier: 1}, {id: 'J9', name: '', tier: 2}], tier1: [[1, '2026-11-01', 'beta', 'mac', 'J0', 1, 0, 0], [2, '2026-09-01', 'beta', 'mac', 'J0', 1, 0, 0], [3, '2026-11-01', 'pr', 'mac', 'J0', 1, 0, 0],
    [4, '2026-11-01', 'beta', 'linux', 'J0', 1, 0, 0], [5, '2026-11-01', 'beta', 'mac', 'J99', 1, 0, 0], [6, '2026-11-01', 'beta', 'mac', 'J0', 1, 0, 0, 'extra']], tier2: [{day: '2026-11-01', journey: 'J99', tests: 1, runs: 1, red: 0}], read: {e2e: [5, 'x', 7]}}, now);
  assert.deepEqual(clean.tier1.map(row => row[0]), [1, 6]);
  assert.equal(clean.tier1[1].length, 8);
  assert.deepEqual([clean.journeys.length, clean.tier2.length, clean.read.e2e], [8, 0, [5, 7]], 'a bad id and an empty name are dropped from the 8 journeys');
  const long = cleanSnapshot({journeys, tier1: Array.from({length: MAX_T1 + 500}, (_, i) => [1000 + i, '2026-11-01', 'beta', 'mac', 'J0', 1, 0, 0])}, now);
  assert.deepEqual([long.tier1.length, long.tier1[0][0]], [MAX_T1, 1500]);
});

const env = (stored = null, saved = []) => ({STATS_KEY: 'k3y', STATS_SALT: 's', SELFHEAL_PUBLISH_KEY: 'pub', STATS: {prepare: () => ({first: async () => (stored ? {body: JSON.stringify(stored)} : null), bind(...args) { saved.push(args); return this; }, run: async () => ({}), all: async () => ({results: []})})}});
const get = (path, headers = {}) => worker.fetch(new Request(`https://www.jobpilotto.top${path}`, {headers, redirect: 'manual'}), env(snapshot), {});

test('owner only, in the Testing menu; the PUT needs the publish key and a snapshot-shaped body and stores one row; the GET returns it', async () => {
  assert.equal((await get('/admin/testing/gtm-readiness')).status, 404);
  const response = await get('/admin/testing/gtm-readiness', {Cookie: 'jp_stats=k3y'});
  assert.equal(response.status, 200);
  assert.match(await response.text(), /GTM readiness/);
  assert.equal(PAGES.find(item => item.path === '/admin/testing/gtm-readiness').group, 'Testing');
  const saved = [], put = (key, body) => worker.fetch(new Request('https://www.jobpilotto.top/gtm/data', {method: 'PUT', headers: key ? {Authorization: `Bearer ${key}`} : {}, body}), env(null, saved), {});
  assert.equal((await put(null, '{}')).status, 404);
  assert.equal((await put('wrong', '{}')).status, 404);
  assert.equal((await put('pub', 'nope')).status, 400);
  assert.equal((await put('pub', '{"journeys":"x"}')).status, 400);
  assert.equal((await put('pub', 'x'.repeat(900001))).status, 413);
  const ok = await put('pub', JSON.stringify({journeys, tier1: [[1, new Date().toISOString().slice(0, 10), 'beta', 'mac', 'J0', 1, 0, 0]]}));
  assert.equal(ok.status, 200);
  assert.equal(saved.length, 1);
  assert.equal((await ingest(new Request('https://x/gtm/data', {headers: {Authorization: 'Bearer pub'}}), env(snapshot), now)).status, 200);
  assert.equal((await ingest(new Request('https://x/gtm/data', {headers: {Authorization: 'Bearer pub'}}), env(null), now)).status, 404, 'no snapshot yet');
});
