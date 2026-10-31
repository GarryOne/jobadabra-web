// Exercises broker admission, persistence and failure accounting offline; only Cloudflare's runtime and Codex transport are replaced.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Node cannot load Cloudflare's Container runtime. Keep the actual Worker and its libraries;
// substitute the runtime constructor, then provide isolated storage and transport per test.
const workerUrl = new URL('../../workers/codex-broker/worker.js', import.meta.url);
const runtime = 'data:text/javascript;base64,' + Buffer.from(`
  export class Container { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }
  export class ContainerProxy {}
  export const getContainer = broker => broker;
`).toString('base64');
const source = readFileSync(workerUrl, 'utf8')
  .replaceAll("'@cloudflare/containers'", JSON.stringify(runtime))
  .replace(/from '(\.{1,2}\/[^']+)'/g, (_, ref) => `from '${new URL(ref, workerUrl).href}'`);
const {CodexBroker} = await import('data:text/javascript;base64,' + Buffer.from(source + `\n//# sourceURL=${workerUrl.href}`).toString('base64'));
const day = Date.parse('2026-10-30T23:59:59Z');
const body = {prompt: 'offline test', tier: 'small'};
const success = () => new Response(JSON.stringify({reply: 'ok', tokens: {input: 2, output: 3}, ms: 1}));

function harness(meter, env = {}) {
  const values = new Map([['login', 'test login']]);
  if (meter) values.set('meter', structuredClone(meter));
  let pending = Promise.resolve();
  const storage = {
    get: async key => structuredClone(values.get(key)),
    put: async (key, value) => { values.set(key, structuredClone(value)); },
    // Serialize admission and completion transactions; snapshots are independent, as in DO storage.
    transaction(fn) {
      const next = pending.then(() => fn(storage));
      pending = next.catch(() => {});
      return next;
    },
  };
  const restart = () => {
    const broker = new CodexBroker({storage}, env);
    broker.containerFetch = async () => success();
    return broker;
  };
  return {broker: restart(), restart, storage};
}

test('concurrent calls across the cap dispatch only 24 and preserve token completions', async t => {
  t.mock.method(Date, 'now', () => day);
  const {broker, storage} = harness();
  let dispatched = 0;
  broker.containerFetch = async () => { dispatched++; return success(); };
  const replies = await Promise.all(Array.from({length: 30}, () => broker.call('drift', body)));
  assert.equal(replies.filter(r => r.status === 200).length, 24);
  assert.equal(replies.filter(r => r.status === 429).length, 6);
  for (const reply of replies.filter(r => r.status === 429)) {
    assert.deepEqual(await reply.json(), {why: 'budget:daily 24 of 24 calls (drift)'});
  }
  assert.equal(dispatched, 24);
  assert.equal((await storage.get('meter')).tokens.drift, 120);
  assert.equal((await (await broker.health()).json()).daily.drift, 24);
});

test('each failure counts before dispatch and survives an eviction or rerun', async t => {
  t.mock.method(Date, 'now', () => day);
  const {broker, restart} = harness();
  const responses = [
    () => new Response(JSON.stringify({error: 'codex failed'}), {status: 500}),
    () => new Response('not JSON', {status: 502}),
    () => { throw new Error('container unavailable'); },
    () => new Response(JSON.stringify({reply: 'sk-' + 'a'.repeat(30), tokens: {input: 1, output: 1}, ms: 1})),
  ];
  for (let i = 0; i < 24; i++) {
    broker.containerFetch = async () => {
      assert.equal((await (await broker.health()).json()).daily.drift, i + 1, 'reservation precedes transport');
      return responses[i % 4]();
    };
    if (i % 4 === 2) await assert.rejects(() => broker.call('drift', body), /container unavailable/);
    else assert.equal((await broker.call('drift', body)).status, [502, 502, 0, 422][i % 4]);
  }
  const resumed = restart();
  assert.equal((await resumed.call('drift', body)).status, 429);
  assert.equal((await (await resumed.health()).json()).daily.drift, 24);
});

test('health and admission reset on the next UTC day, even with an old stored meter', async t => {
  let now = day;
  t.mock.method(Date, 'now', () => now);
  const {broker, restart, storage} = harness({resetsAt: 2000000000, tokens: {pr: 1, scheduled: 2, bench: 3}});
  assert.equal((await (await broker.health()).json()).daily.drift, 0);
  for (let i = 0; i < 24; i++) assert.equal((await broker.call('drift', body)).status, 200);
  now += 1000;
  const resumed = restart();
  assert.equal((await (await resumed.health()).json()).daily.drift, 0);
  assert.equal((await resumed.call('drift', body)).status, 200);
  assert.equal((await (await resumed.health()).json()).daily.drift, 1);
  assert.equal((await storage.get('meter')).tokens.drift, 125);
});

test('weekly refusals do not consume daily slots and caller input cannot change the accepted lane', async t => {
  t.mock.method(Date, 'now', () => day);
  const {broker, storage} = harness();
  await storage.put('limits', {usedPercent: 100});
  assert.equal((await broker.call('drift', {...body, lane: 'pr'})).status, 429);
  assert.equal((await (await broker.health()).json()).daily.drift, 0);
  broker.limits = {usedPercent: 0};
  for (let i = 0; i < 24; i++) assert.equal((await broker.call('drift', {...body, lane: 'pr'})).status, 200);
  assert.equal((await broker.call('drift', {...body, lane: 'pr'})).status, 429);
});

test('non-boolean search is a 400 before admission or container dispatch', async t => {
  for (const search of ['true', 'false', 0, 1, null, {}, []]) await t.test(JSON.stringify(search), async () => {
    const {broker, storage} = harness();
    broker.containerFetch = async () => { assert.fail('invalid search must not reach Codex'); };
    const response = await broker.fetch(new Request('http://c/call', {
      method: 'POST', headers: {'x-lane': 'scheduled'}, body: JSON.stringify({...body, search}),
    }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {why: 'search must be a boolean'});
    assert.equal(await storage.get('meter'), undefined);
  });
});

test('search keeps every tier, lane, queue priority and meter identical to ordinary calls', async t => {
  t.mock.method(Date, 'now', () => day);
  const tiers = [[undefined, 'mid', 'gpt-6.1-sol'], ['small', 'small', 'gpt-6-luna'], ['mid', 'mid', 'gpt-6.1-sol'], ['large', 'large', 'gpt-6-astra']];
  for (const lane of ['pr', 'scheduled', 'bench', 'drift']) for (const [tier, expectedTier, model] of tiers) {
    let ordinaryMeter;
    for (const option of [{}, {search: false}, {search: true}]) {
      const {broker, storage} = harness();
      const acquire = broker.gate.acquire.bind(broker.gate);
      broker.gate.acquire = async priority => {
        assert.equal(priority, lane === 'drift' ? 'scheduled' : lane);
        return acquire(priority);
      };
      broker.containerFetch = async (url, init) => {
        assert.equal(url, 'http://c/call');
        assert.deepEqual(JSON.parse(init.body), {prompt: 'offline test', ...(tier === undefined ? {} : {tier}), ...option, lane: 'forged', model});
        return success();
      };
      const response = await broker.call(lane, {...body, tier, ...option, lane: 'forged'});
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {reply: 'ok', tokens: {input: 2, output: 3}, ms: 1, lane, tier: expectedTier, model, weekUsedPercent: null});
      const meter = await storage.get('meter');
      assert.equal(meter.tokens[lane], 5);
      if (ordinaryMeter) assert.deepEqual(meter, ordinaryMeter);
      else ordinaryMeter = meter;
      broker.limits = {usedPercent: 100};
      assert.equal((await broker.call(lane, {...body, tier, ...option})).status, 429);
      assert.deepEqual(await storage.get('meter'), ordinaryMeter);
    }
  }
});

const brokerConfig = JSON.parse(readFileSync(new URL('../../workers/codex-broker/wrangler.jsonc', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
const fallbackEnv = () => ({...brokerConfig.vars, ANTHROPIC_API_KEY: 'fixture-not-a-key',
  AI: {run: async () => ({response: 'free answer', usage: {prompt_tokens: 100, completion_tokens: 20}})},
  BRAIN_BOT_TOKEN: 'fixture-bot', BRAIN_CHAT_ID: 'fixture-chat'});
const claudeAnswer = (usage = {input_tokens: 100, output_tokens: 20}, text = 'claude answer') => Response.json({type: 'message', content: [{type: 'text', text}], stop_reason: 'end_turn', usage});
const spentDay = (claude = 0, free = 0) => ({spent: {claude, 'free-ai': free}, held: {claude: 0, 'free-ai': 0}, notified: {}});
const dayKey = 'fallback:2026-10-30';

test('weekly refusal answers via Claude at each requested tier, preserving schema and images', async t => {
  t.mock.method(Date, 'now', () => day);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { requests.push({url, body: JSON.parse(init.body)}); if (url.endsWith('/count_tokens')) return Response.json({input_tokens: 100}); return claudeAnswer(undefined, '{"answer":true}'); });
  for (const [tier, model] of [['small', 'claude-haiku-5-5'], ['mid', 'claude-sonnet-5-5'], ['large', 'claude-opus-5-5']]) {
    const {broker, storage} = harness(undefined, fallbackEnv());
    await storage.put('limits', {usedPercent: 100, resetsAt: day / 1000 + 3600});
    broker.containerFetch = async () => assert.fail('exhausted Codex must not dispatch');
    const response = await broker.call('scheduled', {...body, tier, schema: {type: 'object'}, images: [{name: 'img.png', base64: 'ZmFrZQ=='}]});
    assert.equal(response.status, 200);
    const answer = await response.json();
    assert.equal(answer.engine, 'claude'); assert.equal(answer.model, model); assert.equal(answer.reply, '{"answer":true}');
    assert.deepEqual(answer.tokens, {input: 100, output: 20});
    const sent = requests.at(-1);
    assert.equal(sent.url, 'https://api.anthropic.com/v1/messages'); assert.equal(sent.body.model, model);
    assert.deepEqual(sent.body.output_config.format.schema, {type: 'object'});
    assert.deepEqual(sent.body.messages[0].content[1], {type: 'image', source: {type: 'base64', media_type: 'image/png', data: 'ZmFrZQ=='}});
    const health = await (await broker.health()).json();
    assert.ok(health.fallback.claude > 0); assert.equal(health.fallback.held.claude, 0);
  }
});

test('Codex usage-limit error falls back, unrelated or credential-shaped failures do not', async t => {
  t.mock.method(globalThis, 'fetch', async () => claudeAnswer());
  for (const [error, expected] of [["codex-failed:1 You've hit your usage limit", 200], ['codex failed', 502], ['codex-failed:1 rate_limit_exceeded', 502], ['usage limit sk-' + 'a'.repeat(30), 502]]) {
    const {broker} = harness(undefined, fallbackEnv());
    broker.containerFetch = async () => Response.json({error}, {status: 500});
    const reply = await broker.call('pr', body);
    assert.equal(reply.status, expected);
    if (expected === 200) assert.equal((await reply.json()).engine, 'claude');
  }
});

test('Claude at $5 uses Free AI, both caps refuse, eviction and UTC rollover preserve the right day', async t => {
  let now = day;
  t.mock.method(Date, 'now', () => now);
  const notes = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => { if (url.includes('telegram.org')) { notes.push(JSON.parse(init.body).text); return Response.json({ok: true}); } return claudeAnswer(); });
  const {broker, storage, restart} = harness(undefined, fallbackEnv());
  await storage.put('limits', {usedPercent: 100, resetsAt: day / 1000 + 86400});
  await storage.put(dayKey, spentDay(5_000_000));
  assert.equal((await (await broker.call('pr', body)).json()).engine, 'free-ai');
  assert.equal((await (await restart().call('pr', body)).json()).engine, 'free-ai');
  assert.equal(notes.length, 1);
  await storage.put(dayKey, {...await storage.get(dayKey), spent: {claude: 5_000_000, 'free-ai': 2_000_000}});
  for (let i = 0; i < 3; i++) {
    const reply = await restart().call('pr', body);
    assert.equal(reply.status, 429); assert.match((await reply.json()).why, /^budget:fallback-day \$5/);
  }
  assert.equal(notes.length, 2);
  now += 1000;
  assert.equal((await (await restart().health()).json()).fallback.claude, 0);
  assert.equal((await (await restart().call('pr', body)).json()).engine, 'claude');
  await storage.put('fallback:2026-10-31', spentDay(5_000_000, 2_000_000));
  await restart().call('pr', body);
  assert.equal(notes.length, 4, 'both caps can alert on a new UTC day');
});

test('fallback keeps drift daily admission and unsupported search or Free AI images go grey', async t => {
  t.mock.method(Date, 'now', () => day);
  t.mock.method(globalThis, 'fetch', async () => claudeAnswer());
  const {broker, storage} = harness(undefined, fallbackEnv());
  await storage.put('limits', {usedPercent: 100});
  const search = await broker.call('scheduled', {...body, search: true});
  assert.equal(search.status, 503); assert.match((await search.json()).why, /fallback:search-unsupported/);
  for (let i = 0; i < 24; i++) assert.equal((await broker.call('drift', body)).status, 200);
  const denied = await broker.call('drift', body);
  assert.equal(denied.status, 429); assert.match((await denied.json()).why, /budget:daily/);
  await storage.put(dayKey, spentDay(5_000_000));
  const image = await broker.call('pr', {...body, images: [{name: 'a.png', base64: 'ZmFrZQ=='}]});
  assert.equal(image.status, 503); assert.match((await image.json()).why, /fallback:unsupported/);
});

test('concurrent fallback reserves the balance before dispatch and settles late replies to the admission day', async t => {
  let now = day, called = 0, held;
  t.mock.method(Date, 'now', () => now);
  const env = fallbackEnv(); delete env.BRAIN_BOT_TOKEN;
  const {broker, storage} = harness(undefined, env);
  await storage.put('limits', {usedPercent: 100});
  await storage.put(dayKey, spentDay(4_990_000, 2_000_000));
  t.mock.method(globalThis, 'fetch', async () => {
    called++; held = (await storage.get(dayKey)).held.claude;
    assert.ok(held > 0 && held <= 10_000);
    await new Promise(resolve => setTimeout(resolve, 5));
    now = day + 1000;
    return claudeAnswer();
  });
  const replies = await Promise.all([broker.call('pr', {...body, tier: 'large'}), broker.call('pr', {...body, tier: 'large'})]);
  assert.deepEqual(replies.map(r => r.status).sort(), [200, 429]);
  assert.equal(called, 1);
  assert.equal((await storage.get(dayKey)).spent.claude, 4_990_800);
  assert.equal((await storage.get(dayKey)).held.claude, 0);
  assert.equal((await (await broker.health()).json()).fallback.claude, 0);
});

test('explicitly disabled Free AI stays off; uncertain requests hold their reservation', async t => {
  t.mock.method(Date, 'now', () => day);
  const env = fallbackEnv(); env.FALLBACK_FREE_AI_DAY_USD = '0'; delete env.BRAIN_BOT_TOKEN;
  const {broker, storage, restart} = harness(undefined, env);
  await storage.put('limits', {usedPercent: 100});
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline provider failure'); });
  assert.equal((await broker.call('pr', body)).status, 503);
  const state = await storage.get(dayKey);
  assert.equal(state.spent.claude, 0); assert.ok(state.held.claude > 0);
  assert.equal((await (await restart().health()).json()).fallback.freeAiCap, 0);
});

test('a new Codex week retries Codex before spending fallback money', async t => {
  t.mock.method(Date, 'now', () => day);
  const {broker, storage} = harness({resetsAt: day / 1000 - 1, tokens: {pr: 72_000_000}, daily: {day: null, calls: {drift: 0}}}, fallbackEnv());
  await storage.put('limits', {usedPercent: 100, resetsAt: day / 1000 - 1});
  t.mock.method(globalThis, 'fetch', async () => assert.fail('the expired week must retry Codex'));
  assert.equal((await (await broker.call('pr', body)).json()).reply, 'ok');
});

test('known usage is metered even for rejected answers and overclaims; unknown usage retains its reservation', async t => {
  t.mock.method(Date, 'now', () => day);
  const answers = [
    [{type: 'message', content: [{type: 'text', text: ''}], stop_reason: 'end_turn', usage: {input_tokens: 100, output_tokens: 20}}, 'fallback:reply-refused', true],
    [{type: 'message', content: [{type: 'text', text: 'truncated'}], stop_reason: 'max_tokens', usage: {input_tokens: 100, output_tokens: 20}}, 'fallback:reply-refused', true],
    [{type: 'message', content: [{type: 'text', text: 'sk-' + 'a'.repeat(30)}], stop_reason: 'end_turn', usage: {input_tokens: 100, output_tokens: 20}}, 'fallback:reply-refused', true],
    [{type: 'message', content: [{type: 'text', text: 'unknown usage'}], stop_reason: 'end_turn'}, 'fallback:unavailable', false],
    [{type: 'message', content: [{type: 'text', text: 'bad usage'}], stop_reason: 'end_turn', usage: {input_tokens: 100, output_tokens: 1_000_000}}, 'fallback:usage-exceeded-reservation', 'overclaim'],
  ];
  for (const [message, why, metered] of answers) {
    const env = fallbackEnv(); env.FALLBACK_FREE_AI_DAY_USD = '0';
    const {broker, storage} = harness(undefined, env);
    await storage.put('limits', {usedPercent: 100});
    t.mock.method(globalThis, 'fetch', async () => Response.json(message));
    const reply = await broker.call('pr', body);
    assert.equal(reply.status, 503); assert.equal((await reply.json()).why, why);
    const data = await storage.get(dayKey);
    assert.equal(data.spent.claude, metered === 'overclaim' ? 500_010 : metered ? 20 : 0); // Haiku: 100 × $0.10/M + 20 × $0.50/M = $0.000020
    assert.equal(data.held.claude > 0, !metered);
  }
});

test('Claude HTTP refusal tries the configured Free AI binding and preserves a JSON schema', async t => {
  t.mock.method(Date, 'now', () => day);
  t.mock.method(globalThis, 'fetch', async () => Response.json({error: {type: 'rate_limit_error'}}, {status: 429}));
  const env = fallbackEnv();
  env.AI.run = async (model, request) => {
    assert.equal(model, '@cf/qwen/qwen3-30b-a3b-fp8');
    assert.deepEqual(request.response_format.json_schema.schema, {type: 'object'});
    assert.equal(request.messages[0].content, 'offline test');
    return {response: '{"ok":true}', usage: {prompt_tokens: 100, completion_tokens: 20}};
  };
  const {broker, storage} = harness(undefined, env);
  await storage.put('limits', {usedPercent: 100});
  const response = await broker.call('scheduled', {...body, schema: {type: 'object'}});
  assert.equal(response.status, 200); assert.equal((await response.json()).engine, 'free-ai');
  const state = await storage.get(dayKey);
  assert.equal(state.spent.claude, 0); assert.equal(state.held.claude, 0);
  assert.equal(state.spent['free-ai'], 12); // ceil(100 × .0509 + 20 × .335) microdollars
});


test('compressed images use Anthropic token counting before admitting paid vision work', async t => {
  t.mock.method(Date, 'now', () => day);
  const env = fallbackEnv(); delete env.BRAIN_BOT_TOKEN;
  const {broker, storage} = harness(undefined, env);
  await storage.put('limits', {usedPercent: 100});
  await storage.put(dayKey, spentDay(4_990_000, 2_000_000));
  let counted = 0, dispatched = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url.endsWith('/count_tokens')) {
      counted++;
      const request = JSON.parse(init.body);
      assert.equal(request.model, 'claude-opus-5-5');
      assert.equal(request.messages[0].content[1].source.data, 'ZmFrZQ==');
      return Response.json({input_tokens: 30_000});
    }
    dispatched++; return claudeAnswer();
  });
  const response = await broker.call('pr', {...body, tier: 'large', images: [{name: 'compressed.png', base64: 'ZmFrZQ=='}]});
  assert.equal(response.status, 429); assert.equal(counted, 1); assert.equal(dispatched, 0);
  assert.equal((await storage.get(dayKey)).held.claude, 0);
});

test('Free AI filtered or errored completions go grey while known usage is still charged', async t => {
  t.mock.method(Date, 'now', () => day);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ok: true}));
  for (const finish_reason of ['content_filter', 'error', 'length', 'tool_calls']) {
    const env = fallbackEnv();
    env.AI.run = async () => ({choices: [{message: {content: 'not a completed answer'}, finish_reason}], usage: {prompt_tokens: 100, completion_tokens: 20}});
    const {broker, storage} = harness(undefined, env);
    await storage.put('limits', {usedPercent: 100});
    await storage.put(dayKey, spentDay(5_000_000));
    const response = await broker.call('pr', body);
    assert.equal(response.status, 503); assert.equal((await response.json()).why, 'fallback:reply-refused');
    const state = await storage.get(dayKey);
    assert.equal(state.spent['free-ai'], 12); assert.equal(state.held['free-ai'], 0);
  }
});

test('Claude HTTP refusals name the cause, alert once per kind/day separately from caps, and still try Free AI', async t => {
  let now = day;
  t.mock.method(Date, 'now', () => now);
  for (const [status, text, kind] of [[400, 'workspace usage limits exceeded', 'limit'], [401, 'revoked', 'auth'], [429, 'too many requests', 'rate'], [529, 'busy', 'overloaded']]) {
    const notes = [];
    const env = fallbackEnv();
    const {broker, storage, restart} = harness(undefined, env);
    await storage.put('limits', {usedPercent: 100});
    t.mock.method(globalThis, 'fetch', async (url, init) => {
      if (url.includes('telegram.org')) { notes.push(JSON.parse(init.body).text); return Response.json({ok: true}); }
      return Response.json({error: {message: text + ' sk-' + 'a'.repeat(30)}}, {status});
    });
    for (let i = 0; i < 3; i++) {
      const response = await restart().call('pr', body);
      assert.equal(response.status, 200); assert.equal((await response.json()).engine, 'free-ai');
    }
    assert.equal(notes.length, 1); assert.match(notes[0], new RegExp(`Claude refused \\(${kind}\\)`));
    assert.ok(!notes[0].includes('sk-'), 'raw provider details never reach Telegram');
    env.FALLBACK_FREE_AI_DAY_USD = '0';
    const refused = await broker.call('pr', body);
    assert.equal(refused.status, 503); assert.equal((await refused.json()).why, `fallback:unavailable (claude ${kind})`);
    assert.equal(notes.length, 1);
    await storage.put('fallback:' + new Date(now).toISOString().slice(0, 10), spentDay(5_000_000));
    env.FALLBACK_FREE_AI_DAY_USD = '2';
    await restart().call('pr', body);
    assert.equal(notes.length, 2, 'a provider refusal marker must not suppress a budget-cap note');
    now += 86400000;
    await restart().call('pr', body);
    assert.equal(notes.length, 3, 'provider outage reminder can recur on the next UTC day');
  }
});

test('vision token-count HTTP refusals name and alert the Claude cause before going grey', async t => {
  t.mock.method(Date, 'now', () => day);
  const notes = [];
  const env = fallbackEnv();
  const {broker, storage} = harness(undefined, env);
  await storage.put('limits', {usedPercent: 100});
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    if (url.includes('telegram.org')) { notes.push(JSON.parse(init.body).text); return Response.json({ok: true}); }
    assert.ok(url.endsWith('/count_tokens'));
    return Response.json({error: {message: 'workspace usage limits exceeded'}}, {status: 400});
  });
  for (let i = 0; i < 2; i++) {
    const response = await broker.call('pr', {...body, images: [{name: 'img.png', base64: 'ZmFrZQ=='}]});
    assert.equal(response.status, 503); assert.equal((await response.json()).why, 'fallback:unsupported (claude limit)');
  }
  assert.equal(notes.length, 1); assert.match(notes[0], /Claude refused \(limit\)/);
});

test('an unknown effort is a 400 before admission or container dispatch', async t => {
  for (const effort of ['', 'max', 'HIGH', 'minimal', 1, null, {}, []]) await t.test(JSON.stringify(effort), async () => {
    t.mock.method(Date, 'now', () => day);
    const {broker, storage} = harness();
    broker.containerFetch = async () => { assert.fail('invalid effort must not reach Codex'); };
    const response = await broker.call('scheduled', {...body, effort});
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {why: 'effort must be low, medium, high or xhigh'});
    assert.equal(await storage.get('meter'), undefined);
  });
});

test('a valid effort reaches Codex and counts for more of the week: low and none 1x, high 2x, xhigh 4x', async t => {
  t.mock.method(Date, 'now', () => day);
  for (const [effort, counted] of [[undefined, 5], ['low', 5], ['medium', 5], ['high', 10], ['xhigh', 20]]) {
    const {broker, storage} = harness();
    let sent;
    broker.containerFetch = async (url, init) => { sent = JSON.parse(init.body); return success(); };
    const response = await broker.call('scheduled', {...body, tier: 'large', ...(effort ? {effort} : {})});
    assert.equal(response.status, 200);
    assert.equal(sent.effort, effort);
    assert.equal(sent.model, 'gpt-6-astra');
    assert.equal((await storage.get('meter')).tokens.scheduled, counted, `${effort ?? 'default'} effort`);
  }
});
