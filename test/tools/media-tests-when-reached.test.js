// A pull request runs the media tests and installs ffmpeg/Electron only when it changes a media file; main and the daily run always do (owner's "a PR
// runs only what its changes reach"; 26 Oct 2026: a stalled Ubuntu mirror failed migration-only web #154 four times on the ffmpeg install).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const root = new URL('../../', import.meta.url);
const workflow = readFileSync(new URL('.github/workflows/tests.yml', root), 'utf8');
const guards = readFileSync(new URL('tools/site-guards.sh', root), 'utf8');
const step = name => workflow.split('\n      - name: ').find(part => part.startsWith(name)) || '';

test('only a pull request decides, from its own changed files', () => {
  const decide = step('Does this PR touch media?');
  assert.match(decide, /if: github\.event_name == 'pull_request'/, 'main and the daily run never skip');
  assert.match(decide, /pulls\/.*\/files/);
  assert.match(decide, /\|\| files='media\/'/, 'a failed lookup runs the media tests');
  for (const reached of ['media/', 'desktop/test/media-', 'apt-install', 'site-guards']) assert.ok(decide.includes(reached), reached);
});

test('ffmpeg and Electron are installed whenever the media tests run', () => {
  for (const name of ['ffmpeg for the hero media tests', 'Electron and a display for the hero render test']) {
    assert.match(step(name), /if: env\.MEDIA_TOOLS != '0'/, name);
  }
});

test('site-guards leaves out only the media tests, and says so', () => {
  assert.match(guards, /if \[ "\$\{MEDIA_TOOLS:-1\}" = 0 \]/, 'unset means run them');
  assert.match(guards, /grep -v '\^test\/media-'/);
  assert.match(guards, /media tests not run here/);
});
