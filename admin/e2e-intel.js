// Where our e2e reds come from (owner, 18 Oct 2026; every run kind and a cause for every red, 27 Oct 2026). CI (e2e-intel.yml, hourly) sends every finished e2e run and its
// red suites (PUT /e2e/data, Bearer SELFHEAL_PUBLISH_KEY); causes are decided by jobs/e2e-intel.mjs (admin/e2e-causes.js). A red whose cause is still "open" or "unknown" is read
// again and rewritten when its fix lands. The site keeps one row per run and per red suite, and ONE snapshot row (e2e_snapshot) with the last 30 days; the page reads that row only
// (D1 free plan). Stored per red: the failing step's own line (test words, no personal data), never a log. Guard: test/admin/e2e-intel.test.js.
import {equal} from '../shared/guard.js';
import {CAUSE_IDS, RULES_VERSION} from './e2e-causes.js';
import {cleanNight} from './e2e-quality.js';
import {WORK_IDS} from './e2e-work.js';
import {greyData} from './e2e-grey.js';

const DAY = 86400000, KEEP_DAYS = 30, LATEST = 25;
export const KINDS = ['beta', 'nightly', 'after-merge', 'scheduled', 'soak', 'canary', 'pr', 'harness'];
const dayOf = date => date.toISOString().slice(0, 10);
const authorized = (request, env) => Boolean(env.SELFHEAL_PUBLISH_KEY && equal((request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''), env.SELFHEAL_PUBLISH_KEY));
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
const num = value => (Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value) * 10) / 10) : 0);
const word = (value, max = 40) => String(value ?? '').replace(/[^\w .+-]/g, '').slice(0, max);
const text = (value, max = 220) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
const kindOf = value => (KINDS.includes(value) ? value : 'beta');
const prOf = value => (Number.isInteger(value) && value > 0 ? value : null);

const cleanRun = run => Number.isInteger(run?.runId) && run.runId > 0 && /^\d{4}-\d{2}-\d{2}T/.test(run.createdAt || '') && ['success', 'failure', 'cancelled'].includes(run.conclusion);
const cleanFail = fail => Number.isInteger(fail?.runId) && fail.runId > 0 && word(fail.suite) && ['mac', 'windows'].includes(fail.platform) && CAUSE_IDS.includes(fail.cause) && /^\d{4}-\d{2}-\d{2}$/.test(fail.day || '');
const isDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value || ''), count = value => Number.isInteger(value) && value >= 0 && value < 100000;
const cleanWork = row => isDay(row?.day) && WORK_IDS.includes(row.kind) && count(row.commits);
const cleanWorkFile = row => isDay(row?.week) && /^[\w./-]{1,160}$/.test(row.file || '') && count(row.commits);

// The last 30 days: per day and run kind the runs, reds, greens and minutes (red runs, waiting for a runner, running); per day, kind, suite, platform and cause the red suites;
// Registry and suite observations are merged from the previous snapshot; no extra tables.
// the breaks (one run's reds with the same cause and failure line: one CI break copied onto 32 suites is one break); the PR reds that caught a bug. Read once per write.
export async function buildSnapshot(db, now = new Date(), data = {}) {
  const from = dayOf(new Date(now.getTime() - (KEEP_DAYS - 1) * DAY));
  const [{results: days = []}, {results: fails = []}, {results: breaks = []}, {results: caught = []}, {results: latest = []}] = await Promise.all([
    db.prepare(`SELECT day, kind, SUM(conclusion IN ('success', 'failure')) AS runs, SUM(conclusion = 'cancelled') AS cancelled, SUM(conclusion = 'failure') AS reds, SUM(conclusion = 'success') AS greens,
      SUM(CASE WHEN conclusion = 'failure' THEN minutes ELSE 0 END) AS redMin, SUM(queue_min) AS queueMin, SUM(run_min) AS runMin, COUNT(DISTINCT pr) AS prs FROM e2e_runs WHERE day >= ? GROUP BY day, kind ORDER BY day`).bind(from).all(),
    db.prepare('SELECT day, kind, suite, platform, cause, COUNT(*) AS n, SUM(minutes) AS min FROM e2e_fails WHERE day >= ? GROUP BY day, kind, suite, platform, cause').bind(from).all(),
    db.prepare('SELECT MIN(day) AS day, MIN(kind) AS kind, run_id AS runId, cause, line, COUNT(*) AS n FROM e2e_fails WHERE day >= ? GROUP BY run_id, cause, line ORDER BY n DESC, day DESC LIMIT 400').bind(from).all(),
    db.prepare('SELECT f.day, f.run_id AS runId, f.suite, f.line, r.pr FROM e2e_fails f LEFT JOIN e2e_runs r ON r.run_id = f.run_id WHERE f.day >= ? AND f.caught = 1 ORDER BY f.day DESC LIMIT 100').bind(from).all(),
    db.prepare('SELECT run_id AS runId, day, kind, conclusion, minutes FROM e2e_runs ORDER BY run_id DESC LIMIT ?').bind(LATEST).all()]);
  // The live quality nights (admin/e2e-quality.js), newest first: the page's rate needs the last 90 pairs, about 10 nights; 30 days keep enough.
  const {results: quality = []} = await db.prepare(`SELECT run_id AS runId, day, pairs, within8, over20, facts_exact AS factsExact, facts_total AS factsTotal, judged, invented
    FROM e2e_quality WHERE day >= ? ORDER BY run_id DESC`).bind(from).all();
  // Where e2e work goes (admin/e2e-work.js): commits per day and kind, and each week's most-changed e2e and CI files (a week that began before the window still shows).
  const [{results: work = []}, {results: workFiles = []}] = await Promise.all([
    db.prepare('SELECT day, kind, commits FROM e2e_work WHERE day >= ? ORDER BY day').bind(from).all(),
    db.prepare('SELECT week, file, commits FROM e2e_work_files WHERE week >= ? ORDER BY week DESC, commits DESC').bind(dayOf(new Date(now.getTime() - (KEEP_DAYS + 6) * DAY))).all()]);
  const previous = await db.prepare('SELECT body FROM e2e_snapshot WHERE id = 1').first();
  const grey = greyData(previous ? JSON.parse(previous.body) : {}, data, now);
  return {...grey, schema: 2, rules: RULES_VERSION, at: now.toISOString(), days: days.map(row => ({...row})), fails: fails.map(row => ({...row})), breaks: breaks.map(row => ({...row})),
    caught: caught.map(row => ({...row})), latest: latest.map(row => ({...row})), quality: quality.map(row => ({...row})), work: work.map(row => ({...row})), workFiles: workFiles.map(row => ({...row}))};
}

// PUT {rules, runs: [{runId, createdAt, kind, conclusion, minutes, queueMin, runMin, pr}], fails: [{runId, suite, platform, day, kind, cause, line, fix, minutes, caught}], quality?: [{runId, day, pairs, ...}],
//   lanes?: {suites: {name: {lane, input, since, why, returns?}}}, suiteNights?: [{runId, day, kind, suite, platform, green, rates?}], mainBands?: {suite: {metric: {lower, upper}}}, prGreys?: [{day, reason, n}],
//   work?: [{day, kind, commits}], workFiles?: [{week, file, commits}]} (admin/e2e-work.js).
// GET ?snapshot=1: the stored snapshot (the page's one row). GET ?v=N: {have: runs stored at rules N or newer, pending: runs with a red still "open" or "unknown"} (CI reads the rest, and the pending ones again).
export async function ingest(request, env, now = new Date()) {
  if (!authorized(request, env)) return new Response('Not found', {status: 404});
  if (request.method === 'GET' && new URL(request.url).searchParams.get('snapshot') === '1') {   // the weekly summary (jobs/e2e-weekly.mjs) reads the row the page draws: same numbers
    const row = await env.STATS.prepare('SELECT body FROM e2e_snapshot WHERE id = 1').first();
    return row ? new Response(row.body, {headers: {'Content-Type': 'application/json'}}) : json({error: 'no snapshot yet'}, 404);
  }
  if (request.method === 'GET') {
    const version = Number(new URL(request.url).searchParams.get('v')) || 0, since = dayOf(new Date(now.getTime() - 35 * DAY));
    const [{results: have = []}, {results: pending = []}] = await Promise.all([
      env.STATS.prepare('SELECT run_id FROM e2e_runs WHERE day >= ? AND rules >= ?').bind(since, version).all(),
      env.STATS.prepare(`SELECT DISTINCT run_id FROM e2e_fails WHERE day >= ? AND cause IN ('open', 'unknown')`).bind(since).all()]);
    const waiting = new Set(pending.map(row => row.run_id));
    const {results: nights = []} = await env.STATS.prepare('SELECT run_id FROM e2e_quality WHERE day >= ?').bind(since).all();
    const snapshot = await env.STATS.prepare('SELECT body FROM e2e_snapshot WHERE id = 1').first();
    const suiteNights = [...new Set((snapshot ? JSON.parse(snapshot.body).suiteNights || [] : []).map(row => row.runId))];
    return json({suiteNights, have: have.map(row => row.run_id).filter(id => !waiting.has(id)), pending: [...waiting], quality: nights.map(row => row.run_id)});
  }
  if (request.method !== 'PUT') return new Response('Not found', {status: 404});
  const body = await request.text();
  if (body.length > 900000) return new Response('Too large', {status: 413});
  let data;
  try { data = JSON.parse(body); } catch { return new Response('Not JSON', {status: 400}); }
  if (!Array.isArray(data?.runs) || !Array.isArray(data?.fails) || data.runs.length > 500 || data.fails.length > 3000) return new Response('Unexpected shape', {status: 400});
  const nights = (Array.isArray(data.quality) ? data.quality.slice(0, 200) : []).map(cleanNight).filter(Boolean);
  const work = (Array.isArray(data.work) ? data.work.slice(0, 600) : []).filter(cleanWork), workFiles = (Array.isArray(data.workFiles) ? data.workFiles.slice(0, 200) : []).filter(cleanWorkFile);
  const weeks = [...new Set(workFiles.map(row => row.week))];
  const rules = Math.max(1, Number(data.rules) || 1), runs = data.runs.filter(cleanRun), fails = data.fails.filter(cleanFail);
  const writeRun = env.STATS.prepare(`INSERT INTO e2e_runs (run_id, day, kind, conclusion, minutes, rules, queue_min, run_min, pr) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id) DO UPDATE SET kind = excluded.kind, minutes = excluded.minutes, rules = excluded.rules, queue_min = excluded.queue_min, run_min = excluded.run_min, pr = excluded.pr WHERE excluded.rules > e2e_runs.rules`);
  const writeFail = env.STATS.prepare(`INSERT INTO e2e_fails (run_id, suite, platform, day, cause, minutes, rules, kind, line, fix, caught) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(run_id, suite, platform) DO UPDATE SET cause = excluded.cause, minutes = excluded.minutes, rules = excluded.rules, kind = excluded.kind, line = excluded.line, fix = excluded.fix, caught = excluded.caught
    WHERE e2e_fails.cause IN ('open', 'unknown') OR excluded.rules > e2e_fails.rules`);
  const batch = [...runs.map(run => writeRun.bind(run.runId, run.createdAt.slice(0, 10), kindOf(run.kind), run.conclusion, num(run.minutes), rules, num(run.queueMin), num(run.runMin), prOf(run.pr))),
    ...fails.map(fail => writeFail.bind(fail.runId, word(fail.suite), fail.platform, fail.day, fail.cause, num(fail.minutes), rules, kindOf(fail.kind), text(fail.line), word(fail.fix, 40), fail.caught ? 1 : 0)),
    ...nights.map(night => env.STATS.prepare(`INSERT INTO e2e_quality (run_id, day, pairs, within8, over20, facts_exact, facts_total, judged, invented) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id) DO NOTHING`).bind(night.runId, night.day, night.pairs, night.within8, night.over20, night.factsExact, night.factsTotal, night.judged, night.invented)),
    // A day's counts and a week's top files are replaced as sent: the collector re-reads 35 days each hour, so a rewritten main lowers a count.
    ...work.map(row => env.STATS.prepare('INSERT INTO e2e_work (day, kind, commits) VALUES (?, ?, ?) ON CONFLICT(day, kind) DO UPDATE SET commits = excluded.commits').bind(row.day, row.kind, row.commits)),
    ...weeks.map(week => env.STATS.prepare('DELETE FROM e2e_work_files WHERE week = ?').bind(week)),
    ...workFiles.map(row => env.STATS.prepare('INSERT INTO e2e_work_files (week, file, commits) VALUES (?, ?, ?)').bind(row.week, row.file, row.commits))];

  if (batch.length) await env.STATS.batch(batch);
  const snapshot = await buildSnapshot(env.STATS, now, data);
  await env.STATS.prepare('INSERT INTO e2e_snapshot (id, at, body) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET at = excluded.at, body = excluded.body').bind(snapshot.at, JSON.stringify(snapshot)).run();
  return json({ok: true, stored: runs.length + fails.length + nights.length + work.length + workFiles.length, ignored: data.runs.length + data.fails.length - runs.length - fails.length});
}
