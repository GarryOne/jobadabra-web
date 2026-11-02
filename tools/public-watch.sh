#!/usr/bin/env bash
# Prints "changed" when the public files a deploy bundles or builds from differ from the last deploy's record (.public-<name>), else "same".
# Usage: tools/public-watch.sh <tree> <name> <path>...   (the tree is the overlay; the watch workflow commits the record to the branch public-watch-state)
# The record lives in $PUBLIC_WATCH_STATE (the workflow's checkout of that branch); unset, it is this repo's root (tools/media.sh keeps .public-media there, changed only through a PR).
set -euo pipefail
tree="$1"; name="$2"; shift 2
sha() { if command -v sha256sum >/dev/null; then sha256sum; else shasum -a 256; fi; }   # macOS has only shasum
now="$(git -C "$tree" ls-tree -r HEAD -- "$@" | sha | cut -c1-16)"
record="${PUBLIC_WATCH_STATE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/.public-$name"
[ "$(cat "$record" 2>/dev/null || true)" = "$now" ] && echo same || { echo "$now" > "$record"; echo changed; }
