// The parity map between the Claude tier a CI job used and the Codex model the broker runs (owner, 28 Oct 2026: "if for example we use Sonnet, use the same counterpart from Codex; if Haiku, again").
// Why (28 Oct 2026, owner's pick from the plan's own model list): Haiku-tier work -> gpt-6-luna (fast, affordable), Sonnet-tier -> gpt-6.1-sol (workhorse), Opus-tier -> gpt-6-astra (frontier). A caller names a tier, never a model: an unknown name is refused, never run.
export const TIERS = {small: 'gpt-6-luna', mid: 'gpt-6.1-sol', large: 'gpt-6-astra'};
export const DEFAULT_TIER = 'mid';

/** Takes the tier name a caller sent (undefined = default); returns the model slug, or null for an unknown tier. */
export const modelOf = tier => (Object.hasOwn(TIERS, tier ?? DEFAULT_TIER) ? TIERS[tier ?? DEFAULT_TIER] : null);   // own keys only: 'constructor' or '__proto__' is an unknown tier, not a model (#223, Gitar)

/** Takes a Claude model id ("claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5", dated or not); returns its tier, or null. The engine uses it so each workflow keeps its tier. */
export const tierOfClaude = id => (/haiku/i.test(id || '') ? 'small' : /sonnet/i.test(id || '') ? 'mid' : /opus/i.test(id || '') ? 'large' : null);
