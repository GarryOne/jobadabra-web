// The site's test names stay in the prefixes public leaves to it (tools/site-test-names.mjs, public docs/site-test-names.json; web#163 red main, 26 Oct 2026).
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {misnamed} from '../../tools/site-test-names.mjs';

const folders = {tests: ['test_site_'], 'desktop/test': ['media-', 'web-'], 'desktop/e2e/test': [], test: ['']};

test('a site test without its folder\'s prefix is named, one with it passes', () => {
  assert.deepEqual(misnamed(folders, {tests: ['test_site_pipefail.py', 'test_workflow_app_client_id.py'], 'desktop/test': ['media-cuts.test.js', 'ladder-moves-site.test.js']}),
    ['tests/test_workflow_app_client_id.py', 'desktop/test/ladder-moves-site.test.js']);
});

test('a folder that is all the site\'s takes any name; one the site keeps nothing in takes none', () => {
  assert.deepEqual(misnamed(folders, {test: ['tools/ci-apt.test.js', 'boundary.test.js']}), []);
  assert.deepEqual(misnamed(folders, {'desktop/e2e/test': ['runner.test.mjs']}), ['desktop/e2e/test/runner.test.mjs']);
});

test('a folder the list does not know is named, never passed', () => {
  assert.match(misnamed(folders, {'worker/test': ['x.test.js']})[0], /no rule for this folder/);
});
