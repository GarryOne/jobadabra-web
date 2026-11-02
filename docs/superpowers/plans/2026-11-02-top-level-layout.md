# Top-level layout: 15 folders to 9 (owner, 2 Nov 2026)

Owner: "I should clearly see separated top level: admin, api, website, workers... and just a few others, grouped, not 20 other folders". Answered "9 folders": `admin api website workers shared ops test tools docs`.

**Design:** the repo root is for people, the joined tree (public repo + this one) is for code. `tools/layout-map.txt` maps each tidy folder to the path the code expects; `tools/lay-private.sh` applies it. Nothing that runs in the joined tree changes its paths; only what reads the raw repo (deploy `paths:` filters, the hero and media tools, docs) is edited. No public-repo change.

## Progress
- [ ] 1/3 `website/` (web, preview as `website/next`) + the map and `lay-private.sh`
- [ ] 2/3 `ops/` (jobs, hosted, media, db): map lines and the raw-path edits (workflows' `paths:`, tools that read the raw repo)
- [ ] 3/3 `test/` (tests, desktop/test as `test/public-tree/...`): map lines, site-guards.sh, tests.yml
