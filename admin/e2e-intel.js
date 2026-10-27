// Where our e2e fixing time goes (owner, 18 Oct 2026). CI (e2e-intel.yml, after each release/beta run and hourly) sends every finished run and its red suites (PUT /e2e/data, Bearer SELFHEAL_PUBLISH_KEY);
// causes are decided by jobs/e2e-intel.mjs from facts (admin/e2e-causes.js). A red whose cause is still "open" or "unknown" is read again and rewritten when its fix lands. The site keeps one row per run and
// per red suite, and ONE snapshot row (e2e_snapshot) with the last 30 days; the page reads that row only (D1 free plan). No AI, no logs, no personal data. Guard: test/admin/e2e-intel.test.js.
import {equal} from '../shared/guard.js';
import {CAUSE_IDS, RULES_VERSION} from './e2e-causes.js';
import {cleanNight} from './e2e-quality.js';

const DAY = 86400000, KEEP_DAYS = 30, LATEST = 25;
const dayOf = date => date.toISOString().slice(0, 10);
const authorized = (request, env) => Boolean(env.SELFHEAL_PUBLISH_KEY && equal((request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''), env.SELFHEAL_PUBLISH_KEY));
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
const num = value => (Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value) * 10) / 10) : 0);
const word = (value, max = 40) => String(value ?? '').replace(/[^\w .+-]/g, '').slice(0, max);

const cleanRun = run => Number.isInteger(run?.runId) && run.runId > 0 && /^\d{4}-\d{2}-\d{2}T/.test(run.createdAt || '') && ['success', 'failure', 'cancelled'].includes(run.conclusion);
const cleanFail = fail => Number.isInteger(fail?.runId) && fail.runId > 0 && word(fail.suite) && ['mac', 'windows'].includes(fail.platform) && CAUSE_IDS.includes(fail.cause) && /^\d{4}-\d{2}-\d{2}$/.test(fail.day || '');

// The last 30 days: per day the runs, reds, greens and the minutes red runs took; per day, suite, platform and cause the red suites. Read once per write, never per page load.
export async function buildSnapshot(db, now = new Date()) {
  const from = dayOf(new Date(now.getTime() - (KEEP_DAYS - 1) * DAY));
  const [{results: days = []}, {results: fails = []}, {results: latest = []}] = await Promise.all([
    db.prepare(`SELECT day, SUM(conclusion IN ('success', 'failure')) AS runs, SUM(conclusion = 'cancelled') AS cancelled, SUM(conclusion = 'failure') AS reds, SUM(conclusion = 'success') AS greens, SUM(CASE WHEN conclusion = 'failure' THEN minutes ELSE 0 END) AS redMin, kind FROM e2e_runs WHERE day >= ? GROUP BY day ORDER BY day`).bind(from).all(),
    db.prepare('SELECT day, suite, platform, cause, COUNT(*) AS n, SUM(minutes) AS min FROM e2e_fails WHERE day >= ? GROUP BY day, suite, platform, cause').bind(from).all(),
    db.prepare('SELECT run_id AS runId, day, kind, conclusion, minutes FROM e2e_runs ORDER BY run_id DESC LIMIT ?').bind(LATEST).all()]);
  // The live quality nights (admin/e2e-quality.js), newest first: the page's rate needs the last 90 pairs, about 10 nights; 30 days keep enough.
  const {results: quality = []} = await db.prepare(`SELECT run_id AS runId, day, pairs, within8, over20, facts_exact AS factsExact, facts_total AS factsTotal, judged, invented
    FROM e2e_quality WHERE day >= ? ORDER BY run_id DESC`).bind(from).all();
  return {schema: 1, rules: RULES_VERSION, at: now.toISOString(), days: days.map(row => ({day: row.day, runs: row.runs, cancelled: row.cancelled, reds: row.reds, greens: row.greens, redMin: row.redMin})), fails: fails.map(row => ({...row})), latest: latest.map(row => ({...row})), quality: quality.map(row => ({...row}))};
}

// PUT {rules, runs: [{runId, createdAt, kind, conclusion, minutes}], fails: [{runId, suite, platform, day, cause, minutes}], quality?: [{runId, day, pairs, ...}]}.
// GET ?v=N: {have: runs stored at rules N or newer, pending: runs with a red still "open" or "unknown"} (CI reads the rest, and the pending ones again).
export async function ingest(request, env, now = new Date()) {
  if (!authorized(request, env)) return new Response('Not found', {status: 404});
  if (request.method === 'GET') {
    const version = Number(new URL(request.url).searchParams.get('v')) || 0, since = dayOf(new Date(now.getTime() - 35 * DAY));
    const [{results: have = []}, {results: pending = []}] = await Promise.all([
      env.STATS.prepare('SELECT run_id FROM e2e_runs WHERE day >= ? AND rules >= ?').bind(since, version).all(),
      env.STATS.prepare(`SELECT DISTINCT run_id FROM e2e_fails WHERE day >= ? AND cause IN ('open', 'unknown')`).bind(since).all()]);
    const waiting = new Set(pending.map(row => row.run_id));
    const {results: nights = []} = await env.STATS.prepare('SELECT run_id FROM e2e_quality WHERE day >= ?').bind(since).all();
    return json({have: have.map(row => row.run_id).filter(id => !waiting.has(id)), pending: [...waiting], quality: nights.map(row => row.run_id)});
  }
  if (request.method !== 'PUT') return new Response('Not found', {status: 404});
  const text = await request.text();
  if (text.length > 400000) return new Response('Too large', {status: 413});
  let data;
  try { data = JSON.parse(text); } catch { return new Response('Not JSON', {status: 400}); }
  if (!Array.isArray(data?.runs) || !Array.isArray(data?.fails) || data.runs.length > 500 || data.fails.length > 1500) return new Response('Unexpected shape', {status: 400});
  const nights = (Array.isArray(data.quality) ? data.quality.slice(0, 200) : []).map(cleanNight).filter(Boolean);
  const rules = Math.max(1, Number(data.rules) || 1), runs = data.runs.filter(cleanRun), fails = data.fails.filter(cleanFail);
  const writeRun = env.STATS.prepare('INSERT INTO e2e_runs (run_id, day, kind, conclusion, minutes, rules) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(run_id) DO UPDATE SET rules = excluded.rules WHERE excluded.rules > e2e_runs.rules');
  const writeFail = env.STATS.prepare(`INSERT INTO e2e_fails (run_id, suite, platform, day, cause, minutes, rules) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id, suite, platform) DO UPDATE SET cause = excluded.cause, minutes = excluded.minutes, rules = excluded.rules WHERE e2e_fails.cause IN ('open', 'unknown') OR excluded.rules > e2e_fails.rules`);
  const batch = [...runs.map(run => writeRun.bind(run.runId, run.createdAt.slice(0, 10), word(run.kind, 20) || 'beta', run.conclusion, num(run.minutes), rules)),
    ...fails.map(fail => writeFail.bind(fail.runId, word(fail.suite), fail.platform, fail.day, fail.cause, num(fail.minutes), rules)),
    ...nights.map(night => env.STATS.prepare(`INSERT INTO e2e_quality (run_id, day, pairs, within8, over20, facts_exact, facts_total, judged, invented) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO NOTHING`).bind(night.runId, night.day, night.pairs, night.within8, night.over20, night.factsExact, night.factsTotal, night.judged, night.invented))];
  if (batch.length) await env.STATS.batch(batch);
  const snapshot = await buildSnapshot(env.STATS, now);
  await env.STATS.prepare('INSERT INTO e2e_snapshot (id, at, body) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET at = excluded.at, body = excluded.body').bind(snapshot.at, JSON.stringify(snapshot)).run();
  return json({ok: true, stored: runs.length + fails.length + nights.length, ignored: data.runs.length + data.fails.length - runs.length - fails.length});
}
