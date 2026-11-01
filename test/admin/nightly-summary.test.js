// admin/nightly-summary.js: the nightly report-only numbers (owner, 1 Nov 2026), computed once from the e2e snapshot row and the agent-coding rows; the Testing Overview and the Scheduled rows only draw them.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import {NIGHTS, lastDays, loadNightlySummary, nightlySummary, summaryFor} from '../../admin/nightly-summary.js';

const now = new Date('2026-11-02T10:00:00Z');
const D = back => new Date(now.getTime() - back * 86400000).toISOString().slice(0, 10);
const night = (runId, day, pairs, within8, extra = {}) => ({runId, day, pairs, within8, over20: 0, factsExact: 63, factsTotal: 63, judged: 18, invented: 1, promptCases: null, ...extra});
const replay = (extra = {}) => ({status: 'asked', total: 63, right: 60, flipped: 0, noise: 2, newWrong: 0, unconfirmed: 0, calls: 66, ...extra});
const job = (summary, id) => summary.jobs.find(item => item.id === id);

test('there are 14 days, oldest first, ending today; every job lists them in the same order', () => {
  assert.equal(NIGHTS, 14);
  const days = lastDays(now);
  assert.deepEqual([days.length, days[0], days.at(-1)], [14, D(13), D(0)]);
  const summary = nightlySummary({snapshot: {quality: [night(1, D(1), 9, 8)]}}, now);
  for (const item of summary.jobs.filter(item => item.series.length)) assert.deepEqual(item.series.map(point => point.day), days, item.id);
});

test('with nothing stored every job says so and draws no night', () => {
  const summary = nightlySummary({}, now);
  assert.deepEqual(summary.jobs.map(item => item.id), ['quality-ai', 'prompt-cases', 'interactions', 'wander', 'notion-real', 'agent-coding', 'beta-clock', 'night-clock']);
  for (const item of summary.jobs) assert.deepEqual([item.value, item.status, item.series.length], ['–', 'none', 0], item.id);
});

test('Quality AI: last night\'s same-score rate and the 14 nights against the 80% bar, the status from the 90-pair rate the e2e page uses', () => {
  const quality = [night(30, D(0), 9, 8), night(29, D(1), 9, 6), night(28, D(1), 9, 9), night(27, D(3), 9, 5)];   // two runs on D(1): the newest run counts
  const item = job(nightlySummary({snapshot: {quality}}, now), 'quality-ai');
  assert.equal(item.value, '89%');
  assert.deepEqual(item.bar.value, 0.8);
  const byDay = Object.fromEntries(item.series.filter(point => point.value != null).map(point => [point.day, [Math.round(point.value * 100), point.ok]]));
  assert.deepEqual(byDay, {[D(0)]: [89, true], [D(1)]: [67, false], [D(3)]: [56, false]});
  assert.equal(item.status, 'bad', '28 of 36 pairs (78%) is under the bar');
  assert.match(item.sub, /78% over the last 36 pairs/);
  const good = job(nightlySummary({snapshot: {quality: [night(30, D(0), 90, 80)]}}, now), 'quality-ai');
  assert.equal(good.status, 'good');
});

test('prompt cases: right of total on the newest replayed night, bad when one got worse, grey-free when not asked', () => {
  const at = promptCases => job(nightlySummary({snapshot: {quality: [night(2, D(1), 9, 8, {promptCases: replay()}), night(3, D(0), 9, 8, {promptCases})]}}, now), 'prompt-cases');
  assert.deepEqual([at(replay()).value, at(replay()).status], ['60/63', 'good']);
  assert.deepEqual([at(replay({flipped: 2})).status, at(replay({flipped: 2})).series.at(-1).ok], ['bad', false]);
  assert.equal(at(replay({status: 'not-asked'})).status, 'warn');
  assert.match(at(replay({status: 'carried', calls: 0})).sub, /no prompt changed/);
  assert.equal(at(null).series.at(-2).value, 60 / 63, 'a night without a replay keeps the earlier night\'s point on its own day only');
  assert.equal(at(null).series.at(-1).value, null);
});

const row = (runId, day, suite, green, rates, extra = {}) => ({runId, day, kind: 'scheduled', suite, platform: 'mac', green, ...(rates ? {rates} : {}), ...extra});

test('interactions: the recall is the key number, the lowest rate of the night counts, and a night before the parser says rates are coming', () => {
  const suiteNights = [row(1, D(2), 'interactions', true), row(2, D(1), 'interactions', true, {recall: 0.875, clean: 0.92, still: 0.75}), row(3, D(1), 'interactions', true, {recall: 0.75, clean: 0.95}, {platform: 'windows'})];
  const item = job(nightlySummary({snapshot: {suiteNights}}, now), 'interactions');
  assert.equal(item.value, '75%', 'the lower of the two platforms');
  assert.match(item.sub, /recall of planted bugs · 92% controls clean · 75% pages still/);
  assert.equal(item.series.find(point => point.day === D(2)).value, null, 'no rates that night');
  const old = job(nightlySummary({snapshot: {suiteNights: [row(1, D(1), 'interactions', true)]}}, now), 'interactions');
  assert.deepEqual([old.value, old.status], ['green', 'good']);
  assert.match(old.sub, /rates start with the next night/);
  assert.equal(job(nightlySummary({snapshot: {suiteNights: [row(1, D(0), 'interactions', false)]}}, now), 'interactions').status, 'bad');
});

test('wander and real Notion are a 14-night green/red trend; a red platform makes the night red; shard names merge; PR rows do not count', () => {
  const suiteNights = [row(1, D(2), 'wander', true), row(2, D(1), 'wander', true), row(3, D(1), 'wander', false, null, {platform: 'windows'}), row(4, D(0), 'wander', true),
    row(5, D(0), 'wander', false, null, {kind: 'pr'}), row(6, D(0), 'notion-real-1of2', true), row(7, D(0), 'notion-real-2of2', false)];
  const summary = nightlySummary({snapshot: {suiteNights}}, now);
  const wander = job(summary, 'wander');
  assert.deepEqual(wander.series.filter(point => point.ok != null).map(point => [point.day, point.ok]), [[D(2), true], [D(1), false], [D(0), true]]);
  assert.deepEqual([wander.value, wander.status, wander.sub], ['green', 'good', `2 of 3 nights green · ${D(0)}`]);
  assert.deepEqual([job(summary, 'notion-real').value, job(summary, 'notion-real').status], ['red', 'bad']);
});

test('agent coding: areas with 3+ fix PRs in the 7 days up to each day, bar none', () => {
  const ci = (day, fixPrs) => ({kind: 'ci', day, card: JSON.stringify({fixPrs})});
  const agentRows = [ci(D(3), {panel: 1, site: 1}), ci(D(2), {panel: 1}), ci(D(1), {panel: 1, site: 1}), ci(D(0), {site: 1}), {kind: 'gate', day: D(0), card: '{}'}];
  const item = job(nightlySummary({agentRows}, now), 'agent-coding');
  assert.deepEqual(item.series.filter(point => point.value != null).map(point => [point.day, point.value]), [[D(3), 0], [D(2), 0], [D(1), 1], [D(0), 2]], 'panel reaches 3 on D(1); site reaches 3 on D(0) while panel is still inside its 7 days');
  assert.deepEqual([item.value, item.status, item.bar.value], ['2', 'bad', 0]);
  assert.equal(job(nightlySummary({agentRows: [ci(D(0), {})]}, now), 'agent-coding').status, 'good');
  assert.equal(job(nightlySummary({agentRows: [{kind: 'ci', day: D(0), card: '{broken'}]}, now), 'agent-coding').value, '0', 'a damaged card reads as no fix PRs, not a crash');
});

test('wall clocks: minutes per run per day for the beta and for the nights, from the days rows', () => {
  const days = [{day: D(2), kind: 'beta', runs: 2, wallMin: 60}, {day: D(0), kind: 'beta', runs: 1, wallMin: 24}, {day: D(0), kind: 'nightly', runs: 3, wallMin: 90}, {day: D(0), kind: 'scheduled', runs: 1, wallMin: 30},
    {day: D(0), kind: 'pr', runs: 9, wallMin: 900}, {day: D(1), kind: 'beta', runs: 1}];
  const summary = nightlySummary({snapshot: {days}}, now);
  const beta = job(summary, 'beta-clock'), night = job(summary, 'night-clock');
  assert.deepEqual([beta.value, beta.median, beta.status, beta.bar], ['24 min', 27, 'none', null], 'no bar is set for a wall clock: the page draws the median');
  assert.equal(night.value, '30 min', '(90 + 30) / (3 + 1)');
  assert.match(beta.sub, /median of 2 days: 27 min/);
  const before = job(nightlySummary({snapshot: {days: [{day: D(0), kind: 'beta', runs: 1}]}}, now), 'beta-clock');
  assert.match(before.sub, /stored from the next collector pass/, 'a snapshot from before the wall minutes were kept says so, not 0');
});

test('summaryFor gives the Scheduled row its jobs by workflow file', () => {
  const summary = nightlySummary({}, now);
  assert.deepEqual(summaryFor(summary, 'e2e.yml').map(item => item.id), ['quality-ai', 'interactions', 'wander', 'notion-real', 'night-clock']);
  assert.deepEqual(summaryFor(summary, 'prompt-cases-night.yml').map(item => item.id), ['prompt-cases']);
  assert.deepEqual(summaryFor(summary, 'desktop.yml').map(item => item.id), ['beta-clock']);
  assert.deepEqual(summaryFor(summary, 'agent-coding-stats.yml').map(item => item.id), ['agent-coding']);
  assert.deepEqual(summaryFor(summary, 'mutation.yml'), []);
  assert.deepEqual(summaryFor(null, 'e2e.yml'), []);
});

test('the one reader reads the snapshot row and the agent rows, and a broken store gives an empty summary, not an error', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE e2e_snapshot (id INTEGER PRIMARY KEY, at TEXT, body TEXT); CREATE TABLE agent_coding_days (kind TEXT, day TEXT, card TEXT, updated_at TEXT)');
  db.prepare('INSERT INTO e2e_snapshot VALUES (1, ?, ?)').run('x', JSON.stringify({quality: [night(30, D(0), 9, 8)]}));
  db.prepare('INSERT INTO agent_coding_days VALUES (?, ?, ?, ?)').run('ci', D(0), JSON.stringify({fixPrs: {site: 3}}), 'x');
  const STATS = {prepare: sql => { const statement = db.prepare(sql); return {bind: (...args) => ({all: async () => ({results: statement.all(...args)}), first: async () => statement.get(...args) ?? null}), first: async () => statement.get() ?? null}; }};
  const summary = await loadNightlySummary({STATS}, now);
  assert.equal(job(summary, 'quality-ai').value, '89%');
  assert.equal(job(summary, 'agent-coding').value, '1');   // one area with 3 fix PRs
  const broken = await loadNightlySummary({STATS: {prepare: () => { throw new Error('down'); }}}, now);
  assert.ok(broken.jobs.every(item => item.status === 'none'));
});
