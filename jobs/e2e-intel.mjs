#!/usr/bin/env node
// Publishes every finished e2e run of the last 30 days (beta, nightly, main after a merge, scheduled, soak, canary, PR, the daily harness tests) and the cause of
// each red suite to /admin/operations/e2e (e2e-intel.yml, hourly). The pure part (kinds, reds, causes) is jobs/e2e-intel-rows.mjs; this file reads GitHub, asks the AI
// and publishes. A run is read once; a red whose cause is "open" or "unknown" is read again until its fix lands. Log text is searched for the failure line only:
// the line (a test step's own words, no personal data) is stored, the log never is. Guard: test/admin/e2e-intel-collector.test.js.
//   node jobs/e2e-intel.mjs [--dry [--out rows.json]]    needs gh with GH_TOKEN; publishing needs SELFHEAL_PUBLISH_KEY (optional E2E_INTEL_URL)
//   AI for the reds no fact names: E2E_CAUSE_CF_TOKEN + E2E_CAUSE_CF_ACCOUNT (its own Workers AI token, never production's); without them those reds stay "unknown".
import {execFile, execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFileSync} from 'node:fs';
import {nightOf} from '../admin/e2e-quality.js';
import {pathToFileURL} from 'node:url';
import {CAUSES, DIFF_MAX, RULES_VERSION} from '../admin/e2e-causes.js';
import {answerText, kindOf, redJobs, rowsOf, runsToRead} from './e2e-intel-rows.mjs';

const repo = process.env.REPO || process.env.GITHUB_REPOSITORY || 'GarryOne/jobadabra';
const base = process.env.E2E_INTEL_URL || 'https://www.jobpilotto.top/e2e/data';
const execAsync = promisify(execFile);
const WORKFLOWS = ['desktop.yml', 'e2e.yml', 'e2e-windows.yml', 'harness-daily.yml'];
const MAX_RUNS = 200, MAX_LOGS = 150, MAX_AI = 60;   // per pass (hourly): the newest first; the rest the next pass. A red with no log read stays "unknown" and is read again.
const MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';   // the small Workers AI model CI already uses
const gh = (...args) => JSON.parse(execFileSync('gh', args, {encoding: 'utf8', maxBuffer: 1 << 28}) || 'null');
const ghAsync = async (...args) => { try { return JSON.parse((await execAsync('gh', args, {maxBuffer: 1 << 28, timeout: 60000})).stdout || 'null'); } catch { return null; } };
async function eight(items, work) { for (let at = 0; at < items.length; at += 8) await Promise.all(items.slice(at, at + 8).map(work)); }   // eight GitHub calls at a time
const memo = fn => { const seen = new Map(); return (...args) => { const key = JSON.stringify(args); if (!seen.has(key)) seen.set(key, fn(...args)); return seen.get(key); }; };

// The failing jobs' logs, searched in memory (never stored or sent).
async function readLogs(runs) {
  const ids = runs.flatMap(run => redJobs(run).map(red => red.jobId)).slice(0, MAX_LOGS), logs = new Map();
  await eight(ids, async id => {
    try { logs.set(id, (await execAsync('gh', ['api', '--allow-escape-sequences', `repos/${repo}/actions/jobs/${id}/logs`], {maxBuffer: 1 << 28, timeout: 90000})).stdout.replace(/\x1b\[[0-9;]*m/g, '')); } catch { logs.set(id, null); }
  });
  return logs;
}

// The night's live quality run (e2e.yml "Fresh AI answers for quality once a day": a scheduled "E2E check" started 21-22 UTC) -> its counts (admin/e2e-quality.js).
// The other runs replay recorded answers and score nothing twice. listed: gh run list rows; stored: run ids the site has.
export const liveNights = (listed, stored) => listed.filter(run => /^E2E check/.test(run.displayTitle || '') && ['success', 'failure'].includes(run.conclusion)
  && [21, 22].includes(new Date(run.createdAt).getUTCHours()) && !stored.has(run.databaseId));

async function readNights(runs) {
  const nights = [];
  for (let at = 0; at < runs.length; at += 8) {
    await Promise.all(runs.slice(at, at + 8).map(async run => {
      try {
        const jobs = JSON.parse((await execAsync('gh', ['api', `repos/${repo}/actions/runs/${run.databaseId}/jobs?per_page=100`], {maxBuffer: 1 << 28})).stdout).jobs || [];
        const job = jobs.find(item => item.name === 'quality' || /^quality\b/.test(item.name));
        if (!job) return;
        const log = (await execAsync('gh', ['api', '--allow-escape-sequences', `repos/${repo}/actions/jobs/${job.id}/logs`], {maxBuffer: 1 << 28})).stdout;
        const night = nightOf(log);
        if (night) nights.push({runId: run.databaseId, day: run.createdAt.slice(0, 10), ...night});
      } catch { /* a run whose log cannot be read is read again next hour */ }
    }));
  }
  return nights;
}

let aiCalls = 0, aiNeurons = 0;
async function ask({system, user}) {
  const token = process.env.E2E_CAUSE_CF_TOKEN, account = process.env.E2E_CAUSE_CF_ACCOUNT;
  if (!token || !account || aiCalls >= MAX_AI) return null;
  aiCalls += 1;
  try {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`, {method: 'POST', headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({messages: [{role: 'system', content: system}, {role: 'user', content: `${user}\n/no_think`}], max_tokens: 800, temperature: 0}), signal: AbortSignal.timeout(60000)});   // /no_think: qwen3 spent the whole answer on its reasoning (27 Oct 2026)
    const data = await response.json();
    aiNeurons += Number(data?.result?.usage?.total_tokens) || 0;
    return answerText(data);
  } catch { return null; }
}

const deps = {
  commitsBetween: memo(async (from, to) => (await ghAsync('api', `repos/${repo}/compare/${from}...${to}`, '--jq', '[.commits[] | {sha, message: .commit.message}]'))),
  filesBetween: memo(async (from, to) => (from === to ? [] : await ghAsync('api', `repos/${repo}/compare/${from}...${to}`, '--jq', '[.files[].filename]'))),
  filesOf: memo(async sha => ghAsync('api', `repos/${repo}/commits/${sha}`, '--jq', '[.files[].filename]')),
  diffOf: memo(async sha => { try { return (await execAsync('gh', ['api', '-H', 'Accept: application/vnd.github.diff', `repos/${repo}/commits/${sha}`], {maxBuffer: 1 << 26, timeout: 60000})).stdout.slice(0, DIFF_MAX); } catch { return null; } }),
  prFiles: memo(async pr => {
    if (!pr) return [];
    try { return (await execAsync('gh', ['api', '--paginate', `repos/${repo}/pulls/${pr}/files?per_page=100`, '--jq', '.[].filename'], {maxBuffer: 1 << 26, timeout: 60000})).stdout.split('\n').filter(Boolean); } catch { return null; }
  }),
  ask,
};

async function main() {
  const key = process.env.SELFHEAL_PUBLISH_KEY, dry = process.argv.includes('--dry');
  if (!key && !dry) { console.log('::warning::SELFHEAL_PUBLISH_KEY is not set: nothing published.'); return; }
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const prOf = Object.fromEntries((gh('pr', 'list', '--repo', repo, '--state', 'all', '--limit', '1000', '--search', `created:>=${since}`, '--json', 'number,headRefName') || []).map(pr => [pr.headRefName, pr.number]));
  const listed = WORKFLOWS.flatMap(workflow => (gh('run', 'list', '--repo', repo, '--workflow', workflow, '--limit', '1000', '--created', `>=${since}`, '--json', 'databaseId,conclusion,createdAt,updatedAt,displayTitle,headSha,headBranch,event') || [])
    .map(run => ({...run, workflow, kind: kindOf(run, workflow)})))
    .filter(run => run.kind && ['success', 'failure', 'cancelled'].includes(run.conclusion)).map(run => ({...run, pr: run.kind === 'pr' ? prOf[run.headBranch] || null : null}))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  let have = [], pending = [], quality = [];
  if (key) ({have, pending, quality = []} = await (await fetch(`${base}?v=${RULES_VERSION}`, {headers: {Authorization: `Bearer ${key}`}})).json());
  const settled = new Set(have), waiting = new Set(pending);
  const nights = await readNights(liveNights(listed.filter(run => run.workflow === 'e2e.yml'), new Set(quality)).slice(0, 40));
  const todo = runsToRead(listed, settled, waiting, MAX_RUNS);
  console.log(`${listed.length} finished e2e runs in 30 days, ${settled.size} stored, ${todo.length} to read; ${nights.length} new live quality night(s)`);
  if (!todo.length && !nights.length) return;
  // A fix is looked for in the later runs of the same line (main, or the PR's branch): read the jobs from the oldest run to read onwards (at most 400 runs).
  const needed = todo.length ? listed.slice(listed.findIndex(run => run.databaseId === todo[0].databaseId)).slice(0, 400) : [];   // no run to read: only the quality nights go
  await eight(needed, async run => { run.jobs = (await ghAsync('api', `repos/${repo}/actions/runs/${run.databaseId}/jobs?per_page=100`))?.jobs || []; });
  const wanted = new Set(todo.map(run => run.databaseId));
  const logs = await readLogs(needed.filter(run => wanted.has(run.databaseId)).reverse());
  const rows = await rowsOf(needed, {logOf: id => (logs.has(id) ? logs.get(id) : null), ...deps});
  const send = {runs: rows.runs.filter(row => wanted.has(row.runId)), fails: rows.fails.filter(row => wanted.has(row.runId)), quality: nights};
  console.log(JSON.stringify(Object.fromEntries(CAUSES.map(cause => [cause.id, send.fails.filter(fail => fail.cause === cause.id).length]))));
  console.log(`AI: ${aiCalls} call(s), ${aiNeurons} tokens on ${MODEL}${process.env.E2E_CAUSE_CF_TOKEN ? '' : ' (no E2E_CAUSE_CF_TOKEN: reds no fact names stay unknown)'}`);
  const out = process.argv.indexOf('--out');
  if (out > 0) writeFileSync(process.argv[out + 1], JSON.stringify(send));
  if (dry) return;
  const response = await fetch(base, {method: 'PUT', headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json'}, body: JSON.stringify({rules: RULES_VERSION, ...send})});
  console.log(`published ${send.runs.length} runs, ${send.fails.length} reds, ${nights.length} quality nights: HTTP ${response.status} ${await response.text()}`);
  if (!response.ok) process.exitCode = 1;
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main();
