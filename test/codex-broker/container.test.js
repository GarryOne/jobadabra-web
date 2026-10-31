// Runs the real call server offline: no listening socket, CLI process, login or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
import {buildArgs} from '../../workers/codex-broker/lib/args.mjs';
import {weeklyWindow} from '../../workers/codex-broker/container/weekly.mjs';

test('the container passes search through to Codex and preserves ordinary replies and files', async t => {
  const tmp = new URL('../../.tmp/', import.meta.url);
  fs.mkdirSync(tmp, {recursive: true});
  const dir = fs.mkdtempSync(path.join(tmp.pathname, 'broker-test-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  let handler;
  const calls = [];
  const spawn = (binary, args, options) => {
    assert.equal(binary, 'codex');
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
    if (args[0] === 'app-server') child.stdin = {write(line) {
      const {id} = JSON.parse(line);
      if (id) queueMicrotask(() => child.stdout.emit('data', `${JSON.stringify({id, result: {rateLimits: {}}})}\n`));
    }};
    else {
      calls.push(args);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(options.cwd, 'schema.json'))), {type: 'object'});
      assert.equal(fs.readFileSync(path.join(options.cwd, 'img0.png'), 'utf8'), 'image fixture');
      fs.writeFileSync(path.join(options.cwd, 'out.txt'), 'offline reply');
      queueMicrotask(() => { child.stdout.emit('data', '{"usage":{"input_tokens":2,"output_tokens":3}}'); child.emit('close', 0); });
    }
    return child;
  };
  const source = fs.readFileSync(new URL('../../workers/codex-broker/container/server.mjs', import.meta.url), 'utf8');
  vm.runInNewContext(source.replace(/^import .*;\n/gm, ''), {
    http: {createServer(fn) { handler = fn; return {listen() {}}; }},
    fs, os: {tmpdir: () => dir}, path, spawn, buildArgs, weeklyWindow, Buffer, setTimeout, clearTimeout,
    process: {env: {CODEX_HOME: path.join(dir, 'home'), HOME: dir, PATH: ''}},
  });
  for (const option of [{}, {search: false}, {search: true}]) {
    const request = new EventEmitter(); request.url = '/call'; request.method = 'POST';
    const result = new Promise(resolve => {
      const response = {setHeader() {}, end(text) { resolve({status: this.statusCode, body: JSON.parse(text)}); }};
      handler(request, response);
    });
    request.emit('data', Buffer.from(JSON.stringify({prompt: '--prompt', model: 'gpt-6.1-sol', schema: {type: 'object'}, images: [{name: 'picture.png', base64: Buffer.from('image fixture').toString('base64')}], ...option})));
    request.emit('end');
    const {status, body} = await result;
    assert.equal(status, 200);
    assert.deepEqual(body, {reply: 'offline reply', tokens: {input: 2, output: 3}, ms: body.ms, limits: null, authFile: ''});
    assert.deepEqual(calls.at(-1), ['exec', '--skip-git-repo-check', '--ignore-user-config', '--ephemeral', '-s', 'read-only', '--disable', 'shell_tool', '--json', '-o', 'out.txt', '-m', 'gpt-6.1-sol', '--output-schema', 'schema.json', '-i', 'img0.png', ...(option.search ? ['-c', 'web_search="live"'] : []), '--', '--prompt']);
    assert.deepEqual(fs.readdirSync(dir), ['home'], 'call files are removed after every call');
  }
});

test('the image copies the server and all its local imports from its build context', () => {
  const broker = new URL('../../workers/codex-broker/', import.meta.url);
  const config = fs.readFileSync(new URL('wrangler.jsonc', broker), 'utf8');
  const context = new URL(config.match(/"image_build_context": "([^"]+)"/)[1] + '/', broker);
  const dockerfile = fs.readFileSync(new URL('container/Dockerfile', broker), 'utf8');
  const copied = new Map();
  for (const [, sources, destination] of dockerfile.matchAll(/^COPY (.+) (\S+)$/gm)) {
    for (const source of sources.split(' ')) copied.set(path.posix.join(destination, path.basename(source)), fs.readFileSync(new URL(source, context), 'utf8'));
  }
  const entry = JSON.parse(dockerfile.match(/^CMD (.+)$/m)[1])[1];
  assert.ok(copied.has(entry), 'the image contains its entrypoint');
  for (const [, ref] of copied.get(entry).matchAll(/from '(\.[^']+)'/g)) {
    assert.ok(copied.has(path.posix.join(path.posix.dirname(entry), ref)), `the image contains ${ref}`);
  }
});
