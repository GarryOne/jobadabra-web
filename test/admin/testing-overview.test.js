// /admin/testing/overview: the catalogue resolved against stored rows (last run, cadence, bugs caught), the page drawn, the route owner-only and first under Testing.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {test} from 'node:test';
import worker from '../../workers/www/index.js';
import {PAGES} from '../../admin/admin.js';
import {METHODS, PLANNED, RINGS} from '../../admin/testing-overview-methods.js';
import {resolve} from '../../admin/testing-overview-data.js';
import {ago, lastChip, page} from '../../admin/testing-overview.js';

const now = new Date('2026-11-01T12:00:00Z'), repo = 'GarryOne/jobadabra';
const run = (conclusion, at, n = 1) => ({at, conclusion, mins: 3, url: `https://github.com/${repo}/actions/runs/${n}`});
const job = (file, name, recent, crons = []) => ({repo, file, name, about: '', crons, source: 'github', manual: true, disabled: false, ai: false, weeklyMin: 0, billedMin: 0, recent});
const data = (extra = {}) => ({repo, now,
  schedules: {jobs: [job('e2e.yml', 'CI · End-to-end on Mac + Linux', [run('success', '2026-11-01T02:00:00Z', 11)], ['47 21,23,1 * * *']), job('desktop.yml', 'Release · Build, test, beta', [run('success', '2026-11-01T05:30:00Z', 12)], ['17 5 * * *']),
    job('integration.yml', 'CI · Integration tests', [run('success', '2026-11-01T10:00:00Z', 13)]), job('smoke.yml', 'CI · Smoke (the app starts)', [run('failure', '2026-11-01T09:00:00Z', 14)]),
    job('mutation.yml', 'CI · Planted code bugs', [run('cancelled', '2026-10-25T01:10:00Z', 15), run('success', '2026-10-25T01:00:00Z', 16)], ['0 1 * * 0'])]},
  e2e: {latest: [{runId: 21, day: '2026-11-01', kind: 'pr', conclusion: 'failure'}, {runId: 20, day: '2026-11-01', kind: 'after-merge', conclusion: 'success'}, {runId: 19, day: '2026-10-31', kind: 'nightly', conclusion: 'failure'}],
    suiteNights: [{runId: 19, day: '2026-10-31', kind: 'nightly', suite: 'wander', platform: 'mac', green: true}, {runId: 19, day: '2026-10-31', kind: 'nightly', suite: 'interactions', platform: 'mac', green: false},
      {runId: 18, day: '2026-10-30', kind: 'nightly', suite: 'interactions', platform: 'mac', green: true}],
    caught: [{day: '2026-10-30', runId: 5, suite: 'jobs'}, {day: '2026-10-30', runId: 5, suite: 'apply'}, {day: '2026-09-01', runId: 1}]},
  integration: {runs: [{runId: 31, layer: 'app', platform: 'linux', day: '2026-11-01', on: 'main', conclusion: 'success', tests: 10, failed: 0, ms: 5}, {runId: 30, layer: 'store', platform: 'linux', day: '2026-10-31', on: 'main', conclusion: 'failure', tests: 10, failed: 1, ms: 5}]},
  healing: {day: '2026-11-01', periods: {last7: {byDetector: [{detector: 'AI screenshot review', fixed: 2, queued: 1}, {detector: 'AI code review', fixed: 0, queued: 0}]}}, quality: {mutation: {rate: 100, note: '12 of 12 planted code bugs caught'}}, recall: {planted: 13, caught: 11, missed: ['page-overflow']}},
  card: {month: '2026-11', days: 30, checks: [{name: 'CI · Integration tests', realCatches: 4}, {name: 'CI · Smoke (the app starts)', realCatches: 1}]},
  sentry: [{userCount: 3}, {userCount: 2}], ...extra});
const cardOf = (model, id) => model.rings.flatMap(ring => ring.cards).find(card => card.id === id);

test('every method sits in a ring, appears once, and every ring has cards', () => {
  const ids = [...METHODS, ...PLANNED].map(method => method.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const method of [...METHODS, ...PLANNED]) assert.ok(RINGS.some(ring => ring.id === method.ring), `${method.id} has a ring`);
  const model = resolve(data());
  for (const ring of model.rings) assert.ok(ring.cards.length, ring.title);
  assert.ok(!ids.some(id => /unit/.test(id)), 'unit tests are not on the page (owner, 1 Nov 2026)');
});

test('each catalogued workflow exists in the public repo', { skip: !existsSync('.github/workflows') }, () => {
  const files = METHODS.flatMap(method => method.lines.map(line => line.wf).filter(Boolean)).concat(METHODS.flatMap(method => method.bugs.checks || []));
  for (const file of new Set(files)) assert.ok(existsSync(`.github/workflows/${file}`), `${file} is a public workflow`);
});

test('last run: a workflow reads its newest finished run, the cadence is its cron in words, a skipped or cancelled run is not a result', () => {
  const model = resolve(data()), mutation = cardOf(model, 'mutation').lines[0];
  assert.equal(mutation.last.state, 'green');
  assert.equal(mutation.last.url, `https://github.com/${repo}/actions/runs/16`);
  assert.match(mutation.when, /^Weekly Sun/);
  const smoke = cardOf(model, 'smoke').lines[0];
  assert.deepEqual([smoke.last.state, smoke.when], ['red', 'every pull request']);
  assert.equal(cardOf(model, 'smoke').lines[2].last.state, 'none', 'a workflow the snapshot does not list says so');
});

test('last run: e2e by run kind (PR runs do not stand in), suites by their newest night, integration by main', () => {
  const model = resolve(data()), e2e = cardOf(model, 'e2e').lines;
  assert.equal(e2e[0].last.state, 'green');
  assert.match(e2e[0].last.url, /runs\/20$/);
  assert.equal(e2e[1].last.state, 'red');
  assert.equal(e2e[2].last.state, 'none');
  assert.equal(cardOf(model, 'interactions').lines[0].last.state, 'red', 'run 19 is the newest night of the suite');
  assert.equal(cardOf(model, 'wander').lines[0].last.state, 'green');
  const integration = cardOf(model, 'integration').lines[0].last;
  assert.deepEqual([integration.state, integration.note], ['green', 'app layer on main']);
});

test('bugs caught come from stored rows, with their window, or say why not', () => {
  const model = resolve(data());
  assert.deepEqual(cardOf(model, 'integration').bugs, {text: '4 real catches', window: '30 days'});
  assert.deepEqual(cardOf(model, 'smoke').bugs, {text: '1 real catch', window: '30 days'});
  assert.deepEqual(cardOf(model, 'review').bugs, {text: '3 real bugs', window: '7 days'});
  assert.deepEqual(cardOf(model, 'code-review').bugs, {text: '0 real bugs', window: '7 days'});
  assert.deepEqual(cardOf(model, 'e2e').bugs, {text: '1 red that caught a bug', window: '30 days'}, 'one run red in two suites is one red');
  assert.equal(cardOf(model, 'mutation').bugs.text, '12 of 12 planted code bugs caught');
  assert.equal(cardOf(model, 'recall').bugs.text, '11 of 13 planted UI bugs caught');
  assert.deepEqual(cardOf(model, 'sentry').bugs, {text: '2 unresolved issues · 5 users hit', window: '14 days'});
  assert.match(cardOf(model, 'wander').bugs.why, /Wander/);
  const empty = resolve(data({card: null, healing: null, e2e: null, sentry: null, integration: null, schedules: null}));
  for (const id of ['integration', 'review', 'e2e', 'mutation', 'recall', 'sentry']) assert.ok(cardOf(empty, id).bugs.why, `${id} says why it has no number`);
  assert.equal(cardOf(empty, 'e2e').state, 'none');
  assert.equal(empty.counts.green + empty.counts.red, 0);
});

test('the verdict counts live cards by their worst line; GTM readiness links only once its page is in the menu; planned cards are grey', () => {
  const model = resolve(data()), live = model.counts.live;
  assert.equal(model.counts.green + model.counts.red + model.counts.none, live);
  assert.ok(model.red.includes('Smoke') && model.red.includes('E2E · Tier 1 journeys'));
  assert.equal(cardOf(model, 'gtm').href, '');
  assert.equal(cardOf(model, 'gtm').pending, true);
  assert.equal(cardOf(resolve(data(), {pages: ['/admin/testing/gtm-readiness']}), 'gtm').href, '/admin/testing/gtm-readiness');
  const menu = resolve(data(), {pages: PAGES.map(item => item.path)});
  for (const card of menu.rings.flatMap(ring => ring.cards).filter(card => card.kind === 'live' && card.href)) assert.ok(PAGES.some(item => item.path === card.href), `${card.id} links to a menu page`);
  assert.equal(cardOf(menu, 'e2e').href, '/admin/testing/e2e');
  assert.deepEqual(PLANNED.map(card => card.id).sort(), ['agents', 'faults', 'fresh-install', 'synthetic', 'upgrade']);
  const html = page(model, {now});
  assert.equal((html.match(/class="mcard planned"/g) || []).length, PLANNED.length);
  assert.doesNotMatch(html, /testing\/scheduled/);
  assert.match(page(resolve(data(), {pages: ['/admin/testing/scheduled']}), {now}), /<a href="\/admin\/testing\/scheduled">Weekly Sun/);
  assert.match(html, /<title>Overview · Testing · Admin<\/title>/);
  assert.match(html, /red on the last run/);
  assert.doesNotMatch(html, /unit test(?!s are not listed)/i);
});

test('the chip names the result in words, with the time and the run link', () => {
  assert.equal(ago('2026-11-01T11:30:00Z', now), '30 min ago');
  assert.equal(ago('2026-11-01T06:00:00Z', now), '6 h ago');
  assert.equal(ago('2026-10-29T06:00:00Z', now), '3 days ago');
  assert.equal(ago('2026-11-01', now), 'today');
  assert.equal(ago('2026-10-31', now), 'yesterday');
  assert.match(lastChip({state: 'red', at: '2026-11-01T06:00:00Z', url: 'https://github.com/x/y/actions/runs/1'}, now), /<a href="https:\/\/github.com\/x\/y\/actions\/runs\/1"><span class="chip bad">✕ red · 6 h ago/);
  assert.match(lastChip({state: 'green', at: '2026-11-01T06:00:00Z', late: true}, now), /✓ green · 6 h ago.*late/s);
  assert.match(lastChip({state: 'none', why: 'no <b>run'}, now), /title="no &lt;b&gt;run".*◷ no run stored/s);
});

test('the route: owner only, Overview is the first page of Testing, every other visitor gets a 404', async () => {
  const testing = PAGES.filter(item => item.group === 'Testing');
  assert.equal(testing[0].path, '/admin/testing/overview');
  assert.equal(testing[0].overview, true);
  const env = {STATS_KEY: 'k3y', STATS_SALT: 's', STATS: {prepare: () => ({first: async () => null, bind() { return this; }, all: async () => ({results: []})})}, WAITLIST: {get: async () => null, put: async () => {}, list: async () => ({keys: []})}, ASSETS: {fetch: () => new Response('asset')}};
  const get = (path, headers = {}) => worker.fetch(new Request(`https://www.jobpilotto.top${path}`, {headers, redirect: 'manual'}), env, {});
  assert.equal((await get('/admin/testing/overview')).status, 404);
  const owner = await get('/admin/testing/overview', {Cookie: 'jp_stats=k3y'});
  assert.equal(owner.status, 200);
  const html = await owner.text();
  assert.match(html, /Testing overview/);
  assert.match(html, /<a href="\/admin\/testing\/overview" aria-current="page">🧭 Overview<\/a>/);
});
