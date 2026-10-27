// The Pro lane's stronger models (owner, 27 Oct 2026: "when the user buys Pro ... we should offer him a better AI experience ... a selling point to upgrade"):
// a Pro account with credit gets a Claude model on the writing steps where a head-to-head showed it writes better; every other step, and any failure, stays on Workers AI.
// Free never reaches this file: only free-ai.js calls it, after proLane() found an account with credit.
// Guard: test/shared/pro-claude.test.js (a route needs its measured gain and case count; the kill switch and the fallback hold).

export const OPUS = 'claude-opus-5-5';
export const SONNET = 'claude-sonnet-5-5';
export const HAIKU = 'claude-haiku-5-5';
const PRICES = {[OPUS]: [4, 20], [SONNET]: [2, 10], [HAIKU]: [0.1, 0.5]};   // USD per million tokens, input/output (Anthropic list prices); cache reads are billed as plain input here: a small overestimate

// step -> {model, gain, cases}. `gain` is what the head-to-head showed and `cases` how many cases each feature had: a step is routed above Qwen only with both written here.
// Method and traps: skill compare-ai-models-on-writing (tools/free-ai-writing-pairwise.mjs in the public repo); results: Notion "AI by tier" and the Artifact sketch of 27 Oct 2026.
// Not routed (never measured, they stay on Workers AI): tailor, answer, interview, opportunity. TODO(AI): measure them the same way (27 Oct 2026, owner asked).
export const PRO_ROUTES = {
  // Why (27 Oct 2026, owner): Sonnet beat Haiku 13 to 7 on cover letters under BOTH judges (Sonnet 6-4, Opus 7-3; 5 cases); the kit writes the letter with the answers and highlights in one call.
  // Not Opus: it beat Sonnet 9-1 and Haiku 23-7 only when Opus was the judge; the Sonnet judge gave 6-4 over Sonnet and 16-14 over Haiku (15 cases), noise at 2x Sonnet's price. Re-test with a judge of another family before switching.
  kit: {model: SONNET, gain: 'Sonnet beat Haiku 13-7 on letters, both judges agree', cases: 5},
  // Why (27 Oct 2026): the same letter writing as the kit's, in the app's own letter prompts (not measured separately: the class of a measured step).
  cover_letter: {model: SONNET, gain: 'same letter writing as kit; Sonnet beat Haiku 13-7', cases: 5},
  job_cover_letter: {model: SONNET, gain: 'same letter writing as kit; Sonnet beat Haiku 13-7', cases: 5},
  // Why (27 Oct 2026): Haiku wrote answer reviews better than Sonnet (16-4) and weekly summaries too (13-7): it stays inside the given facts where Sonnet adds claims; Qwen passed 0 of 5 of both.
  answer_review: {model: HAIKU, gain: 'Haiku 16-4 over Sonnet on reviews; Qwen 0 of 5', cases: 5},
  insight: {model: HAIKU, gain: 'Haiku 13-7 over Sonnet on weekly summaries; Qwen 0 of 5', cases: 5},
  // Why (27 Oct 2026): interview prep: Haiku tied Sonnet 10-10 and passed 4 of 5 of the rubric where Qwen passed 0 of 5, at a twentieth of Sonnet's price.
  prep: {model: HAIKU, gain: 'Haiku 4 of 5 pass; tied Sonnet 10-10; Qwen 0 of 5', cases: 5},
  // Why (27 Oct 2026): the rejection review is the app's 'review' step (gpt-oss for Free); Haiku passed 3 of 5 where Qwen passed 0 of 5.
  review: {model: HAIKU, gain: 'Haiku 3 of 5 pass; Qwen 0 of 5', cases: 5},
};

/**
 * The Claude model for a Pro call, or null (Workers AI answers).
 * @param {string|null} action the app's x-jp-action step name
 * @param {object} env Worker env; PRO_AI_ROUTING = "off" is the kill switch, a missing PRO_ANTHROPIC_KEY keeps every step on Workers AI
 */
export const proRoute = (action, env = {}) => (env.PRO_AI_ROUTING === 'off' || !env.PRO_ANTHROPIC_KEY ? null : PRO_ROUTES[String(action)]?.model || null);

/** Raw cost in USD of one call from its own token usage. */
export const claudeUsd = (model, usage) => ((usage?.input_tokens || 0) * (PRICES[model]?.[0] || 0) + (usage?.output_tokens || 0) * (PRICES[model]?.[1] || 0)) / 1e6;

/**
 * Ask Claude with the app's own Anthropic-shaped request.
 * Invariant: `body` is the parsed request the app sent (already Anthropic Messages shape); it is answered whole, never streamed (the caller streams the finished message).
 * @returns {Promise<{message: object, usd: number}|null>} null on any failure: the caller falls back to Workers AI, so a Claude outage never costs a Pro user the answer
 */
export async function claudeCall(env, model, body, fetcher = fetch) {
  try {
    const reply = await fetcher('https://api.anthropic.com/v1/messages', {method: 'POST', signal: AbortSignal.timeout(50_000),
      headers: {'content-type': 'application/json', 'x-api-key': env.PRO_ANTHROPIC_KEY, 'anthropic-version': '2023-06-01'}, body: JSON.stringify({...body, model, stream: false})});
    if (!reply.ok) return null;
    const message = await reply.json();
    if (message?.type !== 'message' || !Array.isArray(message.content) || !message.content.length || !message.usage) return null;
    return {message, usd: claudeUsd(model, message.usage)};
  } catch { return null; }
}
