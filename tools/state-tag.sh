#!/usr/bin/env bash
# State a workflow keeps between runs lives under a git TAG, never a branch (owner, 2 Nov 2026: "let's use tags not branches for storing things. Otherwise, they keep popping up like that":
# GitHub shows "<branch> had recent pushes · Compare & pull request" on the repo page for every branch a workflow pushes). Same file in jobadabra-web and jobadabra-benchmarks.
#   tools/state-tag.sh read  <tag> <dir>                       fetch +refs/tags/<tag> and check it out, detached, into the worktree <dir>
#   tools/state-tag.sh write <tag> <dir> <message> <path>...   commit <path>... in <dir> and move the tag to it with a compare-and-swap; run in a clone of the repo
# The swap: `git push --force-with-lease=refs/tags/<tag>:<sha read>` moves the tag only if nobody moved it since this run read it. On a reject (another writer, e.g. two workflows
# writing one tag) the commit is cherry-picked onto the tag's new head and pushed again; a plain `push -f` would drop the other writer's round. A cherry-pick conflict (both changed one file)
# fails the step: it is never resolved by dropping a side; an identical change by both is simply done. A missing tag fails loudly: a tag is seeded once from the old branch, never created by a run
# that lost it. Until the old branch of the same name is deleted, read and write refuse (loudly) when that branch holds state the tag lacks, e.g. an old workflow pushed after the seed (Gitar on benchmarks#17).
set -euo pipefail
cmd="${1:?usage: tools/state-tag.sh read|write <tag> <dir> ...}"; tag="${2:?tag}"; dir="${3:?dir}"; shift 3
ref="refs/tags/$tag"
ident=(-c user.name=github-actions -c user.email=github-actions@users.noreply.github.com)
old_branch_guard() {   # Why (2 Nov 2026, Gitar on benchmarks#17): the tag is seeded from the old branch before the workflows switch; state pushed there in between must not be dropped silently
  local b t
  b="$(git ls-remote --heads origin "refs/heads/$tag" | cut -f1)"
  [ -n "$b" ] || return 0
  t="$(git ls-remote origin "$ref" | cut -f1)"
  git fetch -q origin "$b" "$t"
  git merge-base --is-ancestor "$b" "$t" && return 0
  echo "state-tag: the old branch $tag ($b) has state the tag lacks (pushed after the seed); nothing was read or written. If the tag head ($t) is its ancestor, move the tag: git push --force-with-lease=$ref:$t origin $b:$ref" >&2
  return 1
}
case "$cmd" in
  read)
    git fetch -q origin "+$ref:$ref"
    old_branch_guard
    git worktree add -q --detach "$dir" "$ref"
    ;;
  write)
    msg="${1:?message}"; shift
    [ $# -gt 0 ] || { echo "state-tag: no path to record" >&2; exit 2; }
    cd "$dir"
    old_branch_guard
    read_sha="$(git rev-parse HEAD)"
    git add -- "$@"
    if git diff --cached --quiet; then echo "state-tag: nothing new to record in $tag"; exit 0; fi
    git "${ident[@]}" commit -q -m "$msg"
    for try in 1 2 3 4 5; do
      # Why (2 Nov 2026, owner): the lease names the commit this run read; a tag another writer moved is rejected, not overwritten.
      if git push -q --force-with-lease="$ref:$read_sha" origin "HEAD:$ref"; then
        echo "state-tag: $tag ${read_sha:0:7} -> $(git rev-parse --short HEAD)"; exit 0
      fi
      echo "state-tag: $tag was moved by another writer; re-applying on its head (try $try)" >&2
      ours="$(git rev-parse HEAD)"
      git fetch -q origin "+$ref:$ref"
      git reset -q --hard "$ref"
      read_sha="$(git rev-parse HEAD)"
      if git diff --quiet "$ours" HEAD -- "$@"; then echo "state-tag: $tag already holds this round (recorded by another writer)"; exit 0; fi   # Why (2 Nov 2026, Gitar on #319): an identical change is done, not a conflict; its cherry-pick would be empty
      git "${ident[@]}" cherry-pick "$ours" >/dev/null || { git cherry-pick --abort 2>/dev/null || true; echo "state-tag: both writers changed the same file in $tag; not resolved by dropping one" >&2; exit 1; }
      sleep "$try"
    done
    echo "state-tag: $tag still contested after 5 tries" >&2; exit 1
    ;;
  *) echo "state-tag: unknown command $cmd" >&2; exit 2 ;;
esac
