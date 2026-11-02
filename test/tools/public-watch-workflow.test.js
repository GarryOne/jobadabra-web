// Guard for public-watch.yml: its records leave main (owner, 2 Nov 2026: the same ruleset on every org repo; a ruleset on main refuses the direct push this workflow made).
// Why (2 Nov 2026, go): the old step ended `git commit ... && git push -q || true` on main. Under the org ruleset that push is refused and `|| true` hides it, so the deploy records
// would silently stop and every 6 h run would redeploy. The records now live on the unprotected branch public-watch-state; a failed push fails the job.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const flow = readFileSync(join(ROOT, '.github/workflows/public-watch.yml'), 'utf8');

test('no step of the workflow pushes to main or hides a failed push', () => {
  const pushes = flow.split('\n').filter(line => /git push/.test(line));
  assert.ok(pushes.length >= 1, 'it still records something');
  for (const line of pushes) {
    assert.ok(/git push\s+(-q\s+)?origin\s+HEAD:public-watch-state/.test(line), `every push names the state branch, got: ${line.trim()}`);
    assert.ok(!/\|\|\s*true/.test(line), 'a failed push must fail the job');
  }
  assert.ok(!/git (commit|push)[^\n]*\|\|\s*true/.test(flow), 'no swallowed commit or push anywhere');
});

test('the records are read from the state branch, checked out next to the private repo', () => {
  assert.ok(/ref: public-watch-state/.test(flow), 'the state branch is checked out');
  assert.ok(/PUBLIC_WATCH_STATE:\s*\$\{\{\s*github\.workspace\s*\}\}\/\.state/.test(flow), 'tools/public-watch.sh is told where the records are');
});

test('the record files are no longer tracked on main', () => {
  const tracked = execFileSync('git', ['ls-files', '.public-site', '.public-ready'], {cwd: ROOT, encoding: 'utf8'});
  assert.equal(tracked.trim(), '', 'main holds no deploy record: the ruleset refuses a direct push there');
});

test('public-watch.sh writes its record into PUBLIC_WATCH_STATE and says changed, then same', () => {
  const tree = mkdtempSync(join(tmpdir(), 'pw-tree-'));
  const state = mkdtempSync(join(tmpdir(), 'pw-state-'));
  const git = (...args) => execFileSync('git', ['-C', tree, ...args], {encoding: 'utf8'});
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
  writeFileSync(join(tree, 'a.txt'), 'one\n'); git('add', '.'); git('commit', '-q', '-m', 'one');
  const run = () => execFileSync('bash', [join(ROOT, 'tools/public-watch.sh'), tree, 'site', 'a.txt'], {encoding: 'utf8', env: {...process.env, PUBLIC_WATCH_STATE: state}}).trim();
  const inRepo = () => (existsSync(join(ROOT, '.public-site')) ? readFileSync(join(ROOT, '.public-site'), 'utf8') : null);
  const before = inRepo();
  assert.equal(run(), 'changed');
  assert.ok(existsSync(join(state, '.public-site')), 'the record is in the state folder');
  assert.equal(inRepo(), before, 'nothing is written into this repo');
  assert.equal(run(), 'same');
});
