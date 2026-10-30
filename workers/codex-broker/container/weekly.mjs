// Which of Codex's rate-limit windows is the week. Split from server.mjs so a test can import it without starting the server.
// Why (30 Oct 2026, Gitar on #232): the own-share cap and the whole-week brakes read this figure, and `primary` is the 5h window on some accounts; a 5h reading would drop to ~0% every five hours and switch the owner's 25% reserve off. Pick by length, never by slot; no weekly window = null (the seed estimate then holds alone).
const WEEK_MINS = 10080;

/** The window of `rateLimits` ({primary, secondary}) that lasts about a week, as {usedPercent, resetsAt}, or null when none does. */
export function weeklyWindow(rateLimits) {
  const w = [rateLimits?.primary, rateLimits?.secondary].find(x => x && Math.abs((x.windowDurationMins ?? 0) - WEEK_MINS) < 60);
  return w ? {usedPercent: w.usedPercent, resetsAt: w.resetsAt} : null;
}
