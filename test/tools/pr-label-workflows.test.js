// Guard for the two PR-label workflows (owner, 2 Nov 2026: "same workflow on all repos"; web #299 showed a red ✗ from a cancelled Gitar-label run).
// The scripts live in the public jobadabra/jobadabra (tools/gitar-label.mjs, tools/conflict-label.mjs, with their cases in that repo's tests); this repo only checks out main's copy and writes labels.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';

const read = name => readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8');
const gitar = read('gitar-label.yml');
const conflict = read('conflict-label.yml');

test('both workflows read the script from jobadabra/jobadabra main, as a file pattern, and this repo keeps no copy', () => {
  for (const flow of [gitar, conflict]) {
    assert.ok(flow.includes('repository: jobadabra/jobadabra\n') || flow.includes('repository: jobadabra/jobadabra   #'), 'the script comes from the public engine repo');
    assert.ok(/\n {10}ref: main\n/.test(flow), "main's copy, never the PR's");
    assert.ok(flow.includes('sparse-checkout-cone-mode: false'), 'a file pattern: cone mode reads every entry as a folder (Gitar on web#258)');
    assert.ok(!/head\.(sha|ref)|github\.head_ref/.test(flow), "a PR's code is never checked out");
    assert.ok(flow.includes('pull-requests: write') && flow.includes('issues: write') && !flow.includes('contents: write'), 'its only writes are labels');
  }
  assert.ok(gitar.includes('tools/gitar-label.mjs') && conflict.includes('tools/conflict-label.mjs'));
  assert.equal(existsSync(new URL('../../tools/gitar-label.mjs', import.meta.url)), false, 'one parser for every repo: no stale copy here');
  assert.equal(existsSync(new URL('../../tools/conflict-label.mjs', import.meta.url)), false);
});

// Web #299: the Gitar label run was cancelled by a newer Gitar comment and the PR list drew a failed check. jobadabra removed the group for the same reason (#2400).
test('the Gitar label job has no concurrency group that can cancel a run', () => {
  assert.ok(!/concurrency:/.test(gitar), 'a cancelled run is drawn as a red ✗ in the PR list');
  assert.ok(!/cancel-in-progress:\s*true/.test(gitar));
});

test('the Gitar label runs on a push, on Gitar\'s review and on a NEW Gitar comment (an edit starts nothing)', () => {
  const on = gitar.split('\non:\n')[1].split('\n\n')[0];
  assert.ok(on.includes('pull_request_target:\n    types: [opened, synchronize, reopened]'));
  assert.ok(on.includes('pull_request_review:\n    types: [submitted, dismissed]'));
  assert.ok(on.includes('issue_comment:\n    types: [created]') && !on.includes('edited'));
  assert.ok(gitar.includes("github.event.comment.user.login == 'gitar-bot[bot]'") && gitar.includes("github.event.review.user.login == 'gitar-bot[bot]'"));
});

// Owner, 1 Nov 2026: a conflict appears when main moves and goes when the PR is pushed. A label, not a gate.
test('the conflict label runs when main or a PR moves, labels that PR alone, and nothing waits for it', () => {
  const on = conflict.split('\non:\n')[1].split('\n\n')[0];
  assert.ok(on.includes('push:\n    branches: [main]'));
  assert.ok(on.includes('pull_request_target:\n    types: [opened, synchronize, reopened]'));
  assert.ok(conflict.includes('PR: ${{ github.event.pull_request.number }}'), "a PR's run labels that PR alone");
  assert.ok(conflict.includes("group: conflict-label-${{ github.event_name == 'push' && 'main' || github.run_id }}"), 'main pushes share a group; a PR push is its own group, never cancelled');
  assert.ok(/\n  conflict:\n/.test(conflict) && !/\n  conflict:\n(?:.*\n)*?\s+needs:/.test(conflict), 'a label job waits for nothing and nothing waits for it');
});
