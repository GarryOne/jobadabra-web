# Test coverage card on /admin/testing/integrations

Owner, 1 Nov 2026, via a8: "A card on Integrations" (preview approved: "yes", 19:09 UTC). Report only: no gate, no required check, no target.

## Verdict
🟢 One PR in this repo. The private site pulls the public repo's nightly `coverage-report` artifact; nothing in the public repo changes (no uploader, no contract pin).

## What the card shows
- Four tiles: Unit Python, Unit JS, Integration, E2E: line % and covered/total lines; "not measured tonight" when a source was missing, never 0%.
- A folder × layer table with a thin bar per cell ("n/a" where a layer cannot see a folder).
- "N of 38 GTM journeys have a test", counts per layer, and a collapsed list of every journey, untested first.
- A trend ("+N pts vs <day>") from the second night on.

## Ingest (the page's own path, no second one)
`jobs/integration-intel.mjs` (hourly, `integration-intel.yml`) pulls public CI artifacts with `gh` and PUTs ONE snapshot to `/integration/data` (D1 `integration_snapshot`, id 1). It reads one more artifact, `coverage-report` (report.json of `tools/coverage-report.mjs`, public repo), once per run id, through `jobs/coverage-intel.mjs`; `admin/coverage-intel.js` validates it as the snapshot's `coverage`. None, expired or unreadable keeps what is stored. No migration, route, secret or schedule.

## Not built (parked unless asked)
A coverage trend chart over weeks, a per-file drill-down, a target line per layer.

## Progress
- [x] 1/1 the coverage section, its reader and tests (`a8-coverage-card`)
