// The broker's own share of the Codex week and the two brakes (spec ci-on-codex-subscription-design, "Using the allowance"): 60% own share for scheduled + benchmarks, 75% for PR checks (60 + their 15), and the whole-week usedPercent as a second brake at 85% / 97%.
// Why (28 Oct 2026, owner: "burn these tokens"; Gitar on #2375): usedPercent includes the owner's own sessions, so only the broker's own token count can keep his 25% whatever he used.
export const LIMITS = {own: {pr: 75, scheduled: 60, bench: 60}, week: {pr: 97, scheduled: 85, bench: 85}};
// Seed for tokens per 1% of the week (PR 0, 28 Oct 2026: 1% >= ~40 calls of ~18k tokens); the broker replaces it with its measured ratio.
export const TOKENS_PER_PERCENT = 720000;

/** Fresh meter state for the week that resets at resetsAt (epoch seconds). */
export const newMeter = resetsAt => ({resetsAt, tokens: {pr: 0, scheduled: 0, bench: 0}});

/** Adds one call's tokens to its lane; starts a new week's meter when `now` (seconds) is past the reset. Returns the (possibly new) meter. */
export function record(meter, lane, tokens, now, nextResetsAt) {
  // resetsAt 0 = never set (fresh meter, Codex limits not read yet): adopt a week from now and keep the tokens. Without this, 0 + a week is 1970 and every call opened a fresh meter, so the 60%/75% brake never fired (Gitar on #221).
  if (!meter.resetsAt) meter.resetsAt = nextResetsAt ?? now + 604800;
  const m = now >= meter.resetsAt ? newMeter(nextResetsAt ?? now + 604800) : meter;
  m.tokens[lane] += tokens;
  return m;
}

/** The broker's own share of the week in percent: all lanes' tokens over tokens-per-percent. */
export const ownSharePct = (meter, tokensPerPercent = TOKENS_PER_PERCENT) => Object.values(meter.tokens).reduce((a, b) => a + b, 0) / tokensPerPercent;

/**
 * Whether `lane` may call now: {ok: true} or {ok: false, why}. weekUsedPercent is Codex's own whole-week figure (null = not read yet: not a reason to stop).
 * A refusal is said as a reason word the job shows in its check ("budget:own-share", "budget:week"); the job then replays or goes grey, never a paid engine.
 */
export function allow(lane, meter, weekUsedPercent, tokensPerPercent = TOKENS_PER_PERCENT) {
  // Why (30 Oct 2026, owner's goal: a green hand beta): the seed ratio was never replaced by a measured one, so 43.2M tokens read 60.06% while Codex said the whole week, the owner's
  // sessions included, was 32% used: every scheduled and manual run was refused with "own-share 60.1% of 60%". A part cannot exceed the whole, so the share is capped by the week reading.
  const own = Math.min(ownSharePct(meter, tokensPerPercent), weekUsedPercent ?? Infinity);
  if (own >= LIMITS.own[lane]) return {ok: false, why: `budget:own-share ${own.toFixed(1)}% of ${LIMITS.own[lane]}% (${lane})`};
  if (weekUsedPercent != null && weekUsedPercent >= LIMITS.week[lane]) return {ok: false, why: `budget:week ${weekUsedPercent}% of ${LIMITS.week[lane]}% (${lane})`};
  return {ok: true};
}
