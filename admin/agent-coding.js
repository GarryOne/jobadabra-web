// /admin/agents/agent-coding: how our agent codes, ships and verifies (owner, 1 Nov 2026: "the way our agent is coding, is shipping and is verifying"). Report only: it never blocks anything.
// Two uploads feed it, both PUT to /agent-coding/data with Bearer SELFHEAL_PUBLISH_KEY like the PR checks scorecard: kind "gate" (counts and seconds of the push gate, from the owner's Mac:
// tools/gate-stats-upload.mjs, once a day from ship.sh) and kind "ci" (reds, fixes, areas and CI minutes, from GitHub: agent-coding-stats.yml). One row per kind and day; a repeat replaces it.
// Only counts, seconds and short fixed labels are stored: never a branch, a path, commit text or a log. Guard: test/admin/agent-coding.test.js. Page drawing: admin/agent-coding-page.js.
import {equal} from '../shared/guard.js';
import {viewer, remember} from '../shared/auth.js';
import {page} from './agent-coding-page.js';

const authorized = (request, env) => Boolean(env.SELFHEAL_PUBLISH_KEY && equal((request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''), env.SELFHEAL_PUBLISH_KEY));
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
const count = value => Math.min(1e7, Math.max(0, Math.round(Number(value) || 0)));
const minutes = value => Math.min(1e5, Math.max(0, Math.round((Number(value) || 0) * 10) / 10));
const label = value => String(value ?? '').replace(/[^A-Za-z0-9 ()·./,+:_-]/g, '').trim().slice(0, 60);
const CLASSES = ['form', 'real', 'other'], FIXES = ['product', 'test', 'ci', 'form', 'nofix'];
const tally = (source, keys) => Object.fromEntries(keys.map(key => [key, count(source?.[key])]));
const list = (value, cap) => (Array.isArray(value) ? value.slice(0, cap).map(minutes) : []);

// One day of the push gate (from the Mac) -> the same shape with every number clamped, or null.
export function cleanGate(card) {
  if (!card || typeof card !== 'object') return null;
  const steps = Object.entries(card.steps && typeof card.steps === 'object' ? card.steps : {}).slice(0, 80).map(([name, step]) => [label(name), {runs: count(step?.runs), fails: count(step?.fails),
    secs: count(step?.secs), cls: CLASSES.includes(step?.cls) ? step.cls : 'other'}]).filter(([name]) => name);
  return {pushes: count(card.pushes), secs: count(card.secs), stopped: tally(card.stopped, CLASSES), stoppedSecs: tally(card.stoppedSecs, CLASSES), steps: Object.fromEntries(steps)};
}
// One day from GitHub (reds by what fixed them, fix PRs per area, CI minutes per push) -> clamped, or null.
export function cleanCi(card) {
  if (!card || typeof card !== 'object') return null;
  const areas = Object.entries(card.fixPrs && typeof card.fixPrs === 'object' ? card.fixPrs : {}).slice(0, 60).map(([name, n]) => [label(name), count(n)]).filter(([name, n]) => name && n);
  return {prs: {merged: count(card.prs?.merged), ci: count(card.prs?.ci)}, reds: tally(card.reds, FIXES), fixPrs: Object.fromEntries(areas),
    wall: list(card.wall, 500), queue: list(card.queue, 500), cancelledMin: minutes(card.cancelledMin)};
}
const CLEAN = {gate: cleanGate, ci: cleanCi};
const DAY = /^\d{4}-\d\d-\d\d$/;

export async function ingest(request, env, now = new Date()) {
  if (!authorized(request, env) || request.method !== 'PUT') return new Response('Not found', {status: 404});
  const body = await request.text();
  if (body.length > 400000) return new Response('Too large', {status: 413});
  let data;
  try { data = JSON.parse(body); } catch { return new Response('Not JSON', {status: 400}); }
  const clean = CLEAN[data?.kind];
  if (!clean || !Array.isArray(data.days) || !data.days.length || data.days.length > 60) return new Response('Unexpected shape', {status: 400});
  const rows = data.days.map(item => ({day: String(item?.day ?? ''), card: clean(item)}));
  if (rows.some(row => !DAY.test(row.day) || !row.card)) return new Response('Unexpected shape', {status: 400});
  for (const row of rows) {
    await env.STATS.prepare(`INSERT INTO agent_coding_days (kind, day, card, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(kind, day) DO UPDATE SET card = excluded.card, updated_at = excluded.updated_at`)
      .bind(data.kind, row.day, JSON.stringify(row.card), now.toISOString()).run();
  }
  return json({ok: true, days: rows.length});
}

export async function view(request, env, now = new Date()) {
  if (!await viewer(request, env)) return new Response('Not found', {status: 404});
  const url = new URL(request.url);
  if (url.searchParams.has('key')) return remember(url, env, request);
  const since = new Date(now.getTime() - 63 * 86400000).toISOString().slice(0, 10);
  let rows = [];
  try { rows = env.STATS ? (await env.STATS.prepare('SELECT kind, day, card, updated_at FROM agent_coding_days WHERE day >= ? ORDER BY day').bind(since).all()).results || [] : []; } catch { rows = []; }
  return new Response(page(rows, now), {headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex'}});
}
