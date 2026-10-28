// The Codex broker (spec docs/superpowers/specs/2026-10-28-ci-on-codex-subscription-design.md in the public repo): every CI, scheduled and benchmark AI call runs here on the owner's one ChatGPT/Codex login.
// A job proves itself with GitHub's per-run OIDC token (lib/oidc.mjs); the login lives only in this Durable Object's storage and is written through after every call, before the reply is sent.
// No paid fallback: over budget, login lost or container down are said as a reason (429/503), and the job replays or goes grey.
import {Container, getContainer} from '@cloudflare/containers';
import {verifyRunToken, githubJwks} from './lib/oidc.mjs';
import {laneOf} from './lib/lanes.mjs';
import {allow, newMeter, record} from './lib/budget.mjs';
import {refuseReply} from './lib/guard.mjs';
import {slots} from './lib/queue.mjs';

export {ContainerProxy} from '@cloudflare/containers';   // required by the outbound host list below: without it every start fails with "ctx.exports.ContainerProxy is undefined" (28 Oct 2026)

const PARALLEL = 4;  // PR 0 (28 Oct 2026): 4 at once, 60 of 60 answered
const OPENAI_HOSTS = ['chatgpt.com', 'auth.openai.com', 'api.openai.com'];   // the only hosts the container may reach (the reply is the only way out)
const pass = req => fetch(req);
const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});

export class CodexBroker extends Container {
  defaultPort = 8080;
  sleepAfter = '10m';
  enableInternet = false;
  static outboundByHost = Object.fromEntries(OPENAI_HOSTS.map(h => [h, pass]));
  gate = slots(PARALLEL);
  limits = null;   // the last whole-week reading from Codex: {usedPercent, resetsAt}

  // Start (and every restart after a sleep): put the stored login back into CODEX_HOME.
  async onStart() {
    const login = await this.ctx.storage.get('login');
    if (login) await this.containerFetch('http://c/auth', {method: 'POST', body: login});
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/login' && request.method === 'POST') return this.setLogin(await request.text());
    if (url.pathname === '/health') return this.health();
    if (url.pathname === '/call' && request.method === 'POST') return this.call(request.headers.get('x-lane'), await request.json());
    if (url.pathname === '/stop' && request.method === 'POST') { await this.stop(); return json(200, {stopped: true}); }   // the owner's kill test (admin route in front)
    return json(404, {error: 'not found'});
  }

  // The owner's one-time upload. Refused once a login is stored unless it is the first one after "login-lost" cleared it.
  async setLogin(text) {
    if (await this.ctx.storage.get('login')) return json(409, {error: 'a login is already stored; DELETE it first (login-lost clears it)'});
    try { if (!JSON.parse(text).tokens) throw new Error(); } catch { return json(400, {error: 'not a Codex auth.json'}); }
    await this.ctx.storage.put('login', text);
    await this.containerFetch('http://c/auth', {method: 'POST', body: text});
    return json(200, {ok: true});
  }

  async health() {
    const meter = (await this.ctx.storage.get('meter')) || newMeter(0);
    return json(200, {state: (await this.ctx.storage.get('login')) ? ((await this.ctx.storage.get('lost')) ? 'login-lost' : 'ready') : 'no-login', limits: this.limits, own: meter.tokens, queue: this.gate.stats()});
  }

  async call(lane, body) {
    if (!(await this.ctx.storage.get('login'))) return json(503, {why: 'no-login'});
    if (await this.ctx.storage.get('lost')) return json(503, {why: 'login-lost'});
    const meter = (await this.ctx.storage.get('meter')) || newMeter(0);
    const verdict = allow(lane, meter, this.limits?.usedPercent ?? null);
    if (!verdict.ok) return json(429, {why: verdict.why});
    const release = await this.gate.acquire(lane);
    try {
      const reply = await this.containerFetch('http://c/call', {method: 'POST', body: JSON.stringify(body)});
      const text = await reply.text();
      let answer;
      try { answer = JSON.parse(text); } catch { return json(502, {why: `container: ${text.slice(0, 300)}`}); }   // the platform's own error text (not our server's JSON): say it, never crash (a 1101 hid it, 28 Oct 2026)
      if (answer.authFile) await this.ctx.storage.put('login', answer.authFile);   // write-through BEFORE the reply goes out: a rotated token is never only in the container
      if (!reply.ok) { if (answer.error === 'login-lost') await this.ctx.storage.put('lost', true); return json(reply.status === 500 && answer.error === 'login-lost' ? 503 : 502, {why: refuseReply(answer.error) ? 'codex-failed (detail withheld: token-shaped)' : answer.error}); }
      if (answer.limits) this.limits = answer.limits;
      const used = answer.tokens.input + answer.tokens.output;
      const latest = (await this.ctx.storage.get('meter')) || newMeter(0);   // read again right before the write: 4 calls overlap, and no await sits between this read and the put
      await this.ctx.storage.put('meter', record(latest, lane, used, Date.now() / 1000, answer.limits?.resetsAt));
      const refused = refuseReply(answer.reply);
      if (refused) return json(422, {why: refused});
      return json(200, {reply: answer.reply, tokens: answer.tokens, ms: answer.ms, lane, weekUsedPercent: this.limits?.usedPercent ?? null});
    } finally { release(); }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), broker = getContainer(env.BROKER);
    if (url.pathname === '/health') return broker.fetch(request);   // counts and states only, no secret
    if (url.pathname.startsWith('/admin/') && request.method === 'POST') {
      if (!env.BROKER_ADMIN_TOKEN || request.headers.get('authorization') !== `Bearer ${env.BROKER_ADMIN_TOKEN}`) return json(401, {error: 'admin only'});
      // login = the one-time upload; call = a smoke call from the owner's Mac (lane x-lane, default scheduled); stop = kill the container to prove the login survives it
      const inner = {'/admin/login': '/login', '/admin/call': '/call', '/admin/stop': '/stop'}[url.pathname];
      if (!inner) return json(404, {error: 'not found'});
      return broker.fetch(new Request(`http://c${inner}`, {method: 'POST', body: await request.text(), headers: {'x-lane': request.headers.get('x-lane') || 'scheduled'}}));
    }
    if (url.pathname === '/call' && request.method === 'POST') {
      let claims;
      try { claims = await verifyRunToken((request.headers.get('authorization') || '').replace(/^Bearer /, ''), {jwks: jwks(env), audience: env.AUDIENCE || 'jobadabra-codex-broker', repository: env.REPOSITORY || 'GarryOne/jobadabra'}); }
      catch (e) { return json(401, {why: String(e.message)}); }
      return broker.fetch(new Request('http://c/call', {method: 'POST', body: await request.text(), headers: {'x-lane': laneOf(claims)}}));
    }
    return json(404, {error: 'not found'});
  },
};

let jwksReader;
const jwks = () => (jwksReader ||= githubJwks());
