// Guards the broker's pure rules (workers/codex-broker/lib): who may call, which lane, the allowance brakes, and the reply refusal.
import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyRunToken} from '../../workers/codex-broker/lib/oidc.mjs';
import {laneOf} from '../../workers/codex-broker/lib/lanes.mjs';
import {allow, newMeter, record, ownSharePct, TOKENS_PER_PERCENT} from '../../workers/codex-broker/lib/budget.mjs';
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

test('scheduled work stops at 60% own share, PR checks keep going to 75%, the week brake binds on a busy owner week', () => {
  let m = newMeter(2000000000);
  m = record(m, 'scheduled', 60 * TOKENS_PER_PERCENT, 1, 0);
  assert.equal(allow('scheduled', m, 10).ok, false);
  assert.match(allow('scheduled', m, 10).why, /own-share/);
  assert.equal(allow('bench', m, 10).ok, false);
  assert.equal(allow('pr', m, 10).ok, true);
  m = record(m, 'pr', 15 * TOKENS_PER_PERCENT, 1, 0);
  assert.equal(allow('pr', m, 10).ok, false);
  const fresh = newMeter(2000000000);
  assert.equal(allow('scheduled', fresh, 85).ok, false);
  assert.match(allow('scheduled', fresh, 85).why, /week/);
  assert.equal(allow('pr', fresh, 96).ok, true);
  assert.equal(allow('pr', fresh, 97).ok, false);
  assert.equal(allow('scheduled', fresh, null).ok, true);
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
  assert.deepEqual(['small', 'mid', 'large', undefined, 'huge'].map(modelOf), ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra', 'gpt-6.1-sol', null]);
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
