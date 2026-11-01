#!/usr/bin/env node
// Publishes the integration tests' snapshot to /admin/operations/integrations (integration-intel.yml, hourly). Reads the finished runs of the public repo's workflow
// "CI · Integration tests" (integration.yml) and each run's artifacts integration-results-<layer>[-<platform>] (jobs/integration-intel-rows.mjs says what a file holds),
// finds flaky tests, the slowest ones, and the e2e -> integration move from the public repo's folders. A run is read once: its rows stay in the stored snapshot (GET /integration/data).
//   node jobs/integration-intel.mjs [--dry [--out snapshot.json]]    needs gh with GH_TOKEN; publishing needs SELFHEAL_PUBLISH_KEY (optional INTEGRATION_INTEL_URL)
// Guard: test/admin/integration-intel-collector.test.js (the pure part) and test/jobs-read-public-repo.test.js (the repo it reads).
import {execFile, execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {LAYERS, MAX_RUNS} from '../admin/integration-intel.js';
import {advance, countsOf, grepCounts, moveRow, parseResult, runRow, slowestOf} from './integration-intel-rows.mjs';

const repo = process.env.REPO || process.env.GITHUB_REPOSITORY || 'GarryOne/jobadabra';
const base = process.env.INTEGRATION_INTEL_URL || 'https://www.jobpilotto.top/integration/data';
const WORKFLOW = 'integration.yml', KEEP_DAYS = 30, MAX_RUNS = 120;
const execAsync = promisify(execFile);
const gh = (...args) => JSON.parse(execFileSync('gh', args, {encoding: 'utf8', maxBuffer: 1 << 28}) || 'null');
const ghAsync = async (...args) => { try { return JSON.parse((await execAsync('gh', args, {maxBuffer: 1 << 28, timeout: 60000})).stdout || 'null'); } catch { return null; } };
const memo = fn => { const seen = new Map(); return (...args) => { const key = JSON.stringify(args); if (!seen.has(key)) seen.set(key, fn(...args)); return seen.get(key); }; };

/** The result files of one run: every integration-results-* artifact, parsed. A run whose artifacts expired or never uploaded returns []. */
async function readResults(runId) {
  const dir = mkdtempSync(path.join(tmpdir(), 'integration-intel-'));
  try {
    await execAsync('gh', ['run', 'download', String(runId), '--repo', repo, '--pattern', 'integration-results-*', '--dir', dir], {timeout: 120000});
    return readdirSync(dir, {recursive: true}).filter(file => file.endsWith('.json')).flatMap(file => { try { return [parseResult(JSON.parse(readFileSync(path.join(dir, file), 'utf8')))].filter(Boolean); } catch { return []; } });
  } catch { return []; } finally { rmSync(dir, {recursive: true, force: true}); }
}

/** The paths the workflow watches on a pull request, read from main (a change under none of them cannot change a test's result). Unreadable -> [] (then only same-commit flakes are found). */
async function watchedPaths() {
  const yaml = await (async () => { try { return (await execAsync('gh', ['api', `repos/${repo}/contents/.github/workflows/${WORKFLOW}?ref=main`, '-H', 'Accept: application/vnd.github.raw+json'], {maxBuffer: 1 << 24})).stdout; } catch { return ''; } })();
  const block = /pull_request:\s*\n\s*paths:\s*\n((?:\s*-\s*[^\n]+\n)+)/.exec(yaml);
  return block ? [...block[1].matchAll(/-\s*['"]?([^'"\n#]+?)['"]?\s*(?:#.*)?\n/g)].map(found => found[1]) : [];
}

// The move: per day, the e2e steps and integration tests of the day's last commit on main, from one blob-less clone (git grep fetches only the blobs it reads; unchanged files share one).
// A day already in the stored snapshot is kept, never read again.
function readMove(have, since, git = execFileSync) {
  const dir = mkdtempSync(path.join(tmpdir(), 'integration-move-'));
  try {
    git('git', ['clone', '-q', '--filter=blob:none', '--no-checkout', '--single-branch', '--branch=main', `--shallow-since=${since}`, `https://github.com/${repo}.git`, dir], {timeout: 180000});
    const out = (...args) => { try { return git('git', ['-C', dir, ...args], {encoding: 'utf8', maxBuffer: 1 << 26}); } catch (error) { return error.stdout ? String(error.stdout) : ''; } };   // git grep exits 1 when nothing matches
    const last = new Map();
    for (const line of git('git', ['-C', dir, 'log', '--first-parent', '--format=%H %cs', `--since=${since}`], {encoding: 'utf8'}).split('\n').filter(Boolean)) { const [sha, day] = line.split(' '); if (!last.has(day)) last.set(day, sha); }
    const days = [], today = new Date().toISOString().slice(0, 10);
    for (const [day, sha] of [...last].sort()) {
      if (have.has(day) && day !== today) continue;
      const names = out('ls-tree', '-r', '--name-only', sha, '--', 'desktop/e2e/suites', 'desktop/integration').split('\n').filter(Boolean);
      days.push(moveRow(day, names, grepCounts(out('grep', '-c', '-E', '--no-color', 'ctx\\.run\\(', sha, '--', 'desktop/e2e/suites'), sha), grepCounts(out('grep', '-c', '-E', '--no-color', '^\\s*(test|it)(\\.[a-z]+)?\\(', sha, '--', 'desktop/integration'), sha)));
    }
    const lanes = (() => { try { return Object.keys(JSON.parse(out('show', `${[...last.values()].at(-1)}:desktop/e2e/lanes.json`)).suites || {}).length; } catch { return null; } })();
    return {days, lanes};
  } catch (error) {
    console.log(`::warning::the e2e -> integration move was not read this hour: ${String(error?.message || error).slice(0, 200)}`);
    return {days: [], lanes: null};
  } finally { rmSync(dir, {recursive: true, force: true}); }
}

async function main() {
  const key = process.env.SELFHEAL_PUBLISH_KEY, dry = process.argv.includes('--dry');
  if (!key && !dry) { console.log('::warning::SELFHEAL_PUBLISH_KEY is not set: nothing published.'); return; }
  const since = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  let stored = {};
  if (key) { try { const response = await fetch(base, {headers: {Authorization: `Bearer ${key}`}}); if (response.ok) stored = await response.json(); } catch { /* the first run has none */ } }
  const have = new Set([...(stored.runs || []).map(row => row.runId), ...(stored.read || [])]);   // a run with no readable artifact is read once too (Gitar, #245)
  const listed = (gh('run', 'list', '--repo', repo, '--workflow', WORKFLOW, '--limit', '500', '--created', `>=${since}`, '--json', 'databaseId,conclusion,createdAt,headSha,headBranch,event') || [])
    .filter(run => ['success', 'failure'].includes(run.conclusion)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const todo = listed.filter(run => !have.has(run.databaseId)).slice(-MAX_RUNS);
  const read = [];
  for (let at = 0; at < todo.length; at += 6) await Promise.all(todo.slice(at, at + 6).map(async run => { read.push({run, results: await readResults(run.databaseId)}); }));
  read.sort((a, b) => a.run.createdAt.localeCompare(b.run.createdAt));
  const rows = read.flatMap(({run, results}) => results.map(result => runRow(run, result)));
  const observations = read.flatMap(({run, results}) => results.flatMap(result => result.tests.map(item => ({...runRow(run, result), createdAt: run.createdAt, name: item.name, file: item.file, ok: item.ok}))));
  const changedBetween = memo(async (from, to) => (await ghAsync('api', `repos/${repo}/compare/${from}...${to}`, '--jq', '[.files[].filename]')));
  const {open, flaky} = await advance(stored.open || [], observations, {watched: await watchedPaths(), changedBetween});
  const newest = read.filter(({run}) => run.event === 'push' && run.headBranch === 'main').at(-1);
  const results = newest ? read.filter(({run}) => run.databaseId === newest.run.databaseId).flatMap(item => item.results) : [];
  const move = readMove(new Set((stored.move?.days || []).map(row => row.day)), since);
  const snapshot = {
    runs: [...(stored.runs || []), ...rows].filter(row => row.day >= since).slice(-MAX_RUNS), read: [...new Set([...(stored.read || []), ...todo.map(run => run.databaseId)])].slice(-MAX_RUNS), open: open.slice(-300), flaky: [...(stored.flaky || []), ...flaky].slice(-100),
    slowest: results.length ? slowestOf(results) : stored.slowest || [], counts: results.length ? {...(stored.counts || {}), ...Object.fromEntries(Object.entries(countsOf(results)).filter(([, value]) => value.tests))} : stored.counts || {},
    move: {days: [...(stored.move?.days || []).filter(row => !move.days.some(item => item.day === row.day)), ...move.days].sort((a, b) => a.day.localeCompare(b.day)), e2eSteps: move.days.at(-1)?.e2eSteps ?? stored.move?.e2eSteps ?? null, lanes: move.lanes ?? stored.move?.lanes ?? null},
  };
  console.log(`${listed.length} finished integration runs in ${KEEP_DAYS} days, ${todo.length} read (${rows.length} layer results), ${flaky.length} new flaky, ${snapshot.move.days.length} move days; layers ${LAYERS.join('/')}`);
  const out = process.argv.indexOf('--out');
  if (out > 0) writeFileSync(process.argv[out + 1], JSON.stringify(snapshot));
  if (dry) return;
  const response = await fetch(base, {method: 'PUT', headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'}, body: JSON.stringify(snapshot)});
  console.log(`published ${snapshot.runs.length} run rows: HTTP ${response.status} ${await response.text()}`);
  if (!response.ok) process.exitCode = 1;
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
