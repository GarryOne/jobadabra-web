# Synthetic monitoring (`/admin/testing/overview` card "Synthetic monitoring")

> **Verdict:** every 15 minutes the site Worker asks its own public services one question each and checks the answer says what a working service says (not only HTTP 200). Each answer is one D1 row; two reds in a row tell the owner on Telegram once, the first green tells "back". **Report only:** nothing blocks a merge or a beta.

Owner, 1 Nov 2026: "What other methods of testing we can add… Maybe Synthetic Testing"; picked from the sketch (§3) as report-only. Session `nm`, coordinator mac-07, Overview card builder `to` (jobadabra-web-b4).

## Problem
A broken service (index pack empty, update feed 502, Free AI key check refused, the site serving an error page with 200) is found today by a user, a Sentry spike or a red e2e. Nothing asks the live services "are you working?" between releases.

## Design (states, owner of each, what changes them)

| Thing | Owner (one writer) | Changes when |
|---|---|---|
| A probe result `{probe, at, ok, ms, reason}` | `shared/synthetic.js` `runRound`, called by the Worker's `*/5` tick on minutes 5, 20, 35, 50 | each round (every 15 min) |
| Probe state `up` / `down` (+ since, told_at) | `shared/synthetic.js` `settle`, table `synthetic_state` | `down` after **2 reds in a row**; `up` on the first green |
| The alert | `shared/synthetic.js` `tell`, via the existing Sentry Telegram bot (`SENTRY_TELEGRAM_TOKEN` / `_CHAT`, as `admin/sentry-alert.js`) | on the `up→down` and `down→up` changes only, never per red |
| The card's data | `shared/synthetic.js` `readCard` (read-only; `to` draws it) | reads the newest row per probe |
| "Last round at" for outsiders | `GET /api/synthetic/last` → `{at}` only (no names, no reasons) | the newest row |

**Where it runs (Why, 1 Nov 2026, nm; recommended to mac-07):** in the site Worker (`workers/www`), not the public bot Worker. The site Worker already has the `*/5` trigger (the account's 5 of 5 are used, `shared/intel-start.js`), D1 `STATS`, the Telegram alert pattern with D1 state, and every service. The bot Worker has no D1 and would need a new publish-key secret. Weakness taken on purpose: if the whole site Worker is dead no round runs; the card then goes red on "no round for 45 minutes". An outside check of that is parked.

**Probes** (public URLs on the aliases the apps call: `jobadabra.top` for the page, the `workers.dev` host for the API paths; 10 s timeout each; every probe is positive, i.e. checks content):

| Probe | Request | Counts as up when |
|---|---|---|
| `site` | `GET /` | 200 and the page title contains "Jobadabra" |
| `index` | `GET /api/index?summary=1` (public, no token) | 200, JSON `{employers, jobs}` both above 0 (the full list needs a token and a daily quota, so it is not probed) |
| `license` | `GET /api/pro/status` with the probe's `ai` key | 200, `ok: true` and `plan` free or pro |
| `free-ai` | `GET /api/ai/v1/models` and `GET /api/ai/caps` with the probe's `ai` key | models has a `data` list; caps `ok: true` and a `lane` (no AI call, so no AI cost) |
| `updates` | `GET /api/releases/latest` | 200, a `tag_name` with a version, and a `.dmg` and an `.exe` asset |
| `broker` | the `AI_BROKER` service binding `/health` (as `admin/jobcost.js readFallback`) | 200 and the day meters present (a day and a numeric cap); skipped where the binding is absent |

**No new secret, no user data.** The probe identity is one fixed install id `synthetic-probe`; its tokens are computed in the Worker with `tokenFor` (`shared/guard.js`, a deterministic HMAC of the secret it already holds), so nothing is minted, no mint counter moves and no row is created per round. No request carries a profile, CV, key or cookie. A signed licence key needs the owner's private key, so the `license` probe asks the plan route with the probe install and says so on the card: it proves the licence route and its Pro-status logic answer, not signature checking.

**Storage:** migration `db/migrations/0123_synthetic.sql`: `synthetic_probes(probe, at, ok, ms, reason, PRIMARY KEY (probe, at))` and `synthetic_state(probe PRIMARY KEY, state, since, red_since, streak, reason, told)`; `told = 0` marks a change Telegram has not carried yet, so a failed send is retried next round. Daily purge of rows older than 30 days (the daily cron already purges other tables). One round writes 6 rows (about 17k a month).

**Data shape for the Overview card (to read):** `readCard(env, now)` → `{lastRoundAt, stale, probes: [{probe, ok, at, ms, reason, state, since, uptime24h}]}`; `stale` when no round for 45 min; `uptime24h` = ok rows / rows in the last 24 h. For the 14-day health map: `readDays(env, 14, now)` → `[{day, state: 'green' | 'red' | 'none'}]`, oldest first, ending today (UTC); red = a probe red in two rounds in a row that day (the alert's rule), none = no rows that day (rows are kept 30 days).

**Risk, decided by the first real round (acceptance 5):** a Worker fetching its own public URL can be refused by Cloudflare (error 1042, same-zone Worker-to-Worker). If the first round is red on `unreachable` for every probe, the fix is a self service binding in `wrangler.toml` and the fetcher through it; the heartbeat below keeps the outside view either way.

**Outside heartbeat: dropped (owner, 1 Nov 2026: "SRE Job Pilotto Worker is an old telegram bot which should be decommissioned" → timers to the site Worker, delete the bot).** It was to live in the bot Worker, which is going away. The outside check that stays is the hourly `schedule-watchdog.yml` on GitHub's own cron (jobadabra #2895): it already catches the site Worker's timers stopping, and it now also reads `/api/synthetic/last` and files a line in its issue when the newest probe round is older than 45 min.

**Reason text** is short and fixed-form (`HTTP 502`, `no employers in the list`, `timeout 10s`); never a response body.

## Acceptance
1. A unit test per probe: a good answer is up; HTTP 200 with the wrong content is down (the `site` probe on an error page with 200; `index` with an empty list); a timeout is down.
2. State test: one red → still `up`, no message; two reds → `down`, exactly one message; a third red → no second message; first green → `up` and one "back" message; Telegram failing never throws or loses the row.
3. The tick test: a round starts only on minutes 5/20/35/50; other ticks do nothing; a failing probe never fails the tick (the other crons on that tick still run).
4. Class test: every probe in the list has a card line, a reason form and a test case (loops the list).
5. After deploy: a real round writes 6 rows within 15 minutes (read from D1; run id in the PR).

## Non-goals
Blocking anything; probing from outside Cloudflare (parked); a signed-licence check; calling the AI; uptime SLAs/history charts beyond the 24 h figure; probing the app or its extension (other items).

## Progress
- [x] Read the history (`git log -S synthetic`: only the planned card), the Worker, the alert pattern, the Overview model
- [x] Coordinator OK on "site Worker, not bot Worker" (mac-07, 1 Nov)
- [x] Code and tests: `shared/synthetic.js`, migration, tick wiring, `/api/synthetic/last`, `test/shared/synthetic.test.js` (10 tests)
- [ ] PR A `[nm] 1/3 Synthetic monitoring: probes, rows, alert` (this repo)
- [x] PR B `[nm] 1/3 Outside heartbeat of the probes`: dropped, replaced by the watchdog's stale-round line (jobadabra #2895, merged 1 Nov 2026)
- [ ] PR C `[nm] 1/3 Start schedules-snapshot hourly from the Worker` (public bot Worker; mac-07 asked, 1 Nov)
- [ ] Tell `to` the data shape (above) so the planned card fills
- [ ] Deployed; first real round seen in D1
- [ ] Merged
