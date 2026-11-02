# Top-level layout: 15 folders to 9 (owner, 2 Nov 2026)

Owner: "I should clearly see separated top level: admin, api, website, workers... and just a few others, grouped, not 20 other folders". Answered "9 folders": `admin api website workers shared ops test tools docs`.

**Design:** the repo root is for people, the joined tree (public repo + this one) is for code. `tools/layout-map.txt` maps each tidy folder to the path the code expects; `tools/lay-private.sh` applies it. Nothing that runs in the joined tree changes its paths; only what reads the raw repo (deploy `paths:` filters, the hero and media tools, docs) is edited. No public-repo change.

## Progress
- [x] 1/3 `website/` (web, preview as `website/next`) + the map and `lay-private.sh`
- [ ] 2/3 `ops/` (jobs, hosted, media, db): map lines and the raw-path edits (workflows' `paths:`, tools that read the raw repo) (this PR, rn-layout-ops)
- [ ] 3/3 `test/` (tests, desktop/test as `test/public-tree/...`): map lines, site-guards.sh, tests.yml
- [x] 0 delete the next and old websites (#315, merged; Worker `next` deleted)

## Before each PR (lesson from #314, 2 Nov 2026: `test/web/hero-redo.test.js` reads the raw skill doc and the joined-tree file)
Tests that read a RAW file (skill, README, workflow, tools) see the new name; tests that read a joined-tree path see the old one. Before pushing, `git grep -l` each moved folder's name in `test/` and `tests/`, and run every file it finds by name in the joined tree (`SITE_OVERLAY_FRESH=1 tools/site-run.sh node --test <files>`).

**Raw mode (lesson from #318, 2 Nov 2026: `tests/test_site_no_anthropic.py` read `ROOT / 'jobs'` on CI's raw checkout, green in the joined tree).** A test that reads this repo's own files (`.private`, `SITE_REPO_DIR`, `ls-files`) sees the NEW names in CI. Find them by the folder NAME, not `name/` (`git grep -lE "\.private|SITE_REPO_DIR|ls-files" -- tests test desktop/test`, then each file's `'jobs'`, `/ 'media'`, `path.join(..., 'db')`), and run each Python one twice: from the worktree (`python3 -m unittest tests.<name>`, raw, as CI) and through `tools/site-run.sh` (joined tree).
