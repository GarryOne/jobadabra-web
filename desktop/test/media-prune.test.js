// Guards the hero cache's cleanup (media/takes.mjs pruneSets, tools/hero.sh): 25 Oct 2026, 99 kept sets filled 42 GB and left the Mac 3.9 GB free.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('the hero cache keeps its newest sets, an owner-kept one and the --words one; other folders are never touched', async () => {
  const {pruneSets} = await import('../../media/takes.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hero-prune-'));
  const sets = ['hero-20261024-010000', 'hero-20261024-020000', 'hero-20261024-030000', 'hero-20261025-010000', 'hero-20261025-020000', 'hero-20261025-030000'];
  for (const name of [...sets, 'set-20261021-040124', 'modules-desktop-abc', 'hero-preview-20261024-023503']) fs.mkdirSync(path.join(root, name, '.work'), {recursive: true});
  fs.writeFileSync(path.join(root, 'hero-20261024-010000', 'KEEP'), 'owner approved round 9');
  const gone = pruneSets(root, 2, [path.join(root, 'hero-20261024-020000')]);
  assert.deepEqual(gone.sort(), ['hero-20261024-030000', 'hero-20261025-010000']);
  assert.deepEqual(fs.readdirSync(root).sort(), ['hero-20261024-010000', 'hero-20261024-020000', 'hero-20261025-020000', 'hero-20261025-030000', 'hero-preview-20261024-023503', 'modules-desktop-abc', 'set-20261021-040124']);
  assert.deepEqual(pruneSets(path.join(root, 'none'), 2), [], 'no cache yet');
  fs.rmSync(root, {recursive: true, force: true});
});

test('tools/hero.sh prunes before each new set, keeping HERO_KEEP (3) with the new one and the --words set', () => {
  const source = fs.readFileSync(new URL('../../tools/hero.sh', import.meta.url), 'utf8');
  const prune = source.indexOf('pruneSets(process.env.HERO_CACHE'), made = source.indexOf('set_dir="$cache/hero-$(date');
  assert.ok(prune > 0 && prune < made, 'the prune runs before the new set is made');
  assert.match(source, /HERO_KEEP="\$\{HERO_KEEP:-3\}"/);
  assert.match(source, /HERO_PROTECT="\$\{words\[1\]:-\}"/);
});
