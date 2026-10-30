# JOB-45: nightly stored-answer drift check

Owner decision, 30 Oct 2026: the Codex broker refuses call 25 in a UTC day
for this check, including failed calls and workflow reruns. The nightly
check uses 20 stored-answer prompts and up to four judges.

| PR | Repository | Change | State |
|---|---|---|---|
| 1/3 | jobadabra-web (private) | Broker caps the nightly answer-drift check at 24 calls a day | This PR; owner commits and ships |
| 2/3 | jobadabra (public) | Request file + comparer | Open (per owner brief) |
| 3/3 | jobadabra (public) | Nightly `.github/workflows/ai-answer-drift.yml` job | Not written yet |

This PR changes only private broker admission, accounting, status and
offline tests. It does not deploy or change the public repository.
