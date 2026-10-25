// Keeps the media cache (~/.cache/jobadabra-media) from filling the disk: each kind of folder the media tools write keeps its newest few, older ones
// go (owner, 25 Oct 2026: "make an auto-prune of the media recordings"; 99 kept runs had filled 42 GB, the Mac down to 3.9 GB free).
// tools/hero.sh and tools/media.sh run it before they write a new one. A folder with a KEEP file and the --protect'ed ones stay; names no rule
// matches are never touched. Guard: desktop/test/media-prune.test.js.
//   node media/prune.mjs <cache> [--keep <kind>=<n>]... [--protect <dir>]...
import fs from 'node:fs';
import path from 'node:path';

// kind: what writes it; keep: how many stay, not counting the one the caller is about to write; group: rules that keep per group (a package cache
// per folder: desktop, desktop-e2e). The newest are the last written (mtime), never by name: the names are local time, and on 25 Oct 2026 the clocks
// went back an hour, so run 30's hero-20261025-022404 sorted before run 29's hero-20261025-024141.
export const RULES = [
  {kind: 'hero', match: /^hero-\d{8}-\d{6}$/, keep: 2},                       // tools/hero.sh: a 1.3-2 GB run (takes, renders, site files)
  {kind: 'preview', match: /^hero-preview-\d{8}-\d{6}$/, keep: 2},            // tools/hero.sh --preview
  {kind: 'set', match: /^set-\d{8}-\d{6}$/, keep: 2},                         // tools/media.sh: a run of the site's media
  {kind: 'log', match: /^media-\d{8}-\d{6}\.log$/, keep: 10},                 // tools/media.sh --background
  {kind: 'modules', match: /^modules-(.+)-[0-9a-f]{16}$/, keep: 2, group: m => m[1]},   // tools/media.sh: node_modules per lock file
];

// -> the removed names, in no order. keep: {kind: n} overrides a rule's count.
export function pruneCache(root, {keep = {}, protect = [], rules = RULES} = {}) {
  if (!fs.existsSync(root)) return [];
  const kept = new Set(protect.map(dir => path.resolve(dir))), names = fs.readdirSync(root), gone = [];
  for (const rule of rules) {
    const groups = new Map();
    for (const name of names) {
      const m = name.match(rule.match);
      if (!m) continue;
      const key = rule.group ? rule.group(m) : '';
      groups.set(key, [...(groups.get(key) || []), name]);
    }
    for (const list of groups.values()) {
      const at = name => fs.statSync(path.join(root, name)).mtimeMs;
      const newest = list.sort((a, b) => at(b) - at(a) || (a < b ? 1 : -1));
      for (const name of newest.slice(Math.max(0, keep[rule.kind] ?? rule.keep))) {
        const full = path.join(root, name);
        if (kept.has(full) || fs.existsSync(path.join(full, 'KEEP'))) continue;
        fs.rmSync(full, {recursive: true, force: true});
        gone.push(name);
      }
    }
  }
  return gone;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [root, ...rest] = process.argv.slice(2), keep = {}, protect = [];
  for (let i = 0; i < rest.length; i += 2) {
    if (rest[i] === '--keep') { const [kind, n] = rest[i + 1].split('='); keep[kind] = Number(n); } else if (rest[i] === '--protect' && rest[i + 1]) protect.push(rest[i + 1]);
  }
  const gone = pruneCache(root, {keep, protect});
  if (gone.length) console.error(`media: removed ${gone.length} old cache folders (${gone.slice(0, 4).join(', ')}${gone.length > 4 ? ', ...' : ''})`);
}
