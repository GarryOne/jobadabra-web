// Which engine answers first, and in what order the others follow (docs/superpowers/specs/2026-11-01-ai-broker-design.md, section 2).
// Why (1 Nov 2026, owner: "support claude, codex, or Free AI with just a flag change"): one `ENGINE` var in wrangler.jsonc names the engine that answers first; the rest follow in the fixed ORDER.
import {apiConfigured} from './fallback.mjs';

/** Fixed order: subscriptions before paid engines, paid before capped-free. `claude` is the Claude subscription (4/7), `claude-api` the Anthropic API with its $5/day cap. */
export const ORDER = ['codex', 'claude', 'claude-api', 'free-ai'];

/**
 * Whether an engine can be tried at all in this environment (a step that is not configured is skipped, never failed). Codex's login state is checked by its own step.
 * TODO(AI): `claude` (the subscription engine, container + token) is built in PR 4/7; until then it is never configured. (1 Nov 2026)
 */
export const configured = (engine, env) => engine === 'codex' ? true : engine === 'claude' ? false : apiConfigured(engine === 'claude-api' ? 'claude' : 'free-ai', env);

/**
 * The chain for this environment: `ENGINE` first, the others in ORDER. Unset = codex (today's behaviour). An unknown value is never guessed:
 * the chain stays the default and `warning` says so (shown in /health).
 */
export function chainOf(env) {
  const wanted = String(env.ENGINE ?? '').trim();
  if (!wanted) return {first: 'codex', chain: ORDER, warning: null};
  if (!ORDER.includes(wanted)) return {first: 'codex', chain: ORDER, warning: `unknown ENGINE "${wanted.slice(0, 30)}" (codex, claude, free-ai); using codex`};
  return {first: wanted, chain: [wanted, ...ORDER.filter(engine => engine !== wanted)], warning: null};
}

const dayKey = day => `answered:${day}`;

/** Counts one answered call for an engine in this UTC day (kept in storage so an eviction does not reset it). */
export async function countAnswer(storage, day, engine) {
  await storage.transaction(async tx => {
    const counts = await tx.get(dayKey(day)) || {};
    counts[engine] = (counts[engine] || 0) + 1;
    await tx.put(dayKey(day), counts);
  });
}

/** For /health: the configured first engine, the chain with each engine's state, and today's answered calls per engine. No secret. */
export async function engineHealth(storage, env, day) {
  const {first, chain, warning} = chainOf(env), counts = await storage.get(dayKey(day)) || {};
  return {engine: first, chain: chain.map(name => ({name, configured: configured(name, env), answeredToday: counts[name] || 0})), ...(warning ? {warning} : {})};
}
