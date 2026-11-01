# GTM readiness page: how stable is each critical journey

> **Verdict:** a new page `/admin/testing/gtm-readiness` shows, per critical journey, how steadily its e2e steps (Tier 1) or integration tests (Tier 2) pass, and one gauge: "% of Tier 1 journeys stable". Measured on 1 Nov 2026: **8 of 10 Tier 1 journeys stable** (last 10 runs green and no red in the last 3 days); **J5 Apply (red 31 Oct) and J6 Full automation (red 1 Nov) are not**; all 9 Tier 2 journeys green, but with one day of history. **The site store cannot draw this today** (it keeps reds only, no greens, no per-step result); the per-step facts exist in CI artifacts, so the collector that already runs hourly in this repo must read them. Site-only: no jobadabra PR.

Owner (1 Nov 2026): "Can we have a graph, to understand how ready is GTM our app, from the critical journeys point of view. How stable are they. Then for Tier 2 actions/features…". Report only: no gate, no CI check, no beta rule.

## What the data holds (measured 1 Nov, D1 `www-stats` read-only + `gh`)
| Source | Holds | Enough for journeys? |
|---|---|---|
| `e2e_runs` (+ `e2e_fails`) | one row per run (kind, conclusion), one per **red** suite with the failing step's line (cut at 220 chars) | **No.** Only 14 of the 232 reds since 19 Oct match a registry step by name, 57 have an empty line, and a green run does not say which suites ran. |
| `e2e_snapshot.speedRuns / suiteNights` | suites that ran, for 103 of 397 after-merge runs and 20 of 57 night runs | No: partial. |
| `integration_snapshot` | per layer and run (tests, failed); the open red **files**; flaky pairs | Not per test, so not per journey. |
| **CI artifact `e2e-view-<suite>` (`steps.json`)** | every step of the suite with `passed`/`failed`, on every run, per OS (`e2e-view-windows-<suite>`) | **Yes.** 1–3 KB in current runs. |
| **CI artifact `integration-results-<layer>`** | every test: name, file, `ok` | **Yes**, and `jobs/integration-intel.mjs` already downloads it hourly. |

Two facts that shape the design:
- Runs before about 29 Oct have `e2e-view-apply` / `-interactions` artifacts of 130–170 MB (traces inside). The collector skips any `e2e-view-*` over 5 MB; history for those suites starts at the sharded runs (2 KB).
- `steps.json` cuts long step names; the registry holds the whole name. Match by prefix (60+ characters), exact match under-counts (I measured it wrong the first time: J14 showed half its steps missing).

## Measured today (14 days to 1 Nov; 99 runs read)
Runs read: 47 after-merge (1 Nov only), 44 of 46 beta (19 Oct–1 Nov), 8 of 27 `nightly`-kind (the other 19 are the AI-quality "E2E check", no steps). About 890 GitHub calls, run once by hand. A run counts for a journey when at least one of its registry steps is in the run's `steps.json`.

A run is **red for a journey** when a registry step failed, or when a suite holding one of its steps went red and a registry step was never reached (cut off). A cut-off counts only if that step had been seen in an earlier run (a step added or renamed later is not a red; this removed J1's and J14's false reds, I counted them first).

| J | Journey | Runs Mac / Win | Green 14 d Mac / Win | Last red | State |
|---|---|---|---|---|---|
| J0 | App starts, every screen draws | 74 / 41 | 100% / 100% | none | Stable |
| J1 | Set up the app | 41 / 17 | 95.1% / 100% | 29 Oct, night #40809645300 | Stable |
| J2 | Find jobs | 42 / 18 | 100% / 100% | none | Stable |
| J4 | LinkedIn (opt-in) | 11 / – | 100% / – | none | Stable |
| J5 | Apply: extension fills, you submit | 53 / 49 | 81.1% / 81.6% | 31 Oct, beta #41250138244 | **Not stable** |
| J6 | Full automation | 31 / 19 | 87.1% / 84.2% | 1 Nov, beta #41309751593 | **Not stable** |
| J7 | Apply in the hidden browser | 32 / 19 | 100% / 100% | none | Stable |
| J12 | Updates: approved builds only | 36 / 14 | 100% / 100% | none | Stable |
| J13 | Strategy change used by next check | 40 / 14 | 100% / 100% | none | Stable |
| J14 | Profile: CV read, problems found | 74 / 41 | 100% / 100% | none | Stable |
| K | Kept safety and data steps (one row) | 51 / 49 | 72.5% / 79.6% | 1 Nov, beta #41309751593 | Not stable (not in the gauge) |

- **Stable = green in its last 10 runs (both OSes pooled per run) and no red in the last 3 days.** Why the 3 days: with "last 10 runs" alone the verdict is 9 of 10, because J5 runs on every merge and 10 runs is one day; its red of 31 Oct fell out of the window while its 14-day share is still 81%. The kept row is shown but is not in the gauge (a bundle, not a journey).
- The reds are the `apply` suite: its shards run out of their budget or fail before J5/J6's later steps run (`apply-3of3` "the suite's 11-minute budget ran out", Greenhouse form "never finished filling"). The same `apply` runs make the kept row red.
- Tier 2 (60 newest `CI · Integration` runs, all on 1 Nov, all PR runs): J8, J9, J10, J11, J15, J16, J17, J18, J19 all green (968 test results matched; J9 appears in 12 runs only, the store layer ran on few PRs). **One day of history**: the Tier 2 trend fills in as the collector runs. Owner's addition (1 Nov): main counts too. On main the same tests run as the `integration` job of "CI · Tests" (`build.yml`, calls `integration.yml`) on every push, so the collector reads both; a red on a PR can be a real bug a test caught, a red on main is a break.
- Not measurable yet: the trend against the previous 14 days (Tier 1 history before 19 Oct was not read; the collector's first passes backfill 28 days).

## Behaviour
**Top:** verdict sentence (words), one gauge "Tier 1 journeys stable: 8 of 10", chips for Mac/Windows, and the date the collector last ran.

**Tier 1 table**, one row per journey (J-id, name, the Trello card where one maps), columns: state chip (Stable / Not stable / Not enough runs, icon + word), Mac and Windows green share over 14 days, a strip of the last 20 runs (green/red squares, newest right, each a link to its run), last red (date, run link, source: after merge / beta / night), trend vs the previous 14 days (`▲ ▼ =`, "–" until 28 days exist), layers that test it (link to the coverage report). Row for kept steps at the bottom.

**Tier 2 table**, one row per Tier 2 journey: tests in the registry, runs in 14 days, green share, last red, strip, same links. Footnote: PR runs and main's `integration` job.

**Links:** the Trello card of the GTM "User flows" board for the journey where one maps (proposed mapping below, the owner confirms), and the coverage report (`coverage-report.yml`, `report.json`; first run tonight) as one link per row, not rebuilt.

Proposed mapping (registry → Trello card number): J1→02, J2→08, J5→16, J6→17, J7→17, J8→14, J9→18, J10→30, J11→31, J12→33, J13→06, J14→05, J15→26, J16→22, J17→32, J18→24, J19→07. No card: J0 (smoke), J4 (LinkedIn; closest 12, not guessed), the kept row.

## Design
- **Collector** (`jobs/e2e-intel.mjs` in this repo, hourly `e2e-intel.yml`): for each finished `after-merge`, `nightly`, `beta` run, list its artifacts, download the `e2e-view-*` (and `-windows-`) of the registry's suites (under 5 MB), match the registry's Tier 1 steps, and send per run, OS and journey: `{runId, day, kind, os, journey, seen, failed, cut}`. The registry file is read from the public checkout the workflow already lays out (`desktop/e2e/critical-journeys.json`, reader `loadJourneys`). Steady state: one artifact list per new run and 2–3 KB per suite, well under the 5,000/hour limit; the first backfill is spread over three hourly passes (cap 200 runs per pass, existing).
- **Tier 2:** `jobs/integration-intel-rows.mjs` already holds every test's name, file and `ok` per run. It adds one array to its snapshot: per day and journey `{tests, runs, red}` from the registry's `{integration, test}` entries. No new download.
- **Store:** one new table `gtm_snapshot` (id 1, body) like the other single-row snapshots, written by `PUT /gtm/data` (Bearer `SELFHEAL_PUBLISH_KEY`), validated like `e2e-intel.js`. The page reads that row only. Keeps 28 days; a run is a row of about 80 bytes (about 250 KB at the busiest, under D1's row limit).
- **Files:** `admin/gtm-readiness.js` (page), `admin/gtm-readiness-data.js` (pure: runs → journey rows, stable verdict, trend), `shared/gtm-trello.js` (the mapping). One route and one menu entry (`admin/admin.js`, `workers/www/index.js`). The Testing overview session (`to`) adds a card linking here; our files are disjoint.

## Acceptance criteria
1. `/admin/testing/gtm-readiness` shows the verdict, the gauge, a Tier 1 row per journey (10 + kept) and a Tier 2 row per journey (9), behind the admin guard, light and dark.
2. Numbers equal a hand count on a fixed fixture (test): green share, last 10, last red, stable verdict, trend; a cut-off counts only for a step seen earlier.
3. A step name cut in `steps.json` is matched to its registry step (test with a 150-character name).
4. An artifact over 5 MB is skipped, not downloaded (test); a run with no artifacts is "no data", not green.
5. No AI call, no new CI check, no gate; collector failures name the cause and leave the last snapshot in place.
6. File sizes under 500 lines; boundary test passes.

## Non-goals
- No beta or merge gate from this page. No new suite or test. No Trello write (links only). No rebuild of the coverage report.
- Not a per-step page (the e2e and integration pages stay the place for causes).
- No ranking of journeys by priority; the Trello board owns priority.

## Open for the owner
1. Stable = last 10 runs green and no red in 3 days: keep both numbers? (10 runs alone gives 9 of 10 today; 3 days alone gives 8 of 10 as well. The page shows one rule.)
2. The Trello mapping above (J4 LinkedIn has no card).
3. Kept steps: one row, outside the gauge (proposed).

## Progress
- [x] Measured (1 Nov): store audit, 99 Tier 1 runs, 60 Tier 2 runs.
- [x] Spec.
- [x] Preview on real numbers; owner's yes 1 Nov ("Yes, ship it"), rule as shown, plus main's integration runs counted.
- [ ] PR 1/2: store, ingest, page, route, menu entry, tests (site).
- [ ] PR 2/2: collector reads steps and Tier 2 tests, PR and main runs (this repo, `jobs/`, a step in `e2e-intel.yml`).
