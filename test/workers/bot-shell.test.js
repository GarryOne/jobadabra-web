// The bot Worker's deploy shell (workers/bot): the same Worker, schedule and secret check it had in the public repo's worker/, and no second live deployer until the switch.
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {test} from 'node:test';
import {missing, REQUIRED} from '../../workers/bot/scripts/check-secrets.mjs';

const toml = readFileSync(new URL('../../workers/bot/wrangler.toml', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../.github/workflows/release-bot-worker.yml', import.meta.url), 'utf8');

test('the shell is the same Worker with the same schedules', () => {
  assert.match(toml, /^name = "sre-job-pilotto-bot"$/m, 'the name is the Worker the bot webhook and the secrets are bound to');
  assert.match(toml, /^crons = \["0 0,1,2,3 \* \* \*", "47 21,23,1 \* \* \*", "\*\/10 \* \* \* \*"\]$/m, 'the night build, the three e2e starts and the 10-minute sweep (app-core/src/scheduler.js)');
  assert.match(toml, /^GITHUB_REPO = "GarryOne\/jobadabra"$/m);
});

test('the code it bundles is the public repo\'s app-core, laid at the root of the joined tree', () => {
  const main = /^main = "\.\.\/\.\.\/(app-core\/src\/index\.js)"$/m.exec(toml)?.[1];
  assert.ok(main, 'main points two folders up, into the public tree');
  assert.ok(existsSync(new URL(`../../${main}`, import.meta.url)), `${main} is in the joined tree`);
});

test('the schedules\' secrets are named when missing', () => {   // moved from the public repo's app-core/test/check-secrets.test.js
  assert.deepEqual(missing([]), Object.keys(REQUIRED));
  assert.deepEqual(missing(['GITHUB_TOKEN', 'TELEGRAM_BOT_TOKEN', 'OWNER_CHAT_ID', 'OTHER']), []);
  assert.deepEqual(missing(['TELEGRAM_BOT_TOKEN', 'OWNER_CHAT_ID']), ['GITHUB_TOKEN']);
});

test('the deploy runs by hand only until the switch PR (4/6): the public worker.yml is still the one deployer', () => {
  const on = /^on:\n((?:  .*\n)+)/m.exec(workflow)?.[1] ?? '';
  assert.equal(on.trim(), 'workflow_dispatch:', 'no push, schedule or watch trigger yet: two live deployers of one Worker race');
  assert.match(workflow, /name: Deploy to Cloudflare[\s\S]*working-directory: workers\/bot[\s\S]*cf-retry\.sh npm run deploy/);
});
