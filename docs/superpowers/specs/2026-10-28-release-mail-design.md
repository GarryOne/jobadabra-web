# Release mail: "What's new" to our users at each stable release

> **Verdict:** at each stable promotion the site builds a held draft from that version's What's new entry; the owner reviews it on /admin/email and clicks "Send to everyone". Sender: **Igor from Jobadabra**.

## Decisions (owner, 28 Oct 2026)
| Question | Answer |
|---|---|
| Audience | Every address we hold that has not turned promotional mail off: `pro_accounts.email` (trial, Always on, Pro) + KV `signup:<email>` (waitlist). Measured 28 Oct: 5 accounts, 1 waitlist signup, 0 unsubscribed. |
| Consent | Opt-out. Joining the waitlist or giving an address in the wizard counts as agreeing to product news ("a user who puts himself on the waiting list is considered as wanting promotional emails"). `marketing_opt_in` stops gating; `mail_off` (list marketing/all) and the new `pro_accounts.marketing_off_at` do. |
| Switch | `MARKETING_MAIL=on` is turned on by the owner (his 28 Oct yes); the first real send is still his click only. |
| Unsubscribe | The footer of **every** promotional mail carries the one-click "stop" link + the `List-Unsubscribe` headers (already added by `shared/mail.js` for any non-essential template). A test loops over every `marketing` template and fails if one lacks it. |
| Content | The CI-written `changelog_entries` row for the version (first change = headline). Owner edits the headline in the draft. |
| Trigger | `release-stable.sh` / `canary-promote.yml` call the site once with the version; idempotent per version (`release_mail` row, primary key version). |
| Sender | `Igor from Jobadabra <news@jobadabra.top>`. |

## Pieces
1. `shared/mail-templates.js`: template `release` (list marketing), our mail frame, numbered sections, pills, update button.
2. `db/migrations/0105_release_mail.sql`: `release_mail(version PK, status draft|sent, headline, created_at, sent_at, sent_count)`; `pro_accounts.marketing_off_at`.
3. `admin/release-mail.js`: draft from changelog, list on /admin/email, "Send test", "Send to everyone" (batches under the 3000/day cap and 6/day/address).
4. `api/release-mail-ingest.js`: the promotion call (Bearer key), idempotent.
5. Tests: renders; unsubscribed/bounced get nothing; one version never twice; fake promotion; every marketing template has the stop link; MAIL off in tests.

## Open risk
Unconfirmed wizard addresses may be mistyped; bounces and complaints suppress automatically (`mail_off`). Audience may be tightened to confirmed addresses if the owner prefers.
