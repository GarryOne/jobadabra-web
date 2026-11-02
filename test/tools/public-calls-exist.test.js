// Every file of this repo that public's workflows and actions name by path still exists in the joined tree (the public repo with this one laid over it).
// Why (2 Nov 2026, rn; mac-07: "2 escapes in 3 days"): web #318 moved jobs/ to ops/jobs/ and public's free-ai-relay action went on calling jobs/persona-search/...,
// red for every Free AI e2e from 03:07. This test reads the callers themselves (no copy of a list to keep in sync): it sees public's .github because it runs in the joined tree.
// Limit: it checks the joined path, so it does not see an action that overlays this repo's RAW files without the layout map; public's tests/test_workflow_site_layout.py owns that.
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const tree = fileURLToPath(new URL('../../', import.meta.url));
// The joined-tree top folders that only this repo has; public has none of these names, so a path under one of them is ours to keep.
const OURS = ['web', 'jobs', 'hosted', 'media', 'db', 'admin', 'api', 'workers'];
const PATH = new RegExp(`(?<![\\w./$-])((?:${OURS.join('|')})/[\\w./-]*\\w\\.(?:mjs|jsonc|json|js|sh|sql|toml|py|html)(?![\\w]))`, 'g');

/** The repo-relative paths of this repo's folders that `text` (a workflow or an action) names. */
export const named = text => [...new Set([...text.matchAll(PATH)].map(m => m[1]))];

/** Which of the named paths `exists` does not know. */
export const missing = (texts, exists) => [...new Set(texts.flatMap(named))].filter(p => !exists(p)).sort();

function callers() {
  const walk = dir => !existsSync(dir) ? [] : readdirSync(dir, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : /\.ya?ml$/.test(e.name) ? [join(dir, e.name)] : []);
  return [...walk(join(tree, '.github/workflows')), ...walk(join(tree, '.github/actions'))];
}

test('a path of this repo in a public workflow or action is found in the joined tree', () => {
  const files = callers();
  assert.ok(files.length > 10, `public's .github is not in the tree (${files.length} files): run through tools/site-run.sh or CI's tree`);
  const texts = files.map(f => readFileSync(f, 'utf8'));
  assert.ok(named(texts.join('\n')).length > 3, 'the scan finds nothing: it cannot pass by finding nothing');
  assert.deepEqual(missing(texts, p => existsSync(join(tree, p))), []);
});

test('the scan names the path #318 broke, and reports it when only the moved copy exists', () => {
  const action = '(cd "$tree" && nohup node jobs/persona-search/free-ai-local.mjs "$PORT" "$key" &)';
  assert.deepEqual(named(action), ['jobs/persona-search/free-ai-local.mjs']);
  assert.deepEqual(missing([action], p => p.startsWith('ops/')), ['jobs/persona-search/free-ai-local.mjs']);
  assert.deepEqual(missing([action], () => true), []);
});

test('a path of public\'s own, or one cut by a variable, is not ours to check', () => {
  assert.deepEqual(named('node desktop/e2e/jobs/x.mjs && cat .private/jobs/y.mjs && node jobs/${{ matrix.job }}.mjs'), []);
});
