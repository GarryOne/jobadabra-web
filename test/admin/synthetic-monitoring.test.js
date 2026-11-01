// /admin/testing/synthetic-monitoring: one table of the live checks (the Worker's probes and the scheduled workflows that look at something live), read through the readers that already exist.
// The page, the model, the nav entry, the route and the Overview card's link; every probe has its words.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import worker from '../../workers/www/index.js';
import {PAGES} from '../../admin/admin.js';
import {METHODS} from '../../admin/testing-overview-methods.js';
import {OWN_WHAT, WORKFLOWS, model, page} from '../../admin/synthetic-monitoring.js';
import {PROBES} from '../../shared/synthetic.js';

const now = new Date('2026-11-01T12:00:00Z'), repo = 'GarryOne/jobadabra';
const run = (conclusion, at, n) => ({at, conclusion, mins: 1, url: `https://github.com/${repo}/actions/runs/${n}`});
const job = (file, recent, crons) => ({repo, file, name: file, about: '', crons, source: 'github', manual: false, disabled: false, ai: false, weeklyMin: 0, billedMin: 0, recent});
const probes = PROBES.map(probe => ({probe: probe.id, label: probe.label, ok: true, at: '2026-11-01T11:50:00Z', ms: 100, reason: '', state: 'up', since: '2026-10-30T00:00:00Z', uptime24h: 100}));
const week = Array.from({length: 14}, (_, i) => ({day: new Date(now.getTime() - (13 - i) * 86400000).toISOString().slice(0, 10), state: 'green'}));
const data = (extra = {}) => ({repo, now, syntheticDaysByProbe: Object.fromEntries(PROBES.map(probe => [probe.id, week])), synthetic: {lastRoundAt: '2026-11-01T11:50:00Z', stale: false, probes},
  schedules: {at: '2026-11-01T11:00:00Z', jobs: [job('release-guard.yml', [run('success', '2026-11-01T11:23:00Z', 1)], ['23 * * * *']), job('schedule-watchdog.yml', [run('success', '2026-11-01T11:23:00Z', 2)], ['23 * * * *']),
    job('stable-canary.yml', [run('success', '2026-11-01T06:23:00Z', 3)], ['23 6 * * *']), job('watch-live.yml', [run('failure', '2026-11-01T05:00:00Z', 4)], ['0 5 * * *'])]}, ...extra});

test('every Worker probe has its words, and every workflow row is a public workflow of the repo', () => {
  for (const probe of PROBES) assert.ok(OWN_WHAT[probe.id], `${probe.id} says what it checks`);
  assert.deepEqual(Object.keys(OWN_WHAT).sort(), PROBES.map(probe => probe.id).sort(), 'no words for a probe that does not exist');
  for (const item of WORKFLOWS) assert.ok(item.what && item.label, item.wf);
});

test('ten rows, each with 14 day cells; the green Worker probes, the red workflow and its name in the verdict', () => {
  const result = model(data());
  assert.equal(result.rows.length, PROBES.length + WORKFLOWS.length);
  for (const row of result.rows) assert.equal(row.days.length, 14, row.label);
  assert.deepEqual([result.counts.green, result.counts.red, result.red], [9, 1, ['Daily watch list']]);
  const html = page(data());
  assert.match(html, /<b>1 of 10 live checks is red<\/b>: Daily watch list/);
  assert.equal((html.match(/class="c c-/g) || []).length - 4, 10 * 14, 'the key has 4 cells; each of the 10 rows has 14');
  assert.match(html, /every 15 min/);
  assert.match(html, /<a href="https:\/\/github.com\/GarryOne\/jobadabra\/actions\/workflows\/stable-canary.yml">Stable canary<\/a>/);
  assert.doesNotMatch(html, /undefined|NaN|null/);
});

test('a probe is red only when down (2 misses in a row); a single miss is a note; no round for 45 min makes them all red', () => {
  const miss = probes.map(item => (item.probe === 'index' ? {...item, ok: false, reason: 'HTTP 500'} : item));
  const one = model(data({synthetic: {lastRoundAt: '2026-11-01T11:50:00Z', stale: false, probes: miss}}));
  assert.equal(one.rows.find(row => row.id === 'index').last.state, 'green');
  assert.match(one.rows.find(row => row.id === 'index').last.note, /one miss: HTTP 500/);
  const down = model(data({synthetic: {lastRoundAt: '2026-11-01T11:50:00Z', stale: false, probes: probes.map(item => (item.probe === 'index' ? {...item, ok: false, state: 'down', reason: 'HTTP 500'} : item))}}));
  assert.deepEqual([down.rows.find(row => row.id === 'index').last.state, down.rows.find(row => row.id === 'index').last.note], ['red', 'HTTP 500']);
  const stale = model(data({synthetic: {lastRoundAt: '2026-11-01T10:00:00Z', stale: true, probes}}));
  assert.deepEqual(stale.rows.slice(0, PROBES.length).map(row => row.last.word), PROBES.map(() => 'no round'));
});

test("a probe's row shows that probe's own days: the broker's red day is not a red day on the website row", () => {
  const red = week.map((cell, i) => (i === 13 ? {...cell, state: 'red'} : cell));
  const result = model(data({syntheticDaysByProbe: Object.fromEntries(PROBES.map(probe => [probe.id, probe.id === 'broker' ? red : week]))}));
  const lastDay = id => result.rows.find(row => row.id === id).days.at(-1).state;
  assert.deepEqual([lastDay('broker'), lastDay('site'), lastDay('index')], ['red', 'green', 'green']);
});

test('unreadable tables or a missing snapshot say "no run" for those rows, never a green', () => {
  const blind = model(data({synthetic: null, syntheticDaysByProbe: null, schedules: null}));
  assert.ok(blind.rows.every(row => row.last.state === 'none'));
  assert.equal(blind.counts.green, 0);
  assert.match(page(data({schedules: null})), /no schedule listed/);
});

test('the tab is in the Testing menu, the route is owner-only, and the Overview card links to it', async () => {
  const entry = PAGES.find(item => item.path === '/admin/testing/synthetic-monitoring');
  assert.ok(entry && entry.group === 'Testing' && entry.name === 'Synthetic Monitoring');
  const response = await worker.fetch(new Request('https://www.jobadabra.top/admin/testing/synthetic-monitoring'), {});
  assert.equal(response.status, 404, 'a visitor who is not the owner gets the usual 404');
  assert.equal(METHODS.find(method => method.id === 'synthetic').href, '/admin/testing/synthetic-monitoring');
});
