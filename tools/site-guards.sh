#!/usr/bin/env bash
# Runs, inside the joined tree, (1) the public repo's tests that read site files (they skip in the public repo, where site/ is absent) and (2) the tests that live in this repo.
# A public test joins by using tests/site_private.py (python) or desktop/test/site-private.js (node); three node files that read site/ without it are named below.
# Usage: tools/site-guards.sh <tree> [<this-repo-dir>]
set -euo pipefail
tree="${1:-.}"; priv="${2:-$tree}"
priv="$(cd "$priv" && pwd)"
export SITE_REPO_DIR="$priv"   # tests that must read only this repo's own files (tests/test_site_workflow_pipefail.py)
cd "$tree"
status=0
# A test of this repo at the path of a public test REPLACES it in the joined tree and then runs against both repos' files (24 Oct 2026: tests/test_workflow_pipefail.py hid the public one and failed on its workflows). Same path = fail.
public_tree="$PWD"
shadowed="$(cd "$priv" && git ls-files tests desktop/test desktop/e2e/test test 2>/dev/null | while read -r file; do if git -C "$public_tree" cat-file -e "HEAD:$file" 2>/dev/null; then echo "$file"; fi; done)"
if [ -n "$shadowed" ]; then echo "::error::these tests of this repo have the path of a public test and would replace it (rename them site_*): $shadowed"; status=1; fi
# Names are split by repo (public docs/site-test-names.json): every test here carries the site's prefix, so no public test can take its path later.
node "$priv/tools/site-test-names.mjs" "$public_tree" "$priv" || status=1
python_files="$( { grep -l "needs_site" tests/*.py | grep -v site_private.py; (cd "$priv" && ls tests/test_*.py 2>/dev/null); } | sort -u)"
for file in $python_files; do
  python3 -m unittest discover -s tests -p "$(basename "$file")" || status=1
done
cd desktop
[ -d node_modules ] || ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --silent
node scripts/stage.mjs >/dev/null
node_files="$( { grep -l "site-private.js" test/*.test.js | grep -v '^test/site-private'; (cd "$priv/desktop" && ls test/*.test.js 2>/dev/null); echo test/plan.test.js; echo test/no-credit-words.test.js; echo test/no-question-mark.test.js; echo test/cost-labels.test.js; } | sort -u | tr '\n' ' ')"
# A pull request that changes no media file skips the media tests and their ffmpeg/Electron installs (tests.yml "Does this PR touch media?",
# 26 Oct 2026: a stalled Ubuntu mirror failed a migration-only PR 4 times). Pushes to main and the daily run always run them, never skipped.
if [ "${MEDIA_TOOLS:-1}" = 0 ]; then
  skipped="$(printf '%s\n' $node_files | grep '^test/media-' | tr '\n' ' ')"
  node_files="$(printf '%s\n' $node_files | grep -v '^test/media-' | tr '\n' ' ')"
  echo "site-guards: this pull request changes no media file: media tests not run here (main and the daily run run them): $skipped"
fi
# shellcheck disable=SC2086
node --test $node_files || status=1
exit $status
