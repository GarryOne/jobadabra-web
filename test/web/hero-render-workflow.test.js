// Guards the by-hand hero render on GitHub's Mac runners (.github/workflows/hero-render.yml; owner, 25 Oct 2026: "we can have a manually
// triggerable workflow", Mac fonts, never Linux): dispatch only, one Mac runner per clip, every stage clip offered, inputs never pasted into a script.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {VIDEOS} from '../../media/scenes.mjs';

const root = new URL('../../', import.meta.url);
const flow = readFileSync(new URL('.github/workflows/hero-render.yml', root), 'utf8');
const slides = Object.entries(VIDEOS).filter(([, piece]) => piece.slide).sort(([, a], [, b]) => a.slide - b.slide).map(([name]) => name);
const job = name => { const rest = flow.slice(flow.indexOf(`\n  ${name}:\n`) + 1), next = rest.search(/\n  [a-z]+:\n/); return next < 0 ? rest : rest.slice(0, next); };

test('the hero render runs by hand only, never on a push, a PR or a schedule', () => {
  const on = flow.slice(flow.indexOf('\non:'), flow.indexOf('\npermissions:'));
  assert.match(on, /workflow_dispatch:/);
  assert.doesNotMatch(on, /\b(push|pull_request|schedule|workflow_run):/);
});

test('every clip on the stage is offered by default, and hero.sh records the same four (class: a fifth slide is checked too)', () => {
  const clips = flow.match(/clips:\n(?:\s+.*\n)*?\s+default: '([^']+)'/)[1].split(' ');
  assert.deepEqual(clips, slides);
  assert.match(readFileSync(new URL('tools/hero.sh', root), 'utf8'), new RegExp(`HERO=\\(${slides.join(' ')}\\)`));
});

test('each clip renders on its own Mac runner and comes back as an artifact; placing on a branch is the only write', () => {
  const render = job('render');
  assert.match(render, /runs-on: macos-/);
  assert.match(render, /clip: \$\{\{ fromJSON\(needs\.plan\.outputs\.clips\) \}\}/);
  assert.match(render, /tools\/hero\.sh "\$CLIP"/);
  assert.match(render, /upload-artifact@v4[\s\S]*name: hero-\$\{\{ matrix\.clip \}\}/);
  assert.match(flow.slice(0, flow.indexOf('\njobs:')), /permissions:\n  contents: read/);
  assert.match(job('place'), /if: inputs\.branch != ''[\s\S]*contents: write[\s\S]*tools\/hero\.sh --place set/);
});

test('inputs reach the scripts only through env, never pasted into a run line', () => {
  for (const block of flow.split(/\n\s+- /).filter(step => /\brun:/.test(step))) {
    const run = block.slice(block.search(/\brun:/));
    assert.doesNotMatch(run, /\$\{\{\s*(inputs|matrix|github\.event)\./, `a run line uses an expression directly: ${run.slice(0, 80)}`);
  }
});
