// admin/ai-refusal.js: a skipped AI (the Codex broker said no) is named, kinds are told apart, the owner is told once per outage, no token is ever printed.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ask} from '../../admin/build-digest.js';
import {AiRefused, describe, isRefusal, kindOf, reportRefusal, shouldTell, staysDown, tellOwner} from '../../admin/ai-refusal.js';

// The Codex broker's answers as askBroker (desktop/e2e/lib/broker-client.mjs) reports them: 'capped' = its allowance or login said no, 'no-token', 'unreachable', or an HTTP status.
const answer = (status, detail) => ({broker: async () => ({ok: false, status, detail})});
const BUDGET = 'broker: budget:week 100% of 100% (scheduled)';

test('ask throws AiRefused with the kind: capped (the Codex allowance), no run token, unreachable, 401, 429, 502', async () => {
  for (const [status, detail, kind] of [['capped', BUDGET, 'limit'], ['no-token', 'no GitHub OIDC token here', 'auth'], ['unreachable', 'no answer from the broker', 'overloaded'], [401, 'broker: oidc: wrong repository', 'auth'], [429, 'broker: slow down', 'rate'], [502, 'broker: codex-failed', 'overloaded'], [422, 'broker: reply-refused: looks like a JWT', 'other']]) {
    const caught = await ask({system: 's', user: 'u'}, answer(status, detail)).catch(error => error);
    assert.ok(isRefusal(caught), `${status}`);
    assert.equal(caught.kind, kind, `${status}`);
    assert.equal(caught.status, status);
    assert.match(caught.message, new RegExp(`^broker answered ${status}: `));
  }
  assert.equal(kindOf(500, ''), 'overloaded');
});

test('the description says "AI skipped", names the cause and the broker\'s words, and never a token', async () => {
  const caught = await ask({system: 's', user: 'u'}, answer('capped', `${BUDGET} eyJhbGciOi`)).catch(error => error);
  assert.match(describe(caught), /^AI skipped \(limit\): the Codex plan's allowance or login is not available\. broker: budget:week 100% of 100% \(scheduled\)/);
  assert.doesNotMatch(describe(caught), /Anthropic/);
  assert.ok(staysDown(caught) && !staysDown(new AiRefused(422, 'reply-refused')) && !staysDown(new Error('x')));
});

test('the owner is told when the outage begins and once a day at 08, not at every red run', () => {
  assert.ok(shouldTell({previous: 'success', zurichHour: 14}) && shouldTell({previous: null, zurichHour: 14}));
  assert.ok(!shouldTell({previous: 'failure', zurichHour: 14}));
  assert.ok(shouldTell({previous: 'failure', zurichHour: 8}));
});

test('tellOwner uses the CI alerts bot, else the Build Log bot, skips without one, and never throws', async () => {
  const sent = [];
  const fetch = async (url, init) => { sent.push([url, JSON.parse(init.body).chat_id]); return new Response('{}'); };
  assert.deepEqual(await tellOwner('x', {env: {BUILDLOG_TELEGRAM_TOKEN: 'b', BUILDLOG_TELEGRAM_CHAT: '2', CI_ALERTS_TELEGRAM_BOT_TOKEN: 'a', CI_ALERTS_TELEGRAM_CHAT_ID: '1'}, fetch}), {sent: true});
  assert.deepEqual(await tellOwner('x', {env: {BUILDLOG_TELEGRAM_TOKEN: 'b', BUILDLOG_TELEGRAM_CHAT: '2'}, fetch}), {sent: true});
  assert.deepEqual(sent, [['https://api.telegram.org/bota/sendMessage', '1'], ['https://api.telegram.org/botb/sendMessage', '2']]);
  assert.ok((await tellOwner('x', {env: {}, fetch})).skipped);
  assert.ok((await tellOwner('x', {env: {BUILDLOG_TELEGRAM_TOKEN: 'b', BUILDLOG_TELEGRAM_CHAT: '2'}, fetch: async () => { throw new TypeError('down'); }})).skipped);
});

test('reportRefusal logs the named error and tells once: the run before red means no message', async () => {
  const told = [];
  const env = {BUILDLOG_TELEGRAM_TOKEN: 'b', BUILDLOG_TELEGRAM_CHAT: '2', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '9'};
  const fetch = async (_, init) => { told.push(JSON.parse(init.body).text); return new Response('{}'); };
  const runs = conclusion => () => JSON.stringify([{databaseId: 9, status: 'in_progress', conclusion: null}, {databaseId: 8, status: 'completed', conclusion}]);
  const error = new AiRefused('capped', BUDGET);
  await reportRefusal(error, {job: 'Changelog publish', effect: 'Plain entries went out.', workflow: 'w.yml', zurichHour: 14, env, fetch, run: runs('success')});
  assert.equal(told.length, 1);
  assert.match(told[0], /Changelog publish: AI skipped \(limit\).*\nPlain entries went out\./);
  await reportRefusal(error, {job: 'Changelog publish', workflow: 'w.yml', zurichHour: 14, env, fetch, run: runs('failure')});
  assert.equal(told.length, 1, 'already red before: no second message');
});
