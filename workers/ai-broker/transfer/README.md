# Moving the broker from `jobadabra-codex-broker` to `jobadabra-ai-broker` (one time)

**Verdict:** a Cloudflare Durable Object namespace transfer, four deploys and one container deletion. Proven twice on a throwaway Worker pair on 1 Nov 2026 (a stored key was read back from the new Worker, its container answered).

## The hazard (seen on the throwaway, not a guess)
A plain deploy of the new Worker name, or a transfer started in the wrong order, **creates an empty namespace** (`k: null`): the Codex login is gone and the owner must run `codex login` on the Mac and upload it with `/admin/login`.
The order below is the only one that carried the key. Do not shorten it.

## Preconditions (all of them)
- A time a8 named, never 21:00–05:30 UTC; the owner present. Downtime is about 3 minutes between step 2 and step 4.
- Old broker answers `ready`: `curl -s https://jobadabra-codex-broker.jobpilotto.workers.dev/health` (note `state`, `own`, `limits`, `fallback`).
- Wrangler 4 and the Cloudflare token from the Keychain (`job-pilotto.cloudflare.api_token`, `.account_id`) in this shell only; Docker running (the image is built locally).
- Values for the new Worker's secrets, from the Keychain: `BROKER_ADMIN_TOKEN` (`job-pilotto.codex-broker.admin_token`), `ANTHROPIC_API_KEY`, `BRAIN_BOT_TOKEN`, `BRAIN_CHAT_ID`. Secrets do not move with the namespace.

## Steps (from `workers/ai-broker/`)
1. `npx wrangler@4 deploy -c transfer/expect.jsonc` → ends with **"Could not deploy container configuration as durable object was not found in the account namespace list"**. Expected: the pending transfer is recorded. Then set the four secrets: `npx wrangler@4 secret put <NAME> --name jobadabra-ai-broker`.
2. `npx wrangler@4 deploy -c transfer/commit.jsonc` → **"Transferred (committed): CodexBroker → jobadabra-ai-broker"**. From now the old URL forwards to the new Worker, which fails until step 4.
3. `npx wrangler@4 containers list`, then `npx wrangler@4 containers delete <id of jobadabra-codex-broker-codexbroker>`. The container holds no state (the login is in the namespace); a namespace can only have one application.
4. `npx wrangler@4 deploy` (the final `wrangler.jsonc`) → creates application `ai-broker`.
5. Verify: `https://jobadabra-ai-broker.jobpilotto.workers.dev/health` says `ready` with the same `own`/`limits` as before; the old URL answers the same; one `/admin/call` smoke call answers (the first call after the deploy starts the container, about 20 s).

## If it goes wrong
- Step 1 or 2 fails before "committed": nothing moved; the old Worker still serves. Redeploy the old config from git (`git show <before>:workers/codex-broker/wrangler.jsonc`).
- After step 4 `/health` says `no-login`: the namespace is empty. `codex login` on the Mac, `POST /admin/login` with the auth.json. Minutes, an owner step.
- Not proven: moving the namespace back. Do not rely on it.

## Afterwards
`release-ai-broker.yml` stays manual until the cleanup PR (7/7), which also removes this folder, the forwarder and the old audience, and renames the class `CodexBroker` → `AiBroker` (proven on the throwaway: an `exports` rename keeps the stored key and the container, because the application name is fixed).
