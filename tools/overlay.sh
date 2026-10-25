#!/usr/bin/env bash
# Builds the full tree this repo is tested and deployed in: the public job-pilotto repo (main) with this repo's files laid over it at the same paths.
# Usage: tools/overlay.sh <out-dir> [public-ref]; tools/overlay.sh --sync <out-dir> lays this repo's current files over a built tree again (site-run.sh). The site imports the public repo's validators (../../extension/...), so it only runs inside that tree.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# this repo's files over the tree; tests that list files with `git ls-files` must see them too
lay() {
  rsync -a --exclude '.git' --exclude '.overlay/' --exclude 'node_modules/' --exclude '.gitignore' --exclude 'README.md' --exclude 'CLAUDE.md' --exclude 'AGENTS.md' --exclude '.claude/' --exclude '.public-*' "$here"/ "$1"/
  (cd "$1" && git ls-files -o --exclude-standard -z | xargs -0 -n 500 git add -N --)
}
if [ "${1:-}" = --sync ]; then lay "${2:?usage: tools/overlay.sh --sync <out-dir>}"; exit 0; fi
out="${1:?usage: tools/overlay.sh <out-dir> [public-ref]}"
ref="${2:-main}"
# never under a running hero.sh/media.sh (tools/overlay-busy.sh)
if pid="$("$here/tools/overlay-busy.sh" "$out")"; then echo "overlay: $out is in use by pid $pid (tools/hero.sh or tools/media.sh): not rebuilt; wait for it to end, or work in another worktree" >&2; exit 3; fi
rm -rf "$out"
git clone --quiet --depth 1 --branch "$ref" "${PUBLIC_REPO_URL:-https://github.com/GarryOne/jobadabra.git}" "$out"
lay "$out"
echo "overlay: $(git -C "$out" rev-parse --short HEAD) of job-pilotto/$ref + $(git -C "$here" rev-parse --short HEAD 2>/dev/null || echo local) of jobadabra-web -> $out"
