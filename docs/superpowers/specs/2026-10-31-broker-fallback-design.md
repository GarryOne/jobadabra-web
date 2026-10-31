# Codex broker fallback — 31 October 2026

## Problem and decisions
CI may use 100% of the owner's Codex week. At exhaustion it currently loses AI judgments. The owner's decisions, verbatim: “CI can use up to 100%. If codex is done it should switch to Claude or Free AI or both.” Then: “Claude, then Free AI, $5/day”. The selected option said: “Claude first (best quality, same model per tier), then Free AI once Claude's $5 for the day is used, then grey ('not judged'). The spend shows per day on /admin/ai-cost, and a Telegram note goes out when a cap is hit.”

## Observable behaviour
- Codex remains first. Weekly own-share/week brakes and explicit Codex usage-limit errors select Claude, then Free AI. Missing login, invalid requests, daily drift limits, transport errors and credential-shaped refusals keep their existing refusal; paying cannot bypass those controls.
- Claude has its own $5 UTC-day allowance. Tier small/mid/large uses HAIKU/SONNET/OPUS from `shared/pro-claude.js`, the reverse of `workers/codex-broker/lib/tiers.mjs`. Prices come from the same table as the product's admin cost accounting; Free AI uses `modelFor` and `costUsd` from the shared product model table.
- **Decided (31 Oct 2026, owner: “$2/day”, “Yes, ship”):** Free AI has a separate **$2/day cap**, in addition to Claude's $5/day. `FALLBACK_FREE_AI_DAY_USD = "2"` is committed in the broker's non-secret config. Tests read that config; an explicit zero can disable Free AI.
- A fallback request has one bounded output allowance. A conservative input allowance (serialized text/schema UTF-8 bytes plus overhead; vision also requires the Anthropic token-count endpoint) and maximum output charge are reserved atomically before dispatch. The output limit shrinks to fit the remaining budget. A request that cannot fit moves to the next engine, or returns 429 `budget:fallback-day $5` with Free AI's configured line. Thus an unusable remainder may remain below the nominal cap.
- Response usage settles the reservation using existing token prices. Uncertain outcomes retain the reservation, separately from measured spend, to avoid overspending on retries or object eviction. Days are keyed by UTC admission date; a response crossing midnight settles its original day.
- Search requests go directly grey after Codex exhaustion (`fallback:search-unsupported`). The broker's flattened prompt plus boolean does not preserve the Messages search-tool contract. Reusing the product's board-only web-search helper would spend from an unrelated monthly budget. No answer without search is passed off as searched.
- Claude receives images and JSON schemas. Free AI uses the product translator; unsupported images go grey, never silently disappear. Invalid/empty/truncated/refused responses are not judgments; raw Free AI completion/refusal flags are checked before translation. Known usage is charged even if the answer is unusable.
- Successful replies retain `{reply,tokens,ms,lane,tier,model,weekUsedPercent}` plus `engine: "claude" | "free-ai"`. The public CI client stays unchanged (it does not currently log an engine).
- Broker durable storage is the single cost authority. `/health` adds today's totals/caps/reservations, without prompts or credentials. The existing admin guard stays in place; a Worker service binding reads broker health, and the page shows “CI fallback: Claude $x, Free AI $y today”. Missing binding/failure shows unavailable, never a fabricated zero.
- The existing Telegram sendMessage pattern (`BRAIN_BOT_TOKEN`, `BRAIN_CHAT_ID`) sends one attempted cap note per engine per UTC day. The deduplication marker is committed before sending, so retries/evictions do not duplicate it. Telegram failures never invalidate an AI reply.

## Acceptance criteria
1. Fake Codex exhaustion/usage-limit error returns the appropriate Claude tier's answer; ordinary Codex answers do not call a fallback.
2. Claude at $5 selects Free AI; both caps return the grey reason word; UTC rollover selects Claude again.
3. Concurrent calls reserve before provider dispatch and cannot spend the same balance. Reconstructed objects retain spend and uncertain reservations.
4. Telegram is attempted once per cap per day; a new day can send another note.
5. Admin reads the broker's day totals and renders them under the existing access guard; no real provider is used in tests or previews.
6. Images/schema survive Claude translation; unsupported search and Free AI images fail explicitly. Bad provider replies are charged safely and refused.

## Edge cases
Provider outage or absent Anthropic key can use Free AI under its approved $2/day cap. Missing AI binding refuses grey. Only usage-limit Codex failures trigger fallback; a token-shaped error or ordinary `rate_limit_exceeded` throttle never does. A failed/ambiguous provider request holds its reserved amount for the day; returned 4xx errors (except 408) release it. If provider usage violates its reserved ceiling, record the full known charge and refuse the judgment; the ledger must never hide already billed usage. Cost is actual token usage when present; holds are exposed separately. A cap notification means the remaining budget cannot admit the requested call, or is fully used. Persistent markers guarantee at most one notification attempt, not delivery during a Telegram outage. Daily drift admission applies to fallback too. Weekly readings expire after their stored reset time so Codex is retried next week.

## Non-goals
No public client/workflow edits, OIDC changes, key setup, paid calls, deployment, product Free AI budget changes, search emulation or unrelated fixes. No packages installed. The owner approved the preview, the separate $2/day Free AI cap, and shipping on 31 Oct 2026. No manual deployment.

## Implementation plan
1. Add failing offline scenarios to `test/codex-broker/worker.test.js`; implement a focused broker fallback module and its integration without moving existing code. Keep admission and day accounting in durable storage.
2. Add failing admin read/render assertions in `test/admin/jobcost.test.js`; add broker service binding and fictional page-shot seed, render through the real local Worker.
3. Run only named single test files (at most twelve), inspect the combined before/after image, self-review the diff, prepare the template PR body, commit and ship through the repo tooling after owner approval.

## Progress
### 1. Broker fallback and daily accounting
- [x] Offline tests prove routing, caps, rollover, concurrent accounting and notifications. (proof: test/codex-broker/worker.test.js)
### 2. Admin daily line
- [x] Offline tests prove guarded reads and rendered day spend. (proof: test/admin/jobcost.test.js)
### 3. Review preview and handoff
- [x] Named checks are recorded (baseline failures distinguished) and a fictional before/after image has been inspected. (proof: tools/page-shot-seeds.mjs)
- [x] Supervisor resolved the Free AI cap and authorized commit and ship (31 Oct 2026, owner: “$2/day”, “Yes, ship”). (proof: workers/codex-broker/wrangler.jsonc)
