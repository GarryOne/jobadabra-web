# E2E green trend: the card, then fresh data (31 Oct 2026)

> **Verdict:** two PRs. The owner asked for the e2e green/stability trend on `/admin/operations/e2e` ("Do we have such a graph that shows the trend of our e2e green/stability ... ?"), then chose to start the collector from the Worker.

| PR | What | Owner's answer |
|---|---|---|
| 1/2 | "Green runs per day" card: % of finished runs green per day and kind, last 2 days vs the 7 days before (#239) | "Approved as shown (Recommended)" |
| 2/2 | `e2e-intel.yml` started hourly (UTC :40) from the Worker's existing every-5-minutes trigger; GitHub's `41 * * * *` stays as the backup | "Start it from the Worker (Recommended)" |

- Why 2/2: GitHub's schedule ran the collector a median 4.5 h apart (60 runs, 21–31 Oct), so the page's data was hours old.
- The account has 5 of 5 cron triggers: no new one; the Worker shares the every-5-minutes trigger (`shared/e2e-intel-start.js`).
- Not built: hour-level green share. The snapshot keeps whole UTC days, so the card says "last 2 days (today + yesterday)".
