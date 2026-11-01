// The ENGINE flag: which engine answers first and how the others follow (workers/ai-broker/lib/engines.mjs). Fakes only: no real provider is called.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {day, body, harness} from './harness.mjs';
import {chainOf, ORDER} from '../../workers/ai-broker/lib/engines.mjs';

const config = JSON.parse(readFileSync(new URL('../../workers/ai-broker/wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
const freeAnswer = () => ({response: 'free answer', usage: {prompt_tokens: 100, completion_tokens: 20}});
const claudeAnswer = () => Response.json({type: 'message', content: [{type: 'text', text: 'claude answer'}], stop_reason: 'end_turn', usage: {input_tokens: 100, output_tokens: 20}});
const claudeOk = () => new Response(JSON.stringify({reply: 'claude ok', tokens: {input: 5, output: 3}, ms: 7, limits: {status: 'allowed', fiveHour: {utilization: 0.2}, sevenDay: {utilization: 0.05}}}));
const claudeFails = (error, extra = {}, status = 500) => () => new Response(JSON.stringify({error, ...extra}), {status});
// A fresh world per call: the env with a given ENGINE and fakes that count what each provider was asked.
function world(t, engine, {free = freeAnswer, withKey = true, extra = {}, claude = claudeOk, token = false, codex = null} = {}) {
  t.mock.method(Date, 'now', () => day);
  const calls = {free: 0, claudeApi: 0, telegram: 0, claudeCli: 0, claudeBodies: [], claudeNow: 0, claudeMax: 0};
  const env = {...config.vars, ...(engine === undefined ? {ENGINE: undefined} : {ENGINE: engine}), BRAIN_BOT_TOKEN: 'fixture-bot', BRAIN_CHAT_ID: 'fixture-chat',
    ...(withKey ? {ANTHROPIC_API_KEY: 'fixture-not-a-key'} : {}), ...(token ? {CLAUDE_CODE_OAUTH_TOKEN: 'fixture-not-a-token'} : {}), AI: {run: async () => { calls.free++; return free(); }}, ...extra};
  t.mock.method(globalThis, 'fetch', async url => { if (String(url).includes('telegram')) { calls.telegram++; return Response.json({ok: true}); } calls.claudeApi++; return claudeAnswer(); });
  const made = harness(undefined, env);
  const dispatched = [];
  const container = made.broker.containerFetch;
  made.broker.containerFetch = async (...args) => {
    dispatched.push(args[0]);
    if (!args[0].endsWith('/claude')) return codex ? codex(...args) : container(...args);
    calls.claudeCli++; calls.claudeBodies.push(JSON.parse(args[1].body)); calls.claudeNow++; calls.claudeMax = Math.max(calls.claudeMax, calls.claudeNow);
    try { return await claude(); } finally { calls.claudeNow--; }
  };
  return {...made, calls, dispatched, env};
}
const answered = async response => (await response.json()).engine;

test('the shipped default is ENGINE=codex and the order is subscriptions, then paid, then capped-free', () => {
  assert.equal(config.vars.ENGINE, 'codex');
  assert.deepEqual(ORDER, ['codex', 'claude', 'claude-api', 'free-ai']);
});

test('the chain starts at ENGINE and keeps the fixed order after it; unset or unknown is codex, an unknown value is said, not guessed', () => {
  assert.deepEqual(chainOf({}).chain, ['codex', 'claude', 'claude-api', 'free-ai']);
  assert.deepEqual(chainOf({ENGINE: 'codex'}).chain, ['codex', 'claude', 'claude-api', 'free-ai']);
  assert.deepEqual(chainOf({ENGINE: 'claude'}).chain, ['claude', 'codex', 'claude-api', 'free-ai']);
  assert.deepEqual(chainOf({ENGINE: 'free-ai'}).chain, ['free-ai', 'codex', 'claude', 'claude-api']);
  const bad = chainOf({ENGINE: 'banana'});
  assert.deepEqual(bad.chain, ORDER); assert.equal(bad.first, 'codex'); assert.match(bad.warning, /unknown ENGINE "banana"/);
});

test('ENGINE=codex: Codex answers; its week used up, the Anthropic API answers next, then Free AI', async t => {
  const {broker, storage, calls} = world(t, 'codex');
  assert.equal(await answered(await broker.call('pr', body)), 'codex');
  await storage.put('limits', {usedPercent: 100, resetsAt: day / 1000 + 3600});
  broker.limits = null;
  assert.equal(await answered(await broker.call('pr', body)), 'claude-api');
  assert.equal(calls.claudeApi, 1); assert.equal(calls.free, 0);
});

test('ENGINE=claude: the subscription engine is not built yet, so its step is skipped and Codex answers; the order after Codex is unchanged', async t => {
  const {broker, storage, calls} = world(t, 'claude');
  assert.equal(await answered(await broker.call('pr', body)), 'codex');
  await storage.put('limits', {usedPercent: 100, resetsAt: day / 1000 + 3600});
  broker.limits = null;
  assert.equal(await answered(await broker.call('pr', body)), 'claude-api');
  assert.equal(calls.claudeApi, 1);
  const health = await (await broker.health()).json();
  assert.equal(health.engine, 'claude'); assert.deepEqual(health.chain.map(e => e.name), ['claude', 'codex', 'claude-api', 'free-ai']);
  assert.equal(health.chain[0].configured, false);   // not configured = skipped, never failed
});

test('ENGINE=free-ai: Free AI answers first without touching Codex; when it has nothing to give Codex answers', async t => {
  const first = world(t, 'free-ai');
  first.broker.containerFetch = async () => assert.fail('Free AI answers first: Codex must not be called');
  assert.equal(await answered(await first.broker.call('pr', body)), 'free-ai');
  assert.equal(first.calls.free, 1);
  const failing = world(t, 'free-ai', {free: () => { throw new Error('workers ai down'); }});
  assert.equal(await answered(await failing.broker.call('pr', body)), 'codex');   // a failed step moves on, Codex has not run out
  const off = world(t, 'free-ai', {extra: {FALLBACK_FREE_AI_DAY_USD: '0'}});
  assert.equal(await answered(await off.broker.call('pr', body)), 'codex');   // not configured = skipped
  assert.equal(off.calls.free, 0);
});

test('ENGINE=free-ai with a search request or without a Codex login: search goes to Codex, no login does not stop Free AI', async t => {
  const {broker, dispatched, calls} = world(t, 'free-ai');
  assert.equal(await answered(await broker.call('pr', {...body, search: true})), 'codex');
  assert.equal(calls.free, 0); assert.equal(dispatched.length, 1);
  const none = world(t, 'free-ai');
  await none.storage.put('login', undefined);
  assert.equal(await answered(await none.broker.call('pr', body)), 'free-ai');
});

test('only "ran out" moves on from Codex: with Free AI first and nothing left, a Codex failure is Codex\'s refusal, not another engine\'s answer', async t => {
  const {broker, calls} = world(t, 'free-ai', {free: () => { throw new Error('down'); }, withKey: false});
  broker.containerFetch = async () => new Response(JSON.stringify({error: 'codex-failed:1 boom'}), {status: 500});
  const response = await broker.call('pr', body);
  assert.equal(response.status, 502); assert.match((await response.json()).why, /codex-failed:1 boom/);
  assert.equal(calls.claudeApi, 0);   // the Anthropic API sits after Codex and is not asked to cover a plain failure
});

test('the drift daily cap holds whichever engine answers, and the answered calls are counted per engine in /health', async t => {
  const {broker, calls} = world(t, 'free-ai');
  broker.containerFetch = async () => assert.fail('not Codex');
  const replies = await Promise.all(Array.from({length: 26}, () => broker.call('drift', body)));
  assert.equal(replies.filter(r => r.status === 200).length, 24);
  for (const reply of replies.filter(r => r.status === 429)) assert.deepEqual(await reply.json(), {why: 'budget:daily 24 of 24 calls (drift)'});
  assert.equal(calls.free, 24);
  const health = await (await broker.health()).json();
  assert.equal(health.chain.find(e => e.name === 'free-ai').answeredToday, 24);
  assert.equal(health.chain.find(e => e.name === 'codex').answeredToday, 0);
  assert.equal(JSON.stringify(health).includes('fixture-not-a-key'), false);   // /health never carries a secret
});

test('an unknown ENGINE keeps today\'s behaviour and /health says why', async t => {
  const {broker} = world(t, 'banana');
  assert.equal(await answered(await broker.call('pr', body)), 'codex');
  const health = await (await broker.health()).json();
  assert.equal(health.engine, 'codex'); assert.match(health.warning, /unknown ENGINE "banana"/);
});

test('ENGINE=free-ai: a bad Free AI answer (invalid JSON for a schema, a cut-off reply) does not end the chain, Codex answers; after Codex the refusal stays final (Gitar on #289)', async t => {
  const schema = {type: 'object'};
  for (const bad of [() => ({response: 'not json', usage: {prompt_tokens: 100, completion_tokens: 20}}), () => ({choices: [{finish_reason: 'length', message: {content: 'cut'}}], usage: {prompt_tokens: 100, completion_tokens: 20}})]) {
    const {broker, calls} = world(t, 'free-ai', {free: bad});
    const response = await broker.call('pr', {...body, schema});
    assert.equal(response.status, 200); assert.equal(await answered(response), 'codex');
    assert.equal(calls.free, 1);   // it was asked and its answer was refused, then Codex answered
  }
  const last = world(t, 'codex');
  await last.storage.put('limits', {usedPercent: 100, resetsAt: day / 1000 + 3600});
  last.broker.limits = null;
  t.mock.method(globalThis, 'fetch', async () => Response.json({type: 'message', content: [{type: 'text', text: 'not json'}], stop_reason: 'end_turn', usage: {input_tokens: 100, output_tokens: 20}}));
  const refused = await last.broker.call('pr', {...body, schema});
  assert.equal(refused.status, 503); assert.equal((await refused.json()).why, 'fallback:invalid-json');   // Claude after Codex: the same last-resort 503 as before the flag
});

const withToken = {token: true};

test('ENGINE=claude with a token: the Claude subscription answers at the tier\'s model, the token reaches the container only as an environment variable, /health shows its state and no secret', async t => {
  const {broker, calls, dispatched} = world(t, 'claude', withToken);
  const images = [{name: 'a.png', base64: 'QQ=='}];
  const response = await broker.call('pr', {...body, tier: 'large', schema: {type: 'object'}, images});
  const answer = await response.json();
  assert.equal(answer.engine, 'claude'); assert.equal(answer.model, 'claude-opus-5-5'); assert.equal(answer.reply, 'claude ok'); assert.deepEqual(answer.tokens, {input: 5, output: 3});
  assert.equal(answer.fellBack, undefined);
  assert.deepEqual(calls.claudeBodies[0], {prompt: body.prompt, schema: {type: 'object'}, images, model: 'claude-opus-5-5'});
  assert.deepEqual(dispatched.filter(url => url.endsWith('/call')), []);   // Codex was not asked
  assert.deepEqual(broker.envVars, {CLAUDE_CODE_OAUTH_TOKEN: 'fixture-not-a-token'});
  for (const [tier, model] of [['small', 'claude-haiku-5-5'], ['mid', 'claude-sonnet-5-5']]) { await broker.call('pr', {...body, tier}); assert.equal(calls.claudeBodies.at(-1).model, model); }
  const health = await (await broker.health()).json(), entry = health.chain[0];
  assert.equal(entry.name, 'claude'); assert.equal(entry.state, 'ready'); assert.equal(entry.answeredToday, 3); assert.equal(entry.avgMs !== null, true); assert.equal(entry.limits.fiveHour.utilization, 0.2);
  assert.equal(JSON.stringify(health).includes('fixture-not-a-token'), false);
});

test('one call can choose its engine (a workflow trying claude) while every other call stays on the configured one; an unknown choice is a 400', async t => {
  const {broker, calls} = world(t, 'codex', withToken);
  assert.equal(await answered(await broker.call('pr', {...body, engine: 'claude'})), 'claude');
  assert.equal(await answered(await broker.call('pr', body)), 'codex');
  assert.equal(calls.claudeCli, 1);
  for (const engine of ['banana', 'claude-api', '', null, 1]) {
    const response = await broker.call('pr', {...body, engine});
    assert.equal(response.status, 400); assert.deepEqual(await response.json(), {why: 'engine must be codex, claude or free-ai'});
  }
});

test('the chain with Codex first: Codex\'s week used up, the Claude subscription answers before the paid API, and the reply says what it fell back from', async t => {
  const {broker, storage, calls} = world(t, 'codex', withToken);
  await storage.put('limits', {usedPercent: 100, resetsAt: day / 1000 + 3600});
  broker.limits = null;
  const answer = await (await broker.call('pr', body)).json();
  assert.equal(answer.engine, 'claude'); assert.deepEqual(answer.fellBack, [{engine: 'codex', why: 'ran-out'}]);
  assert.equal(calls.claudeApi, 0);
  const health = await (await broker.health()).json();
  assert.equal(health.chain.find(e => e.name === 'codex').ranOutToday, 1);
});

test('an invalid token: the next engine answers, the owner is told once, /health says token-invalid, and Claude is not asked again until the hour is up', async t => {
  const {broker, calls} = world(t, 'claude', {...withToken, claude: claudeFails('claude-auth')});
  const first = await (await broker.call('pr', body)).json();
  assert.equal(first.engine, 'codex'); assert.deepEqual(first.fellBack, [{engine: 'claude', why: 'token-invalid'}]);
  const second = await (await broker.call('pr', body)).json();
  assert.equal(second.engine, 'codex'); assert.deepEqual(second.fellBack, [{engine: 'claude', why: 'token-invalid'}]);
  assert.equal(calls.claudeCli, 1); assert.equal(calls.telegram, 1);
  assert.equal((await (await broker.health()).json()).chain[0].state, 'token-invalid');
  Date.now.mock.mockImplementation(() => day + 3601_000);   // an hour later it is tried again
  await broker.call('pr', body); assert.equal(calls.claudeCli, 2);
});

test('the subscription used up: it waits for the reset time the CLI reported, then is tried again; an unknown failure is only a failure and is tried at once next time', async t => {
  const reset = day / 1000 + 7200;
  const limit = world(t, 'claude', {...withToken, claude: claudeFails('claude-limit', {resetsAt: reset})});
  assert.deepEqual((await (await limit.broker.call('pr', body)).json()).fellBack, [{engine: 'claude', why: 'ran-out'}]);
  await limit.broker.call('pr', body); assert.equal(limit.calls.claudeCli, 1);   // still waiting for the reset
  assert.equal((await (await limit.broker.health()).json()).chain[0].state, 'ran-out');
  Date.now.mock.mockImplementation(() => reset * 1000 + 1000);
  await limit.broker.call('pr', body); assert.equal(limit.calls.claudeCli, 2);
  const flaky = world(t, 'claude', {...withToken, claude: claudeFails('claude-failed:1 boom')});
  await flaky.broker.call('pr', body); await flaky.broker.call('pr', body);
  assert.equal(flaky.calls.claudeCli, 2);
  const health = await (await flaky.broker.health()).json();
  assert.equal(health.chain[0].failedToday, 2); assert.equal(health.chain[0].ranOutToday, 0); assert.equal(health.chain[0].state, 'ready');
});

test('search is Codex\'s, a token-shaped Claude reply never reaches the caller, and six parallel Claude calls run at most three at a time', async t => {
  const {broker, calls} = world(t, 'claude', withToken);
  assert.equal(await answered(await broker.call('pr', {...body, search: true})), 'codex'); assert.equal(calls.claudeCli, 0);
  const leaky = world(t, 'claude', {...withToken, claude: () => new Response(JSON.stringify({reply: 'sk-' + 'a'.repeat(30), tokens: {input: 1, output: 1}, ms: 1}))});
  assert.equal(await answered(await leaky.broker.call('pr', body)), 'codex');   // the guard refuses it and Codex, not yet run, answers
  const slow = world(t, 'claude', {...withToken, claude: async () => { await new Promise(resolve => setTimeout(resolve, 10)); return claudeOk(); }});
  assert.equal((await Promise.all(Array.from({length: 6}, () => slow.broker.call('pr', body)))).filter(r => r.status === 200).length, 6);
  assert.equal(slow.calls.claudeMax, 3);
});

// JOB-202 (owner, 1 Nov 2026: "adapt or report if one is doing worse than the other"): an engine that fails half of its last calls goes behind the other subscription for 30 minutes.
const codexBroken = () => new Response(JSON.stringify({error: 'codex-failed:1 boom'}), {status: 500});

test('Codex failing half its last calls moves behind Claude for 30 minutes, the owner is told once, a call that names its engine is never moved, then Codex is first again', async t => {
  const {broker, calls} = world(t, 'codex', {...withToken, codex: codexBroken});
  for (let i = 0; i < 6; i++) assert.equal((await broker.call('pr', body)).status, 502);   // Codex first, each of these callers saw the failure
  assert.equal(calls.telegram, 1);
  const health = await (await broker.health()).json();
  assert.ok(health.chain.find(e => e.name === 'codex').demotedUntil);
  const next = await (await broker.call('pr', body)).json();
  assert.equal(next.engine, 'claude'); assert.equal(next.fellBack, undefined);   // Claude answers first now
  assert.equal((await broker.call('pr', {...body, engine: 'codex'})).status, 502);   // an explicit choice is honoured
  Date.now.mock.mockImplementation(() => day + 31 * 60_000);
  assert.equal((await broker.call('pr', body)).status, 502);   // Codex is first again, with a fresh window
  assert.equal(calls.telegram, 1);
});

test('only real failures count: a few failures, a used-up week, or ENGINE_ADAPT=off never move an engine', async t => {
  const few = world(t, 'codex', {...withToken, codex: codexBroken});
  for (let i = 0; i < 3; i++) await few.broker.call('pr', body);
  const ok = world(t, 'codex', withToken);
  for (let i = 0; i < 4; i++) await ok.broker.call('pr', body);
  assert.equal((await (await few.broker.health()).json()).chain[0].demotedUntil, undefined);   // 3 failures are below the 6 recorded
  const used = world(t, 'codex', withToken);
  await used.storage.put('limits', {usedPercent: 100, resetsAt: day / 1000 + 3600}); used.broker.limits = null;
  for (let i = 0; i < 12; i++) await used.broker.call('pr', body);   // Claude answers each; Codex "ran out" is not "worse"
  assert.equal((await (await used.broker.health()).json()).chain[0].demotedUntil, undefined);
  const off = world(t, 'codex', {...withToken, codex: codexBroken, extra: {ENGINE_ADAPT: 'off'}});
  for (let i = 0; i < 8; i++) await off.broker.call('pr', body);
  assert.equal(await answered(await off.broker.call('pr', body)), undefined);   // still Codex, still failing, never moved
  assert.equal(off.calls.claudeCli, 0);
  assert.equal(config.vars.ENGINE_ADAPT, 'on');
});

test('Claude failing half its last calls moves behind Codex and is not called for 30 minutes; with no other subscription configured nothing moves', async t => {
  const {broker, calls} = world(t, 'claude', {...withToken, claude: claudeFails('claude-failed:1 boom')});
  for (let i = 0; i < 6; i++) assert.equal(await answered(await broker.call('pr', body)), 'codex');   // each fell through to Codex
  assert.equal(calls.claudeCli, 6);
  assert.equal(await answered(await broker.call('pr', body)), 'codex');
  assert.equal(calls.claudeCli, 6);   // demoted: Codex first, Claude not asked
  const alone = world(t, 'codex', {codex: codexBroken});   // no Claude token
  for (let i = 0; i < 7; i++) assert.equal((await alone.broker.call('pr', body)).status, 502);   // nowhere to move: still Codex
  assert.ok((await (await alone.broker.health()).json()).chain[0].demotedUntil);   // but the failure is reported
});
