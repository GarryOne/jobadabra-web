// The weekly e2e summary (admin/e2e-weekly.js; spec rule D, owner 28 Oct 2026): the page's numbers, one decision for the owner when a suite was red for 30 days without a catch,
// the last full week of commits, and a Telegram text and issue body that say the same.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {decision, issueBody, issueTitle, telegramText, weekly} from '../../admin/e2e-weekly.js';
import {summary as topSummary} from '../../admin/e2e-top.js';
import {windowOf} from '../../admin/e2e-page.js';

const monday = new Date('2026-11-02T07:23:00Z');
const fail = (day, suite, cause, n = 1, min = 10) => ({day, suite, platform: 'mac', cause, n, min, kind: 'nightly'});
const snapshot = {at: '2026-11-02T06:41:00Z',
  days: [{day: '2026-10-30', kind: 'nightly', runs: 4, reds: 3, greens: 1}, {day: '2026-11-01', kind: 'pr', runs: 6, reds: 1, greens: 5}],
  fails: [fail('2026-10-30', 'apply', 'product'), fail('2026-10-30', 'applyflows-1of2', 'flake', 2), fail('2026-10-30', 'quality', 'ai', 1, 40), fail('2026-11-01', 'strategy', 'open'),
    fail('2026-10-10', 'strategy', 'timing', 3, 30), fail('2026-10-12', 'settings', 'product')],
  work: [{day: '2026-10-27', kind: 'product', commits: 30}, {day: '2026-10-28', kind: 'plumbing', commits: 10}, {day: '2026-11-02', kind: 'plumbing', commits: 2}],
  workFiles: [{week: '2026-10-26', file: '.github/workflows/e2e.yml', commits: 6}, {week: '2026-11-02', file: 'tools/ship.sh', commits: 1}]};

test('the week reads the page\'s own 7-day window: the same runs, reds and groups as /admin/operations/e2e', () => {
  const s = weekly(snapshot, monday), w = windowOf(snapshot, '7d', monday);
  assert.equal(s.runs, w.runs);
  assert.equal(s.redRuns, w.redRuns);
  assert.deepEqual(s.byGroup, topSummary(w).byGroup);
  assert.deepEqual([s.runs, s.redRuns, s.reds], [10, 4, 5]);
  assert.deepEqual(s.caught.map(row => row.suite), ['apply']);
  assert.deepEqual(s.idle.map(row => row.suite), ['applyflows', 'quality', 'strategy']);
});

test('prune candidates: red in the snapshot\'s 30 days and never a catch; a suite that caught once (settings, 12 Oct) is not one', () => {
  const s = weekly(snapshot, monday);
  assert.deepEqual(s.prune.map(row => [row.suite, row.reds]), [['strategy', 4], ['applyflows', 2], ['quality', 1]]);
  assert.match(decision(s), /^3 suites red in 30 days without catching a bug: strategy \(4 red, 0\.7 h\), applyflows \(2 red, 0\.2 h\), quality \(1 red, 0\.7 h\)\. Keep, move to a tolerant lane, or retire\?$/);
  assert.equal(decision({...s, prune: []}), null);
});

test('work: the last full calendar week (Monday\'s own commits wait for next week), its plumbing share against 15%, its files', () => {
  const s = weekly(snapshot, monday);
  assert.deepEqual([s.work.week, s.work.total, s.work.counts.plumbing], ['2026-10-26', 40, 10]);
  assert.deepEqual(s.files.map(row => row.file), ['.github/workflows/e2e.yml']);
  assert.match(telegramText(s), /Plumbing 25% of 40 commits in the week of 26 Oct \(over the 15% target\)/);
  assert.match(telegramText(weekly({...snapshot, work: []}, monday)), /No commit read for the week of 26 Oct/);
});

test('Telegram: the verdict first, the decision last, the page and the issue linked; the issue says the same numbers', () => {
  const s = weekly(snapshot, monday), text = telegramText(s, 'https://github.com/GarryOne/jobadabra-web/issues/9');
  const lines = text.split('\n');
  assert.equal(lines[0], '🧪 E2E week to 2 Nov: 4 of 10 runs red (40%)');
  assert.match(text, /Caught a bug: apply\nRed, caught nothing: applyflows \(2\), quality \(1\), strategy \(1\)/);
  assert.match(lines.at(-3), /^Your call: 3 suites red in 30 days/);
  assert.deepEqual(lines.slice(-2), ['https://www.jobadabra.top/admin/operations/e2e', 'https://github.com/GarryOne/jobadabra-web/issues/9']);
  assert.equal(issueTitle(s), 'E2E week · 2026-11-02');
  const body = issueBody(s);
  assert.match(body, /^\*\*4 of 10 e2e runs red \(40%\)\*\* in the 7 days to 2 Nov; 1 of 5 red suites caught a product bug\./);
  assert.match(body, /> \*\*Decision:\*\* 3 suites red in 30 days/);
  assert.match(body, /\| `quality` \| 0 \| 0 \| 1 \| 0 \| 0\.7 h \|/);
  assert.match(body, /\| CI and harness plumbing \| 10 \|/);
  assert.match(telegramText({...s, prune: [], reds: 0, caught: [], idle: []}), /No red suite this week\nNo red suite caught a bug\n.*\nNo decision for you this week\./);
});
