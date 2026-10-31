// Greys by suite and reason over 7 days (gt, 31 Oct 2026; owner: "which suite went grey most this week, and why"): the ledger rows the public repo's
// artifact "grey-records" carries, validated again here, merged into the one snapshot, drawn on the Grey card and told in the weekly from the same computed rows.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {greyData, greySummary, greyTrendLines, GREY_REASONS} from '../../admin/e2e-grey.js';
import {page} from '../../admin/e2e-page.js';
import {issueBody, telegramText, weekly} from '../../admin/e2e-weekly.js';

const now = new Date('2026-11-02T07:23:00Z');
const row = (runId, day, kind, suite, reason) => ({runId, day, kind, suite, reason});
const ledger = [
  row(101, '2026-11-01', 'pr', 'apply', 'timing'), row(102, '2026-11-02', 'pr', 'apply', 'timing'), row(103, '2026-10-31', 'pr', 'apply', 'ai-credit'),
  row(104, '2026-11-02', 'scheduled', 'settings', 'picker'), row(105, '2026-10-30', 'beta', 'applyflows', 'timing'), row(106, '2026-10-20', 'pr', 'apply', 'install')];
const base = {at: now.toISOString(), days: [], fails: [], latest: [], quality: [], breaks: [], caught: [], work: [], workFiles: [], lanes: {suites: {}}};

test('greyData keeps valid rows only, one per run and suite (the last reason wins), inside 30 days; an omitted read keeps the last ledger', () => {
  const bad = [row(0, '2026-11-01', 'pr', 'apply', 'timing'), row(7, '2026-11-01', 'sideways', 'apply', 'timing'), row(8, '2026-11-01', 'pr', 'apply', 'coffee'),
    row(9, '2026-11-01', 'pr', '../x y', 'timing'), row(10, '2026-13-01', 'pr', 'apply', 'timing'), row(11, '2026-09-01', 'pr', 'apply', 'timing'), {runId: 12}];
  const first = greyData({}, {greyJobs: [...ledger, ...bad, row(101, '2026-11-01', 'pr', 'apply', 'runner')]}, now);
  assert.deepEqual(first.greyJobs.map(r => [r.runId, r.reason]).sort(), [[101, 'runner'], [102, 'timing'], [103, 'ai-credit'], [104, 'picker'], [105, 'timing'], [106, 'install']]);
  assert.deepEqual(greyData(first, {}, now).greyJobs, first.greyJobs, 'a failed artifact read sends nothing and keeps the ledger');
  assert.deepEqual(greyData(first, {greyJobs: []}, now).greyJobs.length, 6, 'an empty read adds nothing; rows age out only by day');
  assert.equal(greyData({}, {}, now).greyJobs, undefined, 'never stored stays absent, not an empty ledger');
  assert.ok(['main', 'runner', 'ai-credit', 'install', 'tolerant', 'suspended', 'timing', 'environment', 'picker'].every(reason => reason in GREY_REASONS));
});

test('shards of one suite are one suite, and one row per run and suite', () => {
  const kept = greyData({}, {greyJobs: [row(1, '2026-11-01', 'pr', 'applyflows-1of2', 'timing'), row(1, '2026-11-01', 'pr', 'applyflows-2of2', 'environment')]}, now).greyJobs;
  assert.deepEqual(kept, [{runId: 1, day: '2026-11-01', kind: 'pr', suite: 'applyflows', reason: 'environment'}]);
});

test('the summary counts suite x reason for the last 7 days and links each cell to its newest run', () => {
  const s = greySummary({...base, ...greyData({}, {greyJobs: ledger}, now)}, now);
  assert.deepEqual(s.trend.rows.map(r => [r.suite, r.total]), [['apply', 3], ['applyflows', 1], ['settings', 1]], 'the 20 Oct install grey is outside 7 days');
  assert.deepEqual(s.trend.rows[0].cells, {timing: {n: 2, runId: 102}, 'ai-credit': {n: 1, runId: 103}});
  assert.deepEqual(s.trend.reasons, ['ai-credit', 'timing', 'picker'], 'only reasons seen, in the fixed order');
});

test('no ledger is "not stored", never zero; a stored empty ledger says no greys', () => {
  assert.equal(greySummary(base, now).trend, null);
  assert.match(page(base, {now}), /Grey jobs not recorded yet; counts unavailable/);
  const none = greySummary({...base, greyJobs: []}, now);
  assert.deepEqual(none.trend.rows, []);
  assert.match(page({...base, greyJobs: []}, {now}), /No grey jobs recorded in the last 7 days/);
});

test('the Grey card draws the table and links each count to its newest run', () => {
  const html = page({...base, ...greyData({}, {greyJobs: ledger}, now)}, {now}).split('<h2>Grey</h2>')[1].split('</section>')[0];
  assert.match(html, /Greys, last 7 days: suite × reason/);
  assert.match(html, /<code>apply<\/code>[\s\S]*?<a href="https:\/\/github\.com\/GarryOne\/jobadabra\/actions\/runs\/102">2<\/a>/);
  assert.match(html, /<a href="https:\/\/github\.com\/GarryOne\/jobadabra\/actions\/runs\/103">1<\/a>/);
  assert.doesNotMatch(html, /runs\/106/, 'outside 7 days');
});

test('the weekly says the same lines as the card, in the issue and (shortened to the limit) in Telegram', () => {
  const s = weekly({...base, ...greyData({}, {greyJobs: ledger}, now)}, now);
  assert.deepEqual(greyTrendLines(s.grey).slice(0, 2), ['Greys, last 7 days: suite × reason', 'apply · AI credit 1 · timing 2 · newest run #102']);
  assert.match(issueBody(s), /apply · AI credit 1 · timing 2 · newest run #102/);
  assert.match(telegramText(s), /Greys, last 7 days: suite × reason\napply · AI credit 1 · timing 2/);
  assert.match(issueBody(weekly(base, now)), /Grey jobs not recorded yet; counts unavailable/);
});
