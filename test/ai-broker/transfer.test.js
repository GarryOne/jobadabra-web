// Guards the one-time move of the broker's Durable Object from the Worker jobadabra-codex-broker to jobadabra-ai-broker (workers/ai-broker/transfer/README.md).
// Why (1 Nov 2026, owner: rename the Worker too): a wrong config in this sequence creates an EMPTY namespace and the Codex login is lost (seen on the throwaway proof). These tests keep the four configs agreeing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => JSON.parse(readFileSync(new URL(`../../workers/ai-broker/${path}`, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
const final = read('wrangler.jsonc'), expect = read('transfer/expect.jsonc'), commit = read('transfer/commit.jsonc');
const source = readFileSync(new URL('../../workers/ai-broker/worker.js', import.meta.url), 'utf8');
const alias = readFileSync(new URL('../../workers/ai-broker/transfer/alias.js', import.meta.url), 'utf8');

test('the four configs name the same two Workers, the same class and the same container application', () => {
  assert.equal(final.name, 'jobadabra-ai-broker');
  assert.equal(expect.name, final.name);
  assert.equal(expect.exports.CodexBroker.transfer_from, commit.name);
  assert.equal(commit.exports.CodexBroker.transferred_to, final.name);
  assert.equal(commit.name, 'jobadabra-codex-broker');   // the old address keeps answering through the forwarder
  assert.deepEqual(Object.keys(final.exports), ['CodexBroker']);   // the class name must be the same on both sides of a transfer
  assert.match(source, /export class CodexBroker extends Container/);
  assert.equal(final.durable_objects.bindings[0].class_name, 'CodexBroker');
});

test('the destination declares the container before the transfer and keeps its application name in the final config', () => {
  assert.equal(expect.exports.CodexBroker.state, 'expecting-transfer');
  assert.equal(expect.exports.CodexBroker.container, 'ai-broker');   // without it Cloudflare refuses: "container-enabled on source but the receiving entry declares no container"
  assert.equal(expect.containers[0].name, 'ai-broker');
  assert.equal(final.exports.CodexBroker.container, 'ai-broker');
  assert.equal(final.containers[0].name, 'ai-broker');
  assert.equal(final.containers[0].class_name, undefined);   // exports names the container; class_name beside it is the legacy form
  assert.equal(final.migrations, undefined);   // migrations and exports are mutually exclusive
  assert.equal(expect.durable_objects, undefined);   // no binding until the transfer committed (Cloudflare docs)
});

test('the old Worker commits the transfer without a container or a binding, and forwards to the new one', () => {
  assert.equal(commit.exports.CodexBroker.state, 'transferred');
  assert.equal(commit.containers, undefined);
  assert.equal(commit.durable_objects, undefined);
  assert.deepEqual(commit.services, [{binding: 'AI_BROKER', service: final.name}]);
  assert.match(alias, /export class CodexBroker extends DurableObject/);
  assert.match(alias, /env\.AI_BROKER\.fetch\(request\)/);
});

test('the forwarder passes the request, run token included, untouched', async () => {
  const {default: forwarder} = await import(`data:text/javascript,${encodeURIComponent(alias.replace("import {DurableObject} from 'cloudflare:workers';", 'class DurableObject {}'))}`);
  const seen = [];
  const request = new Request('https://old/call', {method: 'POST', headers: {authorization: 'Bearer fixture'}, body: '{}'});
  const answer = await forwarder.fetch(request, {AI_BROKER: {fetch: async req => { seen.push(req); return new Response('forwarded', {status: 201}); }}});
  assert.equal(answer.status, 201);
  assert.equal(seen[0], request);
});

test('both audiences are the default and in the config, and the workflow cannot run before the transfer', () => {
  assert.equal(final.vars.AUDIENCE, 'jobadabra-ai-broker,jobadabra-codex-broker');
  assert.match(source, /'jobadabra-ai-broker,jobadabra-codex-broker'/);
  const workflow = readFileSync(new URL('../../.github/workflows/release-ai-broker.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(workflow, /^\s*push:/m);   // a push trigger would deploy the new Worker name with an empty namespace
  assert.match(workflow, /"state":"ready"/);
});

test('run tokens of the repos under both owners are accepted while they move to the jobadabra org (1 Nov 2026)', () => {
  const four = ['GarryOne/jobadabra', 'GarryOne/jobadabra-web', 'jobadabra/jobadabra', 'jobadabra/jobadabra-web'];
  for (const config of [final, expect]) assert.deepEqual(config.vars.REPOSITORY.split(','), four);
  assert.match(source, /env\.REPOSITORY \|\| 'GarryOne\/jobadabra,GarryOne\/jobadabra-web,jobadabra\/jobadabra,jobadabra\/jobadabra-web'/);
});
