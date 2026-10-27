// How steady the AI is in the quality suite, as rates over the last 90 score pairs (owner, 27 Oct 2026: "Code gate + AI rate"; bars: "Below 80% of last 90",
// "Above 2% of last 90"). The collector reads the night's live quality run's log (counts only), the site keeps one row per night, /admin/operations/e2e draws it.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import worker from '../../workers/www/index.js';
import {BARS, cleanNight, nightOf, rateOf} from '../../admin/e2e-quality.js';
import {qualityCard} from '../../admin/e2e-page.js';
import {liveNights} from '../../jobs/e2e-intel.mjs';

// Lines as a GitHub job log prints them (a timestamp first). Main 27 Oct 2026, run 40433806296: 3002 85 -> 75, 3005 65 -> 56.
const LOG = ['2026-10-27T01:56:14.1Z   scores: 3001=95 3002=85 3003=75 3004=35 3005=65 3006=35 3007=dropped 3008=85 3009=58 3010=85 3011=dropped',
  '2026-10-27T01:58:02.9Z   second scores: 3001=92 3002=75 3003=75 3004=35 3005=56 3006=35 3007=- 3008=78 3009=56 3010=60 3011=-',
  '2026-10-27T01:58:40.4Z   judged 18 score texts: 16 grounded, 18 useful, 2 with invented facts',
  '2026-10-27T01:59:10.0Z quality: 63/63 facts exact, ranking ok, 0 invented facts, scores stable within ±25',
  '2026-10-27T02:01:00.0Z   scores: 3001=10 3002=10',   // the retry's lines come after the first try's: never counted
  '2026-10-27T02:03:00.0Z   second scores: 3001=90 3002=90'].join('\n');

test('a live night is read from its log: pairs, within 8, over 20, facts and judge flags, first try only', () => {
  assert.deepEqual(nightOf(LOG), {pairs: 9, within8: 6, over20: 1, factsExact: 63, factsTotal: 63, judged: 18, invented: 2});
  assert.equal(nightOf(LOG.split('\n').filter(line => !line.includes('second scores')).join('\n')), null, 'a replayed gate scores nothing twice: no night');
  assert.equal(nightOf(''), null);
});

const night = (runId, pairs, within8, over20 = 0, day = '2026-10-27') => ({runId, day, pairs, within8, over20, factsExact: 63, factsTotal: 63, judged: 18, invented: 1});

test('the rate covers the newest nights holding the last 90 pairs, against the owner\'s bars', () => {
  assert.deepEqual([BARS.pairs, BARS.agree, BARS.jumps], [90, 0.8, 0.02]);
  const nights = Array.from({length: 12}, (_, i) => night(100 - i, 9, i < 10 ? 8 : 0));   // newest first; the two oldest nights would drag the rate down
  const rate = rateOf(nights);
  assert.equal(rate.nights, 10);
  assert.equal(rate.pairs, 90);
  assert.equal(rate.agree, 80 / 90);
  assert.equal(rate.agreeOk, true);
  assert.equal(rateOf([night(1, 90, 71), ...nights]).agreeOk, false, '71 of 90 within 8 (79%) is under the bar');
  assert.equal(rateOf([night(1, 90, 72), ...nights]).agreeOk, true, '72 of 90 (80%) holds it');
  assert.equal(rateOf([night(1, 90, 90, 2)]).jumpsOk, false, '2 of 90 over 20 is above 2%');
  assert.equal(rateOf([night(1, 90, 90, 1)]).jumpsOk, true);
  assert.equal(rateOf([]).agree, null);
});

test('a night that does not add up is dropped', () => {
  assert.ok(cleanNight(night(5, 9, 9)));
  for (const bad of [night(0, 9, 9), night(5, 0, 0), night(5, 9, 10), night(5, 9, 9, 10), {...night(5, 9, 9), day: 'x'}, {...night(5, 9, 9), invented: 30}, {...night(5, 9, 9), pairs: 1.5}]) assert.equal(cleanNight(bad), null, JSON.stringify(bad));
});

function d1() {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../../db/migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'));
  const statement = (sql, args = []) => ({bind: (...values) => statement(sql, values), run: async () => db.prepare(sql).run(...args),
    all: async () => ({results: db.prepare(sql).all(...args)}), first: async () => db.prepare(sql).get(...args), _sql: sql, _args: args});
  return {db, prepare: sql => statement(sql), batch: async list => list.map(item => db.prepare(item._sql).run(...item._args))};
}

test('the site stores each night once, puts the nights in the snapshot and tells the collector which it has', async () => {
  const e = {STATS: d1(), SELFHEAL_PUBLISH_KEY: 'pub'};
  const put = body => worker.fetch(new Request('https://www.jobpilotto.top/e2e/data', {method: 'PUT', headers: {Authorization: 'Bearer pub'}, body: JSON.stringify(body)}), e, {});
  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await put({rules: 1, runs: [], fails: [], quality: [night(7, 9, 8, 0, today), night(8, 9, 0, 9, 'bad')]})).status, 200);
  await put({rules: 1, runs: [], fails: [], quality: [{...night(7, 9, 1, 0, today)}]});   // the same night again: kept as first stored
  const snapshot = JSON.parse(e.STATS.db.prepare('SELECT body FROM e2e_snapshot WHERE id = 1').get().body);
  assert.deepEqual(snapshot.quality.map(row => [row.runId, row.within8]), [[7, 8]]);
  const listed = await (await worker.fetch(new Request('https://www.jobpilotto.top/e2e/data?v=1', {headers: {Authorization: 'Bearer pub'}}), e, {})).json();
  assert.deepEqual(listed.quality, [7]);
});

test('the page shows the rate against each bar, red when a bar fails, and each night', () => {
  const ok = qualityCard([night(41, 90, 85, 1)]);
  assert.match(ok, /94\.4%/);
  assert.match(ok, /<span class="chip good">bar ≥ 80%<\/span>/);
  assert.match(ok, /actions\/runs\/41/);
  const red = qualityCard([night(42, 90, 60, 5)]);
  assert.match(red, /<span class="chip bad">bar ≥ 80%<\/span>/);
  assert.match(red, /<span class="chip bad">bar ≤ 2%<\/span>/);
  assert.match(qualityCard([]), /No live quality night yet/);
});

test('the collector reads only the night\'s live quality run, once', () => {
  const run = (databaseId, createdAt, displayTitle = 'E2E check · on time (Worker cron)', conclusion = 'success') => ({databaseId, createdAt, displayTitle, conclusion});
  const listed = [run(1, '2026-10-27T21:47:00Z'), run(2, '2026-10-27T23:47:00Z'), run(3, '2026-10-26T22:05:00Z', 'E2E check · GitHub schedule (backup)', 'failure'),
    run(4, '2026-10-27T21:50:00Z', 'E2E for PR · quality · x'), run(5, '2026-10-27T21:49:00Z', undefined, 'cancelled'), run(6, '2026-10-25T21:47:00Z')];
  assert.deepEqual(liveNights(listed, new Set([6])).map(item => item.databaseId), [1, 3]);
});
