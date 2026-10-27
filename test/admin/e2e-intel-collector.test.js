// jobs/e2e-intel-rows.mjs: from workflow runs of every kind to red suites and their causes, with no network (GitHub and the AI are stubs). Shapes from the runs of 26-27 Oct 2026.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {answerText, jobMinutes, kindOf, passedFirst, redJobs, rowsOf, runsToRead} from '../../jobs/e2e-intel-rows.mjs';

const step = (name, conclusion) => ({name, conclusion});
const job = (name, conclusion, steps = [], id = 1, at = {}) => ({id, name, conclusion, steps, created_at: '2026-10-26T20:00:00Z', started_at: '2026-10-26T20:02:00Z', completed_at: '2026-10-26T20:12:00Z', ...at});
const first = (suite, conclusion = 'success') => step(`Run the ${suite} suite (first try)`, conclusion);
const once = (suite, conclusion) => step(`First try failed: the ${suite} suite once more, to tell flaky from real`, conclusion);
const run = (databaseId, createdAt, headSha, jobs, extra = {}) => ({databaseId, createdAt, updatedAt: createdAt.replace(':01:', ':27:'), headSha, headBranch: 'main', conclusion: 'failure', kind: 'beta', workflow: 'e2e.yml', jobs, ...extra});
const none = {commitsBetween: async () => [], filesBetween: async () => [], filesOf: async () => [], prFiles: async () => [], ask: async () => null};

test('every run kind is named from its title; bisects, mutants and runs by hand on main are left out', () => {
  const k = (displayTitle, workflow = 'e2e.yml', extra = {}) => kindOf({displayTitle, headBranch: 'main', event: 'workflow_dispatch', ...extra}, workflow);
  assert.equal(k('Release · Build, test, beta · Nightly 0.9.1', 'desktop.yml'), 'nightly');
  assert.equal(k('Release · Build, test, beta · Beta by hand', 'desktop.yml'), 'beta');
  assert.equal(k('E2E for PR · settings · cv-facts-checks'), 'pr');
  assert.equal(k('E2E after merge · abc123 · quality'), 'after-merge');
  assert.equal(k('E2E check · on time (Worker cron)'), 'scheduled');
  assert.equal(k('RC soak v0.9.1-rc.2'), 'soak');
  assert.equal(k('Bisect quality v1'), null);
  assert.equal(k('Mutant m3'), null);
  assert.equal(k('E2E Mac + Linux · all suites · main'), null);
  assert.equal(k('E2E Mac + Linux · all suites · role-kinds-app', 'e2e.yml', {headBranch: 'role-kinds-app'}), 'pr', 'a PR run before 26 Oct');
  assert.equal(k('CI · Harness tests (daily)', 'harness-daily.yml'), 'harness');
});

test('red jobs: standalone e2e.yml jobs by their first-try step, a release run\'s by name; a green second try is a flake; a PR job a newer push cancelled is no red', () => {
  const r = run(1, '2026-10-26T20:01:00Z', 'aaa', [job('plan', 'success'), job('quality', 'failure', [first('quality'), once('quality', 'failure')], 10),
    job('settings', 'success', [first('settings'), once('settings', 'success')], 11), job('E2E · Windows · apply', 'failure', [step('Run the apply suite on Windows', 'failure')], 12),
    job('jobs', 'success', [first('jobs'), once('jobs', 'skipped')], 13)]);
  assert.deepEqual(redJobs(r).map(red => [red.suite, red.platform, red.rerun]), [['quality', 'mac', 'failure'], ['settings', 'mac', 'success'], ['apply', 'windows', undefined]]);
  assert.equal(passedFirst(r, 'jobs', 'mac'), true);
  assert.equal(passedFirst(r, 'settings', 'mac'), false);
  const pr = run(2, '2026-10-26T20:01:00Z', 'bbb', [job('quality', 'cancelled', [first('quality')], 20)], {kind: 'pr'});
  assert.deepEqual(redJobs(pr), []);
});

test('a run\'s minutes split into waiting for a runner and running (6e: #2199 waited 8.5 min, ran 73 s)', () => {
  assert.deepEqual(jobMinutes([job('plan', 'success', [], 1, {created_at: '2026-10-27T01:00:00Z', started_at: '2026-10-27T01:06:00Z', completed_at: '2026-10-27T01:07:00Z'}),
    job('settings', 'success', [], 2, {created_at: '2026-10-27T01:07:00Z', started_at: '2026-10-27T01:09:30Z', completed_at: '2026-10-27T01:10:43Z'})]), {queueMin: 8.5, runMin: 2.2});
});

test('causes: a CI step before the suite is "ci" without reading any fix; a wrong value goes to the fix\'s trailer, then the AI; no next green is "open"', async () => {
  const relay = job('E2E · Windows · apply', 'failure', [step("Free AI relay (CI's AI since 26 Oct 2026)", 'failure')], 10);
  const wrong = job('settings', 'failure', [first('settings'), once('settings', 'failure')], 11), stuck = job('quality', 'failure', [first('quality'), once('quality', 'failure')], 12);
  const green = job('settings', 'success', [first('settings')], 21);
  const runs = [run(1, '2026-10-26T03:01:00Z', 'aaa', [relay, wrong, stuck], {kind: 'nightly'}), run(2, '2026-10-26T09:01:00Z', 'bbb', [green], {kind: 'scheduled', conclusion: 'success'})];
  const logs = {10: 'tar: D\\:\\a\\_temp/free-ai-tree: Cannot open', 11: '✗ Automatic backup: the message does not name the file: "Backed up ✓ ..."', 12: '✗ every enriched fact equals the ground truth: 2 wrong'};
  const asked = [];
  const deps = {...none, commitsBetween: async (a, b) => (a === 'aaa' && b === 'bbb' ? [{sha: 'f1', message: 'Expect the backup message to name the file, not its folder'}] : null),
    filesOf: async () => ['desktop/e2e/suites/settings.mjs'], diffOf: async () => '-  expect(folder)\n+  expect(file)', ask: async prompt => { asked.push(prompt.user); return '{"cause": "drift", "fix": 1}'; }};
  const rows = await rowsOf(runs, {logOf: id => logs[id] ?? '', ...deps});
  assert.deepEqual(rows.fails.map(fail => [fail.suite, fail.platform, fail.kind, fail.cause, fail.fix]), [['apply', 'windows', 'nightly', 'ci', ''], ['settings', 'mac', 'nightly', 'drift', 'f1'], ['quality', 'mac', 'nightly', 'open', '']]);
  assert.match(rows.fails[0].line, /free-ai-tree/);
  assert.equal(asked.length, 1);
  assert.match(asked[0], /files: desktop\/e2e\/suites\/settings\.mjs \[tests\]/);
  assert.match(asked[0], /diff:\n-  expect\(folder\)/, 'the AI reads the likeliest fixes\' diffs (without them it agreed with a hand reading on 13 of 23)');
  const nothing = await rowsOf(runs, {logOf: id => logs[id] ?? '', ...deps, commitsBetween: async () => [{sha: 'z1', message: 'Merge the Jobs filter chips'}], ask: async () => { throw new Error('no fix to judge: no AI'); }});
  assert.equal(nothing.fails[1].cause, 'unknown', 'no likely fix: unknown without asking');
  const trailer = await rowsOf(runs, {logOf: id => logs[id] ?? '', ...deps, commitsBetween: async () => [{sha: 't9', message: 'Fix it\n\nE2E-cause: test settings'}], ask: async () => { throw new Error('the trailer decides; no AI'); }});
  assert.equal(trailer.fails[1].cause, 'test');
  const noAi = await rowsOf(runs, {logOf: id => logs[id] ?? '', ...deps, ask: async () => null});
  assert.equal(noAi.fails[1].cause, 'unknown', 'no AI answer: unknown, never a guess');
  const unread = await rowsOf(runs, {logOf: () => null, ...deps});
  assert.equal(unread.fails[1].cause, 'unknown', 'a log not read this pass is read again later');
});

test('a PR red is judged by its own next push: the PR\'s app files fixed = caught; the PR\'s run row carries its queue and running minutes', async () => {
  const red = job('wander', 'failure', [first('wander'), once('wander', 'failure')], 30), green = job('wander', 'success', [first('wander')], 31);
  const runs = [run(5, '2026-10-26T10:01:00Z', 'p1', [red], {kind: 'pr', headBranch: 'store-setup', pr: 2123}), run(6, '2026-10-26T11:01:00Z', 'p2', [green], {kind: 'pr', headBranch: 'store-setup', pr: 2123, conclusion: 'success'}),
    run(7, '2026-10-26T10:30:00Z', 'm1', [job('wander', 'success', [first('wander')], 40)], {kind: 'after-merge', conclusion: 'success'})].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const rows = await rowsOf(runs, {logOf: () => '✗ [wander] error-shown: Error invoking remote method \'strategyData\'', ...none,
    filesBetween: async () => ['desktop/lib/server.js', 'src/from-main.py'], prFiles: async pr => (pr === 2123 ? ['desktop/lib/server.js'] : [])});
  assert.deepEqual(rows.fails.map(fail => [fail.suite, fail.kind, fail.cause, fail.caught]), [['wander', 'pr', 'product', 1]]);
  assert.deepEqual(rows.runs.find(row => row.runId === 5), {runId: 5, createdAt: '2026-10-26T10:01:00Z', kind: 'pr', conclusion: 'failure', minutes: 26, queueMin: 2, runMin: 10, pr: 2123});
});

test('a cancelled run is a stored try with no reds', async () => {
  const rows = await rowsOf([run(1, '2026-10-17T20:01:00Z', 'aaa', [job('E2E · Mac + Linux · apply', 'cancelled', [], 10)], {conclusion: 'cancelled'})], none);
  assert.deepEqual(rows.runs.map(row => [row.runId, row.conclusion]), [[1, 'cancelled']]);
  assert.deepEqual(rows.fails, []);
});

test('new runs are read newest first, at most a pass\'s worth; with nothing new the pending ones are read again', () => {
  const listed = [1, 2, 3, 4, 5].map(databaseId => ({databaseId}));
  assert.deepEqual(runsToRead(listed, new Set([1]), new Set(), 3).map(r => r.databaseId), [3, 4, 5]);
  assert.deepEqual(runsToRead(listed, new Set([1, 2, 3, 4, 5]), new Set([2])).map(r => r.databaseId), [2]);
});

test('the AI\'s answer is read as text in every shape Workers AI gives: a string, OpenAI-style choices, or the JSON already parsed', () => {
  assert.equal(answerText({result: {response: '{"cause": "drift", "fix": 1}'}}), '{"cause": "drift", "fix": 1}');
  assert.equal(answerText({result: {choices: [{message: {content: '<think>hm</think>\n{"cause": "test", "fix": 2}', reasoning: 'x'}}]}}), '\n{"cause": "test", "fix": 2}');
  assert.equal(answerText({result: {response: {cause: 'product', fix: 1}}}), '{"cause":"product","fix":1}', '27 Oct 2026: 29 of 29 answers read "[object Object]"');
  assert.equal(answerText({errors: [{message: 'no'}]}), '');
});
