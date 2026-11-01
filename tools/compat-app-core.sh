#!/usr/bin/env bash
# Lets a public tree built before the move answer to the new folder name: usage tools/compat-app-core.sh <tree>
# Why (1 Nov 2026, rs, owner: jobadabra is desktop + extension only): the public repo moves worker/src to app-core/src (spec 2026-11-01-desktop-extension-only.md in the public repo).
# This repo reads app-core/src; until the move is on the public main (or on a ref built before it) the old folder answers to the new name. Delete this file and its two callers
# (tools/tree.sh, tools/overlay.sh) once the move has landed.
set -euo pipefail
tree="${1:?usage: tools/compat-app-core.sh <tree>}"
if [ ! -e "$tree/app-core/src" ] && [ -d "$tree/worker/src" ]; then mkdir -p "$tree/app-core" && ln -s ../worker/src "$tree/app-core/src"; fi
