#!/usr/bin/env bash
# Runs a command inside the overlaid tree (public main + this repo's files), for the tools that read the site's admin code: tools/site-run.sh node jobs/needs-fix-causes.mjs
# The overlay is rebuilt when older than an hour; set SITE_OVERLAY_FRESH=1 to rebuild now.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tree="$here/.overlay"
if [ ! -d "$tree" ] || [ -n "${SITE_OVERLAY_FRESH:-}" ] || [ -n "$(find "$tree" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then
  if [ -d "$tree" ] && [ -z "${SITE_OVERLAY_FRESH:-}" ] && pid="$("$here/tools/overlay-busy.sh" "$tree")"; then
    echo "site-run: .overlay is over an hour old, but pid $pid (tools/hero.sh or tools/media.sh) uses it: not rebuilt" >&2   # SITE_OVERLAY_FRESH=1 is refused by overlay.sh
  else "$here/tools/overlay.sh" "$tree" >&2; fi
fi
cd "$tree"
export SITE_REPO_DIR="$here"
exec "$@"
