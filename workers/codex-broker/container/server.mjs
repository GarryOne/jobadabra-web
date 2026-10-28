// Runs inside the broker's container: one `codex exec` per call (shell tool off, empty temp dir), plus the Codex week's rate limit. The login arrives from the Durable Object and goes back with each reply.
// Why (28 Oct 2026, spec ci-on-codex-subscription-design): the container's disk is wiped on sleep, so the login lives in the Durable Object; this server only holds it in CODEX_HOME while it runs.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';

const HOME = process.env.CODEX_HOME, AUTH = path.join(HOME, 'auth.json');
const CALL_TIMEOUT_MS = 150000;
fs.mkdirSync(HOME, {recursive: true});   // codex exits 1 ("Error finding codex home") when this folder is missing, e.g. a call before the login arrives (found locally, 28 Oct 2026)
const readAuth =() => (fs.existsSync(AUTH) ? fs.readFileSync(AUTH, 'utf8') : '');

function run(args, cwd) {
  return new Promise(resolve => {
    const child = spawn('codex', args, {cwd, stdio: ['ignore', 'pipe', 'pipe'], env: {PATH: process.env.PATH, HOME: process.env.HOME, CODEX_HOME: HOME}});   // stdin ignored: codex exec waits on stdin otherwise (measured 28 Oct)
    let out = '', err = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), CALL_TIMEOUT_MS);
    child.on('close', code => { clearTimeout(timer); resolve({code, out, err}); });
  });
}

// The Codex week figure, read the way PR 0 did: the app-server's account/rateLimits/read. -> {usedPercent, resetsAt} or null.
function readLimits() {
  return new Promise(resolve => {
    const child = spawn('codex', ['app-server'], {stdio: ['pipe', 'pipe', 'ignore'], env: {PATH: process.env.PATH, HOME: process.env.HOME, CODEX_HOME: HOME}});
    const done = v => { clearTimeout(timer); child.kill(); resolve(v); };
    const timer = setTimeout(() => done(null), 20000);
    const send = m => child.stdin.write(`${JSON.stringify(m)}\n`);
    let buf = '';
    child.stdout.on('data', d => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.id === 1) { send({method: 'initialized'}); send({id: 2, method: 'account/rateLimits/read'}); }
        if (m.id === 2) { const p = m.result?.rateLimits?.primary; done(p ? {usedPercent: p.usedPercent, resetsAt: p.resetsAt} : null); }
      }
    });
    send({id: 1, method: 'initialize', params: {clientInfo: {name: 'codex-broker', title: 'codex-broker', version: '1'}}});
  });
}

// One call: {prompt, schema?, images?: [{name, base64}]} -> {reply, tokens: {input, output}, ms}. Throws Error with a reason word on a failed codex run.
async function call({prompt, schema, images = []}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'call-'));
  try {
    const args = ['exec', '--skip-git-repo-check', '--ignore-user-config', '--ephemeral', '-s', 'read-only', '--disable', 'shell_tool', '--json', '-o', 'out.txt'];
    if (schema) { fs.writeFileSync(path.join(dir, 'schema.json'), JSON.stringify(schema)); args.push('--output-schema', 'schema.json'); }
    for (const [i, img] of images.entries()) { const name = `img${i}${path.extname(String(img.name || '.png')).replace(/[^.\w]/g, '')}`; fs.writeFileSync(path.join(dir, name), Buffer.from(img.base64, 'base64')); args.push('-i', name); }
    args.push('--', String(prompt));   // -i takes several values and would swallow the prompt as another image ("No prompt provided via stdin", 28 Oct 2026)
    const started = Date.now();
    const {code, out, err} = await run(args, dir);
    const reply = fs.existsSync(path.join(dir, 'out.txt')) ? fs.readFileSync(path.join(dir, 'out.txt'), 'utf8') : '';
    if (code !== 0 || !reply) throw new Error(/401 Unauthorized|please log in|not logged in|token (is )?(expired|invalid|revoked)|refresh token/i.test(err) ? 'login-lost' : `codex-failed:${code} ${(err || out).replace(/\s+/g, ' ').slice(-300)}`);   // the worker refuses a token-shaped tail (lib/guard.mjs)
    const usage = [...out.matchAll(/"usage":(\{[^}]*\})/g)].map(m => JSON.parse(m[1])).pop() || {};
    return {reply, tokens: {input: usage.input_tokens || 0, output: usage.output_tokens || 0}, ms: Date.now() - started};
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}

http.createServer((req, res) => {
  const chunks = []; let size = 0;
  req.on('data', c => { size += c.length; if (size > 30e6) req.destroy(); else chunks.push(c); });
  req.on('end', async () => {
    const reply = (status, body) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
    try {
      if (req.url === '/auth' && req.method === 'POST') { fs.mkdirSync(HOME, {recursive: true}); fs.writeFileSync(AUTH, Buffer.concat(chunks), {mode: 0o600}); return reply(200, {ok: true}); }
      if (req.url === '/call' && req.method === 'POST') {
        const result = await call(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        const limits = await readLimits();
        return reply(200, {...result, limits, authFile: readAuth()});   // authFile goes to the Durable Object only, never to the caller (worker.js strips it)
      }
      if (req.url === '/health') return reply(200, {hasLogin: !!readAuth(), limits: readAuth() ? await readLimits() : null});
      return reply(404, {error: 'not found'});
    } catch (e) { return reply(500, {error: String(e.message || e).slice(0, 200), authFile: readAuth()}); }
  });
}).listen(8080);
