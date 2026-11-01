# AI broker: Claude, Codex or Free AI by one flag — 1 November 2026

> **Verdict:** `codex-broker` becomes `ai-broker`, **Worker included** (owner, 1 Nov 2026: "No, rename the Worker too"). One line, `ENGINE=codex|claude|free-ai`, in the broker's config says who answers first; the others answer only when it runs out. The Codex login moves with the Durable Object by a **Cloudflare namespace transfer**, proven on a throwaway pair first. Callers keep working through the old address and old OIDC audience until they have moved.

Owner (1 Nov 2026): "Let's change the codex-broker to ai-broker, and support claude, codex, or Free AI (cloudFlare Workers AI) with just a flag change". Picks: Claude on **"Your Claude subscription"** (Claude Code in the container, $0 API); flag **"Primary engine, others fall back"**.

## What changes for whom
| Who | Before | After |
|---|---|---|
| Owner | Changing the engine = code change | One config line + deploy (`ENGINE`) |
| CI / jobs | Codex → Claude API → Free AI, fixed | Same callers, same request; the chain starts at `ENGINE` |
| Admin / Telegram / Synthetic Monitoring | "Codex broker", "CI fallback" | "AI broker", the engine that answered each call |

## 1. Rename without losing the login
- **Fact (Cloudflare docs, Durable Object class exports/migrations):** a Durable Object namespace belongs to one Worker script, so a plain rename of `jobadabra-codex-broker` would start an empty namespace and lose the login. Cloudflare has a documented **transfer** to another Worker in the same account (`transferred_classes` in legacy migrations; `expecting-transfer` / `transferred` in `exports`), and a Container can be attached to the incoming class. Today's Worker uses legacy `migrations` (tag `v1`).
- **Target:** Worker `jobadabra-ai-broker`, class `AiBroker` (a rename inside the new Worker costs nothing; the old class name `CodexBroker` exists only in the transfer's `from`), folder `workers/ai-broker/`, tests `test/ai-broker/`, workflow `release-ai-broker.yml`, binding `AI_BROKER` in `www`, address `jobadabra-ai-broker.jobpilotto.workers.dev`.
- **Step 0 — prove it on a throwaway pair** (`ab-proof-src`, `ab-proof-dst`; tiny Container class, one stored key): transfer the class with its Container, read the key back from the destination, learn what the old Worker needs afterwards (a `deleted_classes` step? can it be redeployed as a plain forwarder?), delete both. Result written into this spec before the live step. Docs do not say what happens to the *source's Container application*; the proof must show it.
- **Live step (one deploy, by hand, `workflow_dispatch` only; hour named by a8, never 21:00–05:30 UTC):** deploy `jobadabra-ai-broker` with the transfer migration. Check `/health` says `ready` (login present) and one smoke call from the Mac (`/admin/call`) answers. `release-ai-broker.yml` has **no push trigger** until this has happened, so merging the PR cannot run the transfer by accident.
- **Old address kept:** `jobadabra-codex-broker` is redeployed as a ~20-line forwarder to `AI_BROKER` (service binding) so `jobadabra-codex-broker.jobpilotto.workers.dev/call` keeps answering (the run token travels unchanged). Removed in the last PR once the callers (grep both repos) have moved.
- **OIDC audience:** the Worker accepts `jobadabra-ai-broker` and `jobadabra-codex-broker` until the public client moves; the old one is removed in the last PR.
- **Rollback:** a transfer can be transferred back; the fallback of last resort is a fresh `codex login` on the Mac and `/admin/login` (an owner step, minutes). Not an automatic path, so the live step is not run without the owner's presence.
- **Order of merges:** web side first (2/7 adds the new Worker and alias, dispatch-only), then the live step, then the public client (6/7), then cleanup (7/7).

## 2. Engines and the flag
| Engine | Runs on | Money | "Ran out" means |
|---|---|---|---|
| `codex` | Codex CLI, owner's ChatGPT login (today) | $0 | own-share/week brake or a usage-limit error (today's rule) |
| `claude` | Claude Code CLI in the container, owner's Claude subscription token | $0 | Claude's "limit reached" answer; plus the broker's own per-day call count |
| `claude-api` | Anthropic Messages API (today's fallback) | up to $5/day | the $5 UTC-day cap |
| `free-ai` | Workers AI | up to $2/day | the $2 UTC-day cap |

- `ENGINE` (non-secret `vars` in `wrangler.jsonc`) names the first engine. The rest follow in a fixed order after it: `codex, claude, claude-api, free-ai`. Example: `ENGINE=claude` → claude, codex, claude-api, free-ai. Unset or unknown = `codex` (today's behaviour), and an unknown value is refused loudly in `/health`, never guessed.
- Subscriptions come before paid engines, paid before capped-free. A step is skipped, not failed, when it is not configured (no token, no key, no AI binding).
- Only "ran out" and "not configured" move to the next engine. A bad request, a token-shaped reply, a lost login and the daily drift cap keep today's refusal: another engine cannot bypass a control. Search requests are answered only by engines that support them (`codex`; `claude` with its web tool is a follow-up, today they go grey on the others).
- Every answer carries `engine`; `/health` lists `engine` (configured), `chain`, and per-engine state/day counts; the admin AI cost page and the Telegram notes name the engine.

## 3. Claude engine on the subscription
- Container gets the Claude Code CLI next to Codex. Per call: `claude -p --output-format json --model <haiku|sonnet|opus> --tools "" --no-session-persistence`, empty temp dir, stdin closed, same unprivileged user, 100 s kill timer. Tiers map small/mid/large → `claude-haiku-5-5` / `claude-sonnet-5-5` / `claude-opus-5-5` (`shared/pro-claude.js`).
- Auth: the owner runs `claude setup-token` once; the value is the Worker secret `CLAUDE_CODE_OAUTH_TOKEN` (Keychain `job-pilotto.ai-broker.claude_oauth_token`, the repo's `job-pilotto.*` namespace), passed to the container as an env var by the Container class. It never goes to the image, a reply or a log.
- Deny-by-default hosts: add `api.anthropic.com` (measured in the first container run; telemetry off with `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, so nothing else is allowed unless a measured failure names it).
- Schema: `--json-schema`; images: base64 content blocks over `--input-format stream-json` so the CLI needs **no file-reading tool** (a Read tool could read the Codex login file in the same container; the Codex path has the same exposure and is covered by the reply guard, `lib/guard.mjs`).
- Limits: a subscription has no dollars, but it is **shared with the owner's own Claude Code use**. The broker counts calls per UTC day per engine (`/health`) and refuses past `CLAUDE_SUB_DAY_CALLS` if set; default unset (= "CI can use up to 100%", as for Codex). Decision below.
- The login-lost equivalent: an auth error from the CLI marks `claude` as "token-invalid" (health + one Telegram note) and the chain moves on.
- **Unmeasured, to settle in the Claude-engine PR with a throwaway container call (the owner's token, one tiny call):** exact "limit reached" wording, whether `--bare` accepts an OAuth token, usage fields in the JSON, image blocks over stream-json. Until measured they are hypotheses, and the code treats an unknown failure as "failed", not "ran out".

## 4. Decisions (all made, 1 Nov 2026)
1. **Decided (owner, 1 Nov 2026): rename the Worker too.** Therefore the namespace transfer in section 1; its risk is a possible re-login (owner step).
2. **Decided (owner, 1 Nov 2026): the paid Claude API stays**, $5/day as today, after the subscription engines.
3. **Decided (owner, 1 Nov 2026): no cap on the Claude subscription at first**; watch the daily count in `/health` for a week, then decide.

## 5. Acceptance
1. For each `ENGINE` (`codex`, `claude`, `free-ai`) with fakes: the first engine answers; when it reports "ran out" the next in order answers; a non-exhaustion error does not move on; the reply names the engine. No real provider in any test.
2. A request with no `ENGINE` behaves exactly as today (existing tests unchanged and green).
3. `/health` shows the engine, the chain and per-engine day counts, without any secret.
4. Old address and old audience still work until the cleanup PR; a test sends both.
5. The login survives: after the live transfer `/health` reads `ready` and a smoke call answers; the throwaway proof (step 0) shows a stored key read back first.

## 6. Plan (one PR each, `[ab] n/N`, web first)
1. **1/7 This spec.**
2. **2/7 Rename (web):** step 0 proof on the throwaway pair, then folder, tests, workflow (dispatch-only), `AI_BROKER` binding (`www` + admin + probe + seeds), labels, second audience, the old-name forwarder. Live step after merge, with the owner present.
3. **3/7 Engine chain + `ENGINE` flag** over today's three engines (`lib/engines.mjs`), `engine` in replies and `/health`, tests for all 3 settings.
4. **4/7 Claude subscription engine:** container, hosts, tier map, token secret, throwaway-call measurements recorded in the spec.
5. **5/7 Admin cost page, Telegram notes and the Synthetic Monitoring probe** name the engine.
6. **6/7 Public repo:** `broker-client.mjs` audience and URL, labels in `ai-cap.mjs` and workflows (lands after 2/7 is deployed).
7. **7/7 Cleanup:** remove the old audience and the forwarder once no caller uses them; give `release-ai-broker.yml` its push trigger. Then the `ENGINE` switch (hour named by a8, not 21:00–05:30 UTC). The per-`ENGINE` unit tests (fakes only) run inside the existing broker test step: no new matrix or schedule. The live proof is three one-off manual runs of one existing small CI job, one per `ENGINE` value (a few minutes each, ~15 Actions minutes once, nothing recurring), reported to mac-07.

## Progress
- [ ] 1/7 spec · [ ] 2/7 · [ ] 3/7 · [ ] 4/7 · [ ] 5/7 · [ ] 6/7 · [ ] 7/7
