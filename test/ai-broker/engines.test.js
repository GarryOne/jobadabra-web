// The ENGINE flag: which engine answers first and how the others follow (workers/ai-broker/lib/engines.mjs). Fakes only: no real provider is called.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {day, body, harness} from './harness.mjs';
import {chainOf, ORDER} from '../../workers/ai-broker/lib/engines.mjs';

const config = JSON.parse(readFileSync(new URL('../../workers/ai-broker/wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
const freeAnswer = () => ({response: 'free answer', usage: {prompt_tokens: 100, completion_tokens: 20}});
const claudeAnswer = () => Response.json({type: 'message', content: [{type: 'text', text: 'claude answer'}], stop_reason: 'end_turn', usage: {input_tokens: 100, output_tokens: 20}});
// A fresh world per call: the env with a given ENGINE and fakes that count what each provider was asked.
function world(t, engine, {free = freeAnswer, withKey = true, extra = {}} = {}) {
  t.mock.method(Date, 'now', () => day);
  const calls = {free: 0, claudeApi: 0};
  const env = {...config.vars, ...(engine === undefined ? {ENGINE: undefined} : {ENGINE: engine}), BRAIN_BOT_TOKEN: 'fixture-bot', BRAIN_CHAT_ID: 'fixture-chat',
    ...(withKey ? {ANTHROPIC_API_KEY: 'fixture-not-a-key'} : {}), AI: {run: async () => { calls.free++; return free(); }}, ...extra};
  t.mock.method(globalThis, 'fetch', async url => { if (String(url).includes('telegram')) return Response.json({ok: true}); calls.claudeApi++; return claudeAnswer(); });
  const made = harness(undefined, env);
  const dispatched = [];
  const container = made.broker.containerFetch;
  made.broker.containerFetch = async (...args) => { dispatched.push(args[0]); return container(...args); };
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
