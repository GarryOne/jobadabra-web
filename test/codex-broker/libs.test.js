// Guards the broker's pure rules (workers/codex-broker/lib): who may call, which lane, the allowance brakes, and the reply refusal.
import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyRunToken} from '../../workers/codex-broker/lib/oidc.mjs';
import {laneOf, LANES} from '../../workers/codex-broker/lib/lanes.mjs';
import {allow, newMeter, record, recordCall, callsToday, ownSharePct, TOKENS_PER_PERCENT} from '../../workers/codex-broker/lib/budget.mjs';
import {weeklyWindow} from '../../workers/codex-broker/container/weekly.mjs';
import {refuseReply} from '../../workers/codex-broker/lib/guard.mjs';
import {modelOf, tierOfClaude} from '../../workers/codex-broker/lib/tiers.mjs';
import {slots} from '../../workers/codex-broker/lib/queue.mjs';

const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
async function signer() {
  const pair = await crypto.subtle.generateKey({name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'}, true, ['sign', 'verify']);
  const jwk = {...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1'};
  const sign = async (claims, header = {alg: 'RS256', kid: 'k1'}) => {
    const body = `${enc(header)}.${enc(claims)}`;
    return `${body}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(body))).toString('base64url')}`;
  };
  return {sign, jwks: async () => ({keys: [jwk]})};
}
const good = {iss: 'https://token.actions.githubusercontent.com', aud: 'jobadabra-codex-broker', repository: 'GarryOne/jobadabra', event_name: 'pull_request', exp: Math.floor(Date.now() / 1000) + 600};
const opts = jwks => ({jwks, audience: 'jobadabra-codex-broker', repository: 'GarryOne/jobadabra'});

test('a live run of the owner\'s repo is accepted', async () => {
  const {sign, jwks} = await signer();
  assert.equal((await verifyRunToken(await sign(good), opts(jwks))).event_name, 'pull_request');
});

test('every other caller is refused with its reason', async () => {
  const {sign, jwks} = await signer(), other = await signer();
  const cases = [
    ['another repository', await sign({...good, repository: 'someone/else'}), /wrong repository/],
    ['another audience', await sign({...good, aud: 'x'}), /wrong audience/],
    ['an expired token', await sign({...good, exp: 1}), /expired/],
    ['another issuer', await sign({...good, iss: 'https://evil.example'}), /wrong issuer/],
    ['a token signed by another key', await other.sign(good), /bad signature/],
    ['alg none', await sign(good, {alg: 'none', kid: 'k1'}), /RS256/],
    ['no token', '', /not a JWT/],
  ];
  for (const [what, token, why] of cases) await assert.rejects(() => verifyRunToken(token, opts(jwks)), why, what);
});

test('the lane comes from the verified claims', () => {
  assert.equal(laneOf({event_name: 'pull_request'}), 'pr');
  assert.equal(laneOf({event_name: 'schedule', job_workflow_ref: 'GarryOne/jobadabra/.github/workflows/central-scout.yml@refs/heads/main'}), 'scheduled');
  assert.equal(laneOf({event_name: 'workflow_dispatch', job_workflow_ref: 'GarryOne/jobadabra/.github/workflows/job-search-benchmark.yml@refs/heads/main'}), 'bench');
});

test('only the exact nightly workflow gets drift; PR priority and verified workflow precedence remain', () => {
  const workflow = 'GarryOne/jobadabra/.github/workflows/ai-answer-drift.yml@refs/heads/bench';
  assert.equal(laneOf({event_name: 'schedule', job_workflow_ref: workflow}), 'drift');
  assert.equal(laneOf({event_name: 'workflow_dispatch', workflow_ref: workflow}), 'drift');
  assert.equal(laneOf({event_name: 'pull_request', job_workflow_ref: workflow}), 'pr');
  for (const name of ['ai-answer-drift-extra.yml', 'other-ai-answer-drift.yml', 'ai-answer-drift.yml.bak']) {
    assert.equal(laneOf({workflow_ref: `GarryOne/jobadabra/.github/workflows/${name}@refs/heads/main`}), 'scheduled');
  }
  assert.equal(laneOf({workflow_ref: workflow, job_workflow_ref: 'GarryOne/jobadabra/.github/workflows/central-scout.yml@refs/heads/main'}), 'scheduled');
  assert.equal(laneOf({workflow_ref: 'GarryOne/jobadabra/.github/workflows/central-scout.yml@refs/heads/.github/workflows/ai-answer-drift.yml'}), 'scheduled');
  assert.ok(LANES.includes('drift'));
});

const driftDay = Date.parse('2026-10-30T23:59:59Z') / 1000;

test('drift accepts call 24, refuses call 25 and opens again at UTC midnight', () => {
  let m = newMeter(driftDay + 604800);
  for (let i = 0; i < 24; i++) {
    assert.equal(allow('drift', m, null, TOKENS_PER_PERCENT, driftDay).ok, true);
    m = recordCall(m, 'drift', driftDay);
  }
  assert.equal(callsToday(m, 'drift', driftDay), 24);
  assert.deepEqual(allow('drift', m, null, TOKENS_PER_PERCENT, driftDay), {ok: false, why: 'budget:daily 24 of 24 calls (drift)'});
  assert.equal(allow('scheduled', m, null, TOKENS_PER_PERCENT, driftDay).ok, true);
  assert.equal(allow('drift', m, null, TOKENS_PER_PERCENT, driftDay + 1).ok, true);
  assert.equal(callsToday(m, 'drift', driftDay + 1), 0);
  m = recordCall(m, 'drift', driftDay + 1);
  assert.equal(callsToday(m, 'drift', driftDay + 1), 1);
});

test('old stored meters accept drift tokens and daily counts without NaN or losing previous tokens', () => {
  let m = JSON.parse('{"resetsAt":2000000000,"tokens":{"pr":10,"scheduled":20,"bench":30}}');
  assert.equal(allow('drift', m, null, TOKENS_PER_PERCENT, driftDay).ok, true);
  assert.equal(callsToday(m, 'drift', driftDay), 0);
  m = recordCall(m, 'drift', driftDay);
  m = record(m, 'drift', 40, driftDay);
  assert.equal(ownSharePct(m, 1), 100);
  assert.equal(callsToday(JSON.parse(JSON.stringify(m)), 'drift', driftDay), 1);
});

test('weekly resets preserve daily reservations; token completions never count calls twice', () => {
  let m = recordCall(newMeter(driftDay), 'drift', driftDay);
  m = record(m, 'drift', 123, driftDay, driftDay + 604800);
  assert.equal(ownSharePct(m, 1), 123);
  assert.equal(callsToday(m, 'drift', driftDay), 1);
});

test('drift keeps scheduled weekly own-share and whole-week brakes', () => {
  const m = record(newMeter(2000000000), 'drift', 60 * TOKENS_PER_PERCENT, driftDay);
  assert.match(allow('drift', m, 80).why, /budget:own-share 60\.0% of 60% \(drift\)/);
  assert.deepEqual(allow('drift', newMeter(2000000000), 85), {ok: false, why: 'budget:week 85% of 85% (drift)'});
});

test('scheduled work stops at 60% own share, PR checks keep going to 75%, the week brake binds on a busy owner week', () => {
  let m = newMeter(2000000000);
  m = record(m, 'scheduled', 60 * TOKENS_PER_PERCENT, 1, 0);
  assert.equal(allow('scheduled', m, 80).ok, false);
  assert.match(allow('scheduled', m, 80).why, /own-share/);
  assert.equal(allow('bench', m, 80).ok, false);
  assert.equal(allow('pr', m, 80).ok, true);
  m = record(m, 'pr', 15 * TOKENS_PER_PERCENT, 1, 0);
  assert.equal(allow('pr', m, 80).ok, false);
  const fresh = newMeter(2000000000);
  assert.equal(allow('scheduled', fresh, 85).ok, false);
  assert.match(allow('scheduled', fresh, 85).why, /week/);
  assert.equal(allow('pr', fresh, 96).ok, true);
  assert.equal(allow('pr', fresh, 97).ok, false);
  assert.equal(allow('scheduled', fresh, null).ok, true);
});

// Owner's goal, 30 Oct 2026 (a hand beta, green): /health read whole week 32%, broker tokens 43,241,035; the seed ratio called that 60.06% and refused every scheduled call.
test('own share never exceeds the whole-week reading: 43.2M tokens on a week Codex says is 32% used is allowed; on a 61% week it is refused', () => {
  let m = newMeter(2000000000);
  m = record(m, 'pr', 163226, 1, 0); m = record(m, 'scheduled', 40985043, 1, 0); m = record(m, 'bench', 2092766, 1, 0);
  assert.ok(ownSharePct(m) > 60 && ownSharePct(m) < 60.1, 'by the seed alone the broker reads 60.06%');
  assert.equal(allow('scheduled', m, 32).ok, true);
  assert.equal(allow('bench', m, 32).ok, true);
  assert.equal(allow('pr', m, 32).ok, true);
  assert.match(allow('scheduled', m, 61).why, /own-share 60\.1% of 60%/);
  assert.equal(allow('scheduled', m, null).ok, false, 'no whole-week reading yet: the seed estimate stands');
});

test('a meter with no reset date yet keeps counting across calls (Gitar #221: it was reset to 1970 on every call)', () => {
  let m = newMeter(0);
  for (let i = 0; i < 3; i++) m = record(m, 'scheduled', 10 * TOKENS_PER_PERCENT, 1793000000, undefined);
  assert.equal(ownSharePct(m), 30);
  assert.equal(allow('scheduled', m, null).ok, true);
  m = record(m, 'scheduled', 30 * TOKENS_PER_PERCENT, 1793000000, undefined);
  assert.equal(allow('scheduled', m, null).ok, false);
});

test('a new week starts a fresh meter', () => {
  const m = record(newMeter(100), 'scheduled', 5 * TOKENS_PER_PERCENT, 500, 1000);
  assert.equal(m.resetsAt, 1000);
  assert.equal(ownSharePct(m), 5);
});

test('4 calls run at once and a waiting PR check goes before scheduled and benchmark work', async () => {
  const q = slots(2), order = [];
  const [a, b] = [await q.acquire('scheduled'), await q.acquire('scheduled')];
  const waiters = ['bench', 'scheduled', 'pr'].map(lane => q.acquire(lane).then(release => { order.push(lane); release(); }));
  assert.deepEqual(q.stats(), {active: 2, waiting: {pr: 1, scheduled: 1, bench: 1}});
  a(); a();   // a second release of the same slot frees nothing
  b();
  await Promise.all(waiters);
  assert.deepEqual(order, ['pr', 'scheduled', 'bench']);
  assert.equal(q.stats().active, 0);
});

test('a Claude tier keeps its Codex counterpart, and an unknown tier is refused', () => {
  assert.deepEqual(['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-4-5-20251001', 'gpt-4'].map(tierOfClaude), ['small', 'mid', 'large', 'small', null]);
  assert.deepEqual(['small', 'mid', 'large', undefined, 'huge', 'constructor', '__proto__', 'toString'].map(modelOf), ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra', 'gpt-6.1-sol', null, null, null, null]);
});

test('the Worker keeps its egress list and exports what the list needs (it cannot be loaded here, so its source is read)', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../../workers/codex-broker/worker.js', import.meta.url), 'utf8');
  assert.match(src, /export \{ContainerProxy\} from '@cloudflare\/containers'/);   // missing: every container start fails (28 Oct 2026)
  assert.match(src, /enableInternet = false/);
  assert.match(src, /interceptHttps = true/);   // without it HTTPS fails with the internet off: codex timed out on chatgpt.com (28 Oct 2026)
  assert.match(src, /allowedHosts = OPENAI_HOSTS/);
  assert.match(src, /OPENAI_HOSTS = \['chatgpt\.com', 'auth\.openai\.com', 'api\.openai\.com'\]/);
  assert.match(src, /refuseReply\(answer\.reply\)/);   // the last layer against a credential in a reply
});

test('a planted injection\'s reply is refused: tokens, login fields, long encodings, long text', () => {
  const jwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJvd25lciJ9.c2lnbmF0dXJl';
  for (const text of [`Here: ${jwt}`, '{"refresh_token": "abc"}', 'x'.repeat(120), 'sk-' + 'a'.repeat(30), 'y '.repeat(10001)])
    assert.match(refuseReply(text), /^reply-refused/, text.slice(0, 20));
  assert.equal(refuseReply('{"verdict":"pass","reason":"the image is mostly red"}'), null);
});

test('the week reading is the window that lasts a week, whichever slot it sits in', () => {
  const day = {usedPercent: 3, resetsAt: 1, windowDurationMins: 300}, week = {usedPercent: 32, resetsAt: 2, windowDurationMins: 10080};
  assert.deepEqual(weeklyWindow({primary: week, secondary: null}), {usedPercent: 32, resetsAt: 2});
  assert.deepEqual(weeklyWindow({primary: day, secondary: week}), {usedPercent: 32, resetsAt: 2});   // the 5h window in primary must not be taken for the week
  assert.equal(weeklyWindow({primary: day, secondary: null}), null);
  assert.equal(weeklyWindow({primary: {usedPercent: 32, resetsAt: 2}}), null);   // no length given: not trusted
  assert.equal(weeklyWindow(undefined), null);
});
