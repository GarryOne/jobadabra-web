// Compat shim: the old address of the Free AI relay (ops/jobs/persona-search/free-ai-local.mjs) for public commits whose free-ai-relay action runs it from the raw archive.
// Why (2 Nov 2026, rn; a8 + mac-07): web #318 moved jobs/ to ops/jobs/, and public's action overlays this repo's RAW files with `tar -x` (no layout map), so every
// Free AI e2e failed from 03:07 on ("Cannot find module ../../shared"). The real file reads `../../shared` and `../../workers/www/wrangler.toml`, which only exist in the
// joined tree; so this shim lays the tree it sits in through tools/layout-map.txt (tools/lay-private.sh, the same call tree.sh makes) and runs the real relay there.
// TODO(AI): delete this folder once no public commit that can still run (a beta picks one up to 5 behind, from its own tag) calls jobs/persona-search/ here (about 9 Nov 2026, #rn-relay-compat).
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
// realpath: the relay starts only when import.meta.url equals argv[1], and a symlinked tmpdir (macOS /var) makes them differ, so it would exit 0 silently.
const joined = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'free-ai-joined-')));
const lay = spawnSync('bash', [path.join(root, 'tools/lay-private.sh'), root, joined], {stdio: 'inherit'});
if (lay.status !== 0) { console.error('free-ai-local shim: could not lay the tree through the layout map'); process.exit(lay.status || 1); }
const run = spawnSync(process.execPath, [path.join(joined, 'jobs/persona-search/free-ai-local.mjs'), ...process.argv.slice(2)], {stdio: 'inherit'});
fs.rmSync(joined, {recursive: true, force: true});
process.exit(run.status ?? 1);
