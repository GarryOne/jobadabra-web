// The Worker's every-5-minutes trigger starts e2e-intel.yml once an hour, on time (owner, 31 Oct 2026: GitHub's own schedule ran it every ~4.5 h, so /admin/operations/e2e was hours old).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import worker from '../../workers/www/index.js';
import {E2E_INTEL_WORKFLOW, e2eIntelDue, startE2eIntel} from '../../shared/e2e-intel-start.js';

const tick = (hour, minute) => new Date(Date.UTC(2026, 9, 31, hour, minute));

test('of the twelve 5-minute ticks in an hour, exactly one (:40) starts the collector, every hour of the day', () => {
  for (let hour = 0; hour < 24; hour++) {
    const due = Array.from({length: 12}, (_, i) => i * 5).filter(minute => e2eIntelDue(tick(hour, minute)));
    assert.deepEqual(due, [40], `hour ${hour}`);
  }
});

test('on the tick it dispatches e2e-intel.yml on THIS repo with the dedicated token and no inputs; off the tick it does nothing', async () => {
  const calls = [], dispatch = async (env, inputs, workflow) => { calls.push({repo: env.GITHUB_REPO, token: env.GITHUB_TOKEN, inputs, workflow}); };
  const env = {GITHUB_REPO: 'GarryOne/jobadabra', GITHUB_TOKEN: 'site-token', E2E_INTEL_GITHUB_TOKEN: 'own-token'};
  assert.equal(await startE2eIntel(env, tick(9, 35), dispatch), false);
  assert.deepEqual(calls, [], 'off the tick: nothing starts');
  assert.equal(await startE2eIntel(env, tick(9, 40), dispatch), true);
  assert.deepEqual(calls, [{repo: 'GarryOne/jobadabra-web', token: 'own-token', inputs: undefined, workflow: 'e2e-intel.yml'}], 'the public GITHUB_REPO and the site token are not used; no inputs (the workflow declares none)');
  await startE2eIntel({...env, E2E_INTEL_REPO: 'Owner/other'}, tick(10, 40), dispatch);
  assert.equal(calls[1].repo, 'Owner/other', 'a dedicated repo var wins');
  await assert.rejects(startE2eIntel(env, tick(11, 40), async () => { throw new Error('GitHub dispatch failed: 403'); }), /403/, 'a refused start is thrown, never swallowed here');
});

test('without E2E_INTEL_GITHUB_TOKEN the tick refuses out loud and never sends the site token to the private repo (Gitar, #240)', async () => {
  const calls = [];
  await assert.rejects(startE2eIntel({GITHUB_REPO: 'GarryOne/jobadabra', GITHUB_TOKEN: 'site-token'}, tick(9, 40), async (...args) => { calls.push(args); }), /E2E_INTEL_GITHUB_TOKEN is not set/);
  assert.deepEqual(calls, []);
  assert.equal(await startE2eIntel({}, tick(9, 35), async () => { calls.push(1); }), false, 'off the tick a missing token is not an error');
});

test('the Worker\'s */5 trigger really sends the request GitHub needs, on the :40 tick only, and a refusal does not break the tick', async () => {
  const requests = [], realFetch = globalThis.fetch, realError = console.error, errors = [];
  globalThis.fetch = async (url, init) => { requests.push({url: String(url), method: init?.method, auth: init?.headers?.Authorization, body: init?.body}); return new Response(null, {status: String(url).includes('api.github.com') ? 204 : 200}); };
  console.error = (...args) => errors.push(args.join(' '));
  try {
    const run = async (minute, env) => { const tasks = []; await worker.scheduled({cron: '*/5 * * * *', scheduledTime: tick(12, minute).getTime()}, env, {waitUntil: task => tasks.push(task)}); await Promise.allSettled(tasks); };
    const env = {GITHUB_REPO: 'GarryOne/jobadabra', GITHUB_TOKEN: 'site-token', E2E_INTEL_GITHUB_TOKEN: 'own-token'};
    await run(35, env);
    assert.deepEqual(requests.filter(r => r.url.includes('/actions/workflows/')), [], ':35 starts nothing');
    await run(40, env);
    const starts = requests.filter(r => r.url.includes('/actions/workflows/'));
    assert.deepEqual(starts.map(r => [r.url, r.method, r.auth, JSON.parse(r.body)]), [[`https://api.github.com/repos/GarryOne/jobadabra-web/actions/workflows/${E2E_INTEL_WORKFLOW}/dispatches`, 'POST', 'Bearer own-token', {ref: 'main'}]]);
    globalThis.fetch = async () => new Response(null, {status: 403});
    await run(40, env);
    assert.ok(errors.some(line => /e2e-intel start failed: GitHub dispatch failed: 403/.test(line)), 'a refusal is logged, the other 5-minute work still ran');
  } finally { globalThis.fetch = realFetch; console.error = realError; }
});

test('the workflow keeps its GitHub schedule as the backup, can be dispatched, and runs one at a time', () => {
  const yml = readFileSync(new URL('../../.github/workflows/e2e-intel.yml', import.meta.url), 'utf8');
  assert.match(yml, /cron: '41 \* \* \* \*'/, 'the backup minute is one after the Worker\'s :40');
  assert.match(yml, /^  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(yml.slice(yml.indexOf('workflow_dispatch:'), yml.indexOf('permissions:')), /inputs:/, 'no inputs declared: the Worker sends none');
  assert.match(yml, /group: e2e-intel\n\s+cancel-in-progress: false/);
  assert.match(yml, /^run-name: .*Worker timer/m);
});
