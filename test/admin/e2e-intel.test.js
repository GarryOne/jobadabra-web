// /e2e/data: CI sends each finished e2e run and its red suites once; a red whose cause was "open" is rewritten when the fix lands; one snapshot row, no table scan per page load.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import worker from '../../workers/www/index.js';
import {buildSnapshot} from '../../admin/e2e-intel.js';

function d1() {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../../db/migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'));
  const statement = (sql, args = []) => ({bind: (...values) => statement(sql, values), run: async () => db.prepare(sql).run(...args),
    all: async () => ({results: db.prepare(sql).all(...args)}), first: async () => db.prepare(sql).get(...args), _sql: sql, _args: args});
  return {db, prepare: sql => statement(sql), batch: async list => list.map(item => db.prepare(item._sql).run(...item._args))};
}
const env = () => ({STATS: d1(), STATS_KEY: 'k3y', STATS_SALT: 's', SELFHEAL_PUBLISH_KEY: 'pub', WAITLIST: {get: async () => null, put: async () => {}, list: async () => ({keys: []})}, ASSETS: {fetch: () => new Response('asset')}});
const call = (e, init = {}, path = '/e2e/data') => worker.fetch(new Request(`https://www.jobpilotto.top${path}`, init), e, {});
const put = (e, body, key = 'pub') => call(e, {method: 'PUT', headers: {Authorization: `Bearer ${key}`}, body: JSON.stringify(body)});
const run = (runId, conclusion = 'failure', extra = {}) => ({runId, createdAt: '2026-10-17T20:01:00Z', kind: 'beta', conclusion, minutes: 26, ...extra});
const fail = (runId, suite, platform, cause, extra = {}) => ({runId, suite, platform, cause, minutes: 12, day: '2026-10-17', ...extra});
const now = new Date('2026-10-18T12:00:00Z');

test('the publish key is needed; without it the address does not exist', async () => {
  const e = env();
  assert.equal((await put(e, {rules: 1, runs: [], fails: []}, 'wrong')).status, 404);
  assert.equal((await call(e, {method: 'GET'})).status, 404);
});

test('a run and its red suites are stored once; a later cause for the same red replaces "open"', async () => {
  const e = env();
  const first = await put(e, {rules: 1, runs: [run(1)], fails: [fail(1, 'apply', 'mac', 'open'), fail(1, 'apply', 'windows', 'ai')]});
  assert.equal(first.status, 200);
  await put(e, {rules: 1, runs: [run(1)], fails: [fail(1, 'apply', 'mac', 'test'), fail(1, 'apply', 'windows', 'open')]});
  const causes = Object.fromEntries(e.STATS.db.prepare('SELECT platform, cause FROM e2e_fails').all().map(row => [row.platform, row.cause]));
  assert.deepEqual(causes, {mac: 'test', windows: 'ai'}, 'open becomes test; a settled cause is not overwritten by open');
  assert.equal(e.STATS.db.prepare('SELECT COUNT(*) AS n FROM e2e_runs').get().n, 1);
});

test('GET lists the settled runs and the pending ones (a red still open or unknown)', async () => {
  const e = env();
  await put(e, {rules: 1, runs: [run(1), run(2), run(3, 'success')], fails: [fail(1, 'apply', 'mac', 'test'), fail(2, 'quality', 'mac', 'open'), fail(2, 'quality', 'windows', 'unknown')]});
  const body = await (await call(e, {method: 'GET', headers: {Authorization: 'Bearer pub'}}, '/e2e/data?v=1')).json();
  assert.deepEqual(body.have.sort(), [1, 3]);
  assert.deepEqual(body.pending, [2]);
});

test('a cancelled run is stored and counted as a cancelled try, not as a finished run', async () => {
  const e = env();
  await put(e, {rules: 1, runs: [run(1), run(2, 'success'), run(3, 'cancelled')], fails: []});
  const snapshot = await buildSnapshot(e.STATS, now);
  assert.deepEqual(snapshot.days.map(d => [d.runs, d.cancelled, d.reds, d.greens]), [[2, 1, 1, 1]]);
  assert.equal(snapshot.latest.filter(r => r.conclusion === 'cancelled').length, 1);
});

test('bad rows are dropped: an unknown cause, a run without a number, too many rows', async () => {
  const e = env();
  const response = await put(e, {rules: 1, runs: [run(1), {...run(2), runId: 'x'}], fails: [fail(1, 'apply', 'mac', 'because'), fail(1, 'apply', 'mac', 'flake')]});
  assert.equal((await response.json()).stored, 2);
  assert.equal(e.STATS.db.prepare('SELECT cause FROM e2e_fails').all().length, 1);
  assert.equal((await put(e, {rules: 1, runs: Array.from({length: 600}, (_, i) => run(i + 1)), fails: []})).status, 400);
});

test('the snapshot holds the last 30 days per day and per suite, and the page reads one row', async () => {
  const e = env();
  await put(e, {rules: 1, runs: [run(1), run(2, 'success'), run(3, 'failure', {createdAt: '2026-08-01T10:00:00Z'})], fails: [fail(1, 'apply', 'mac', 'test'), fail(1, 'apply', 'windows', 'test'), fail(3, 'old', 'mac', 'flake', {day: '2026-08-01'})]});
  const snapshot = await buildSnapshot(e.STATS, now);
  assert.deepEqual(snapshot.days.map(d => [d.day, d.runs, d.reds, d.greens, d.redMin]), [['2026-10-17', 2, 1, 1, 26]]);
  assert.deepEqual(snapshot.fails.map(f => [f.suite, f.platform, f.cause, f.n]).sort(), [['apply', 'mac', 'test', 1], ['apply', 'windows', 'test', 1]]);
  const stored = e.STATS.db.prepare('SELECT body FROM e2e_snapshot WHERE id = 1').get();
  assert.equal(JSON.parse(stored.body).schema, snapshot.schema);
});

test('every run kind is kept with its runner minutes and PR; a red keeps its kind, failure line, fix and whether a PR caught a bug; breaks group one run\'s same-cause reds', async () => {
  const e = env();
  const line = 'tar: D\\:\\a\\_temp/free-ai-tree: Cannot open';
  await put(e, {rules: 3, runs: [run(1, 'failure', {kind: 'nightly'}), run(2, 'failure', {kind: 'pr', queueMin: 8.5, runMin: 2.2, pr: 2123}), run(3, 'success', {kind: 'after-merge'})],
    fails: [fail(1, 'apply', 'windows', 'ci', {kind: 'nightly', line}), fail(1, 'jobs', 'windows', 'ci', {kind: 'nightly', line}), fail(1, 'quality', 'mac', 'drift', {kind: 'nightly', line: '✗ x', fix: 'f1'}),
      fail(2, 'wander', 'mac', 'product', {kind: 'pr', line: '✗ [wander] error-shown', caught: 1})]});
  const snapshot = await buildSnapshot(e.STATS, now);
  assert.equal(snapshot.schema, 2);
  assert.deepEqual(snapshot.days.map(d => [d.kind, d.runs, d.reds, d.queueMin, d.runMin, d.prs]).sort(), [['after-merge', 1, 0, 0, 0, 0], ['nightly', 1, 1, 0, 0, 0], ['pr', 1, 1, 8.5, 2.2, 1]]);
  assert.deepEqual(snapshot.breaks[0], {day: '2026-10-17', kind: 'nightly', runId: 1, cause: 'ci', line, n: 2}, 'one relay break on two suites is one break');
  assert.deepEqual(snapshot.caught, [{day: '2026-10-17', runId: 2, suite: 'wander', line: '✗ [wander] error-shown', pr: 2123}]);
  assert.equal(e.STATS.db.prepare("SELECT fix FROM e2e_fails WHERE suite = 'quality'").get().fix, 'f1');
});

test('a newer rules version rewrites a settled red and its run (rules 3 re-read every run of rules 1-2)', async () => {
  const e = env();
  await put(e, {rules: 2, runs: [run(1)], fails: [fail(1, 'apply', 'mac', 'product')]});
  await put(e, {rules: 3, runs: [run(1, 'failure', {kind: 'nightly', queueMin: 3})], fails: [fail(1, 'apply', 'mac', 'drift', {kind: 'nightly'})]});
  assert.deepEqual({...e.STATS.db.prepare('SELECT cause, kind FROM e2e_fails').get()}, {cause: 'drift', kind: 'nightly'});
  assert.deepEqual({...e.STATS.db.prepare('SELECT kind, queue_min FROM e2e_runs').get()}, {kind: 'nightly', queue_min: 3});
});

test('where e2e work goes: commits per day and kind are upserted, a week\'s files are replaced when sent again, bad rows dropped, the snapshot carries both', async () => {
  const e = env(), work = (day, kind, commits) => ({day, kind, commits}), file = (week, name, commits) => ({week, file: name, commits});
  await put(e, {rules: 3, runs: [], fails: [], work: [work('2026-10-17', 'plumbing', 4), work('2026-10-17', 'product', 6), work('2026-10-17', 'chores', 1), work('17 Oct', 'tests', 1)],
    workFiles: [file('2026-10-12', '.github/workflows/e2e.yml', 3), file('2026-10-12', 'desktop/e2e/lib/x.mjs', 2), file('2026-10-12', 'a b;c', 1)]});
  await put(e, {rules: 3, runs: [], fails: [], work: [work('2026-10-17', 'plumbing', 5)], workFiles: [file('2026-10-12', 'tools/ship.sh', 4)]});
  const snapshot = await buildSnapshot(e.STATS, now);
  assert.deepEqual(snapshot.work.map(row => [row.day, row.kind, row.commits]).sort(), [['2026-10-17', 'plumbing', 5], ['2026-10-17', 'product', 6]], 'an unknown kind and a bad day are dropped; a re-sent day replaces its count');
  assert.deepEqual(snapshot.workFiles.map(row => [row.week, row.file, row.commits]), [['2026-10-12', 'tools/ship.sh', 4]], 'the week sent again keeps only its newest files');
});
