// Compat shim: the old address of the Free AI relay (ops/jobs/persona-search/free-ai-local.mjs) for public commits whose free-ai-relay action runs it from the raw archive.
// Why (2 Nov 2026, rn; a8 + mac-07): web #318 moved jobs/ to ops/jobs/, and public's action overlays this repo's RAW files with `tar -x` (no layout map), so every
// Free AI e2e failed from 03:07 on ("Cannot find module ../../shared"). The real file reads `../../shared` and `../../workers/www/wrangler.toml`, which only exist in the
// joined tree; so this shim lays the tree it sits in through tools/layout-map.txt and runs the real relay there. In Node (fs.cpSync), not tools/lay-private.sh: that needs
// rsync, which the Windows runners (4 beta jobs run the relay there) do not have (mac-07, 2 Nov 2026).
// TODO(AI): delete this folder once public's action lays the site through the layout map itself, that PR is merged and a beta built from it is green (about 9 Nov 2026, #rn-relay-compat).
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

/** Copies the tree at `root` to `dest`, then lays each folder of tools/layout-map.txt at its joined-tree path on top (a stub at the old path loses to the real file). */
export function lay(root, dest) {
  fs.cpSync(root, dest, {recursive: true, filter: src => !['.git', 'node_modules'].includes(path.basename(src))});
  const map = path.join(root, 'tools/layout-map.txt');
  if (!fs.existsSync(map)) return;
  for (const line of fs.readFileSync(map, 'utf8').split('\n')) {
    const [from, to] = line.trim().split(/\s+/);
    if (!from || from.startsWith('#') || !to) continue;
    const source = path.join(root, ...from.split('/'));
    if (fs.existsSync(source)) fs.cpSync(source, path.join(dest, ...to.split('/')), {recursive: true});
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  // realpath: the relay starts only when import.meta.url equals argv[1], and a symlinked tmpdir (macOS /var) makes them differ, so it would exit 0 silently.
  const joined = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'free-ai-joined-')));
  lay(root, joined);
  const run = spawnSync(process.execPath, [path.join(joined, 'jobs/persona-search/free-ai-local.mjs'), ...process.argv.slice(2)], {stdio: 'inherit'});
  fs.rmSync(joined, {recursive: true, force: true});
  process.exit(run.status ?? 1);
}
