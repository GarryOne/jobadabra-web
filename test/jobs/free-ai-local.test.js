// The random draw's Free AI (jobs/persona-search/free-ai-local.mjs): the site's own Free AI handler on the runner, Workers AI over REST on the draws' token,
// production's caps from wrangler.toml, its own cost meter, and nothing sent to the owner (no Telegram) or to production's counters.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {report, restAi, serve, setup, vars} from '../../jobs/persona-search/free-ai-local.mjs';

const answer = {choices: [{message: {content: 'hi'}, finish_reason: 'stop'}], usage: {prompt_tokens: 1000, completion_tokens: 1000}};
function fakeCloudflare() {
  const urls = [];
  const fetcher = async (url, init = {}) => {
    urls.push(String(url));
    assert.ok(String(url).startsWith('https://api.cloudflare.com/client/v4/accounts/acct/ai/'), `only Workers AI on the draws' account: ${url}`);
    assert.equal(init.headers.authorization, 'Bearer cf-token');
    return Response.json({success: true, result: answer});
  };
  return {urls, fetcher};
}
const SECRETS = {RANDOM_DRAWS_CF_ACCOUNT_ID: 'acct', RANDOM_DRAWS_CF_AI_TOKEN: 'cf-token', RANDOM_DRAWS_ANTHROPIC_KEY: 'sk-draws'};

async function call(server, key, body = {model: 'claude-haiku-5-5', max_tokens: 100, messages: [{role: 'user', content: 'Hello'}]}) {
  const {port} = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/ai/v1/messages`, {method: 'POST', headers: {'x-api-key': key, 'content-type': 'application/json'}, body: JSON.stringify(body)});
  return {status: response.status, body: await response.json()};
}

test('production caps come from wrangler.toml [vars] only', () => {
  const read = vars('[vars]\nFREE_AI_INSTALL_DAY_USD = "0.50"   # note\nFREE_AI_NEURONS = "off"\n[env.staging.vars]\nFREE_AI_INSTALL_DAY_USD = "9"\n');
  assert.deepEqual(read, {FREE_AI_INSTALL_DAY_USD: '0.50', FREE_AI_NEURONS: 'off'});
  assert.ok(Number(vars().FREE_AI_INSTALL_DAY_USD) > 0, 'the real file has the per-install day line');
});

test('a call answers like Anthropic, is metered, and a wrong key is refused; nothing goes to Telegram or production', async () => {
  const cf = fakeCloudflare(), {env, key} = await setup(SECRETS, cf.fetcher);
  assert.match(key, /^JPF1\.ci-draw-[0-9a-f]{12}\.[0-9a-f]{32}$/);
  assert.ok(!env.BRAIN_BOT_TOKEN && !env.CF_ANALYTICS_TOKEN, 'no alert, no account-wide count');
  assert.equal(env.WEB_SEARCH_ANTHROPIC_KEY, 'sk-draws');
  const server = serve(env, cf.fetcher).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const ok = await call(server, key);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.content[0].text, 'hi');
    assert.equal((await call(server, 'JPF1.ci-draw-000000000000.wrong')).status, 401);
    const {port} = server.address(), seen = await (await fetch(`http://127.0.0.1:${port}/__report`)).json();
    assert.equal(seen.calls, 1);
    assert.ok(seen.usd > 0);
    assert.deepEqual(seen.refused, {401: 1});
    assert.equal(cf.urls.length, 1);
  } finally { server.close(); }
});

test('the per-install day line stops the draw as it stops a user', async () => {
  const cf = fakeCloudflare(), {env, key} = await setup(SECRETS, cf.fetcher);
  env.FREE_AI_INSTALL_DAY_USD = '0.000001';
  const server = serve(env, cf.fetcher).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    assert.equal((await call(server, key)).status, 200);
    assert.equal((await call(server, key)).status, 429);
    assert.deepEqual(report(env, {429: 1}).calls, 1);
  } finally { server.close(); }
});

test('Workers AI errors come back as the binding throws them', async () => {
  const ai = restAi('acct', 't', async () => Response.json({success: false, errors: [{code: 4006, message: 'you have used up your daily free allocation'}]}, {status: 429}));
  await assert.rejects(ai.run('@cf/x', {}), /4006 you have used up your daily free allocation/);
});

test('a Free AI draw row takes its dollars and refusals from the relay, not the engine\'s Haiku prices', async () => {
  const {rowFromDraw, FUNNEL} = await import('../../admin/search-lab-draws.js');
  const info = {seed: '2026-10-27', kind: 'trades', city: 'Lisbon', country: 'Portugal', engine: 'free', free_ai: {usd: 0.21, calls: 140, refused: {429: 3, 502: 1}}};
  const row = rowFromDraw(info, [{in_places: 50, fit70_in_places: 2, crashes: [], funnel: {ai_usd: 0.9, looked: 400}}], {build: null});
  assert.equal(row.ai_usd, 0.21);
  assert.equal(row.funnel.ai_refused, 4);
  assert.ok(FUNNEL.includes('ai_refused'));
  assert.equal(rowFromDraw({...info, engine: 'api', free_ai: undefined}, [{crashes: [], funnel: {ai_usd: 0.9}}], {build: null}).ai_usd, 0.9);
});

test('the workflow alternates engines and runs a free draw through the local relay, keeping its meter even when the search fails', async () => {
  const {readFileSync} = await import('node:fs');
  const yml = readFileSync(new URL('../../.github/workflows/random-draw.yml', import.meta.url), 'utf8');
  assert.match(yml, /engines="\$\{ENGINE_INPUT:-api,free\}"/);
  assert.match(yml, /HAS_FREE_AI: \$\{\{ secrets\.RANDOM_DRAWS_CF_AI_TOKEN != '' && secrets\.RANDOM_DRAWS_CF_ACCOUNT_ID != '' \}\}/);
  assert.match(yml, /"\$HAS_FREE_AI" != true[^\n]*Free AI: no token[^\n]*engines=api/, 'no token: one clear line and the API engine, never a red draw');
  assert.match(yml, /free-ai-local\.mjs 8787/);
  assert.match(yml, /JOB_PILOTTO_E2E=1 JOB_PILOTTO_E2E_AI_BASE_URL=http:\/\/127\.0\.0\.1:8787\/api\/ai/);
  assert.match(yml, /\|\| status=\$\?[\s\S]*__report[\s\S]*draw\.free_ai=[\s\S]*exit "\$status"/);
});

test('a hand-started draw never cancels another one waiting: only scheduled draws share a queue', async () => {
  const {readFileSync} = await import('node:fs');
  const yml = readFileSync(new URL('../../.github/workflows/random-draw.yml', import.meta.url), 'utf8');
  assert.match(yml, /group: random-draw-\$\{\{ github\.event_name == 'schedule' && 'schedule' \|\| github\.run_id \}\}/);
});
