// How steady and right the AI is in the quality suite, as rates over many nights (owner, 27 Oct 2026: "Code gate + AI rate"): the gate replays recorded answers,
// and the night's live quality run scores the golden jobs twice. jobs/e2e-intel.mjs reads those runs' logs (counts only, never stored), the site keeps one row per
// night (e2e_quality) and /admin/operations/e2e draws the rate over the last 90 score pairs against the owner's bars (admin/e2e-page.js qualityCard). Guard: test/admin/e2e-quality.test.js.

// The owner's bars (27 Oct 2026): red below 80% of the last 90 pairs within 8 points ("raised after the wobble fix"); red above 2% of them more than 20 apart.
export const BARS = {pairs: 90, agree: 0.8, jumps: 0.02, within: 8, jump: 20};

const scoresOf = line => Object.fromEntries([...String(line || '').matchAll(/(\d+)=(\d+)\b/g)].map(([, id, score]) => [id, Number(score)]));

// One quality job's log text -> the night's counts, or null when the run scored nothing twice (a replayed gate, a run cut before the second scoring).
// Only the first try counts (its "second scores:" line comes first; a retry repeats the steps that went red, on the same commit).
export function nightOf(text) {
  const log = String(text || ''), second = log.search(/^\S*\s*second scores: /m);
  if (second < 0) return null;
  const before = log.slice(0, second), firstAt = Math.max(...[...before.matchAll(/^\S*\s*scores: /gm)].map(match => match.index), -1);
  if (firstAt < 0) return null;
  const line = from => log.slice(from, log.indexOf('\n', from) < 0 ? undefined : log.indexOf('\n', from));
  const first = scoresOf(line(firstAt).replace(/^.*?scores: /, '')), again = scoresOf(line(second).replace(/^.*?second scores: /, ''));
  const gaps = Object.keys(first).filter(id => id in again).map(id => Math.abs(first[id] - again[id]));
  if (!gaps.length) return null;
  const facts = log.match(/^\S*\s*quality: (\d+)\/(\d+) facts exact/m), judged = log.match(/^\S*\s*judged (\d+) score texts: .*?(\d+) with invented facts/m);
  return {pairs: gaps.length, within8: gaps.filter(gap => gap <= BARS.within).length, over20: gaps.filter(gap => gap > BARS.jump).length,
    factsExact: facts ? Number(facts[1]) : 0, factsTotal: facts ? Number(facts[2]) : 0, judged: judged ? Number(judged[1]) : 0, invented: judged ? Number(judged[2]) : 0};
}

const count = value => (Number.isInteger(value) && value >= 0 && value <= 1000 ? value : null);
// A night as the collector sends it: {runId, day, pairs, within8, over20, factsExact, factsTotal, judged, invented}; anything else is dropped.
export function cleanNight(night) {
  if (!Number.isInteger(night?.runId) || night.runId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(night.day || '')) return null;
  const fields = ['pairs', 'within8', 'over20', 'factsExact', 'factsTotal', 'judged', 'invented'].map(key => count(night[key]));
  if (fields.includes(null) || !fields[0] || fields[1] > fields[0] || fields[2] > fields[0] || fields[3] > fields[4] || fields[6] > fields[5]) return null;
  const [pairs, within8, over20, factsExact, factsTotal, judged, invented] = fields;
  return {runId: night.runId, day: night.day, pairs, within8, over20, factsExact, factsTotal, judged, invented};
}

// Nights newest first -> the rate over the newest nights that hold the last 90 pairs (fewer while history is short), and whether each bar holds.
export function rateOf(nights = []) {
  const used = [];
  let pairs = 0;
  for (const night of nights) { if (pairs >= BARS.pairs) break; used.push(night); pairs += night.pairs; }
  const sum = field => used.reduce((total, night) => total + night[field], 0);
  const agree = pairs ? sum('within8') / pairs : null, jumps = pairs ? sum('over20') / pairs : null;
  return {nights: used.length, pairs, agree, jumps, factsExact: sum('factsExact'), factsTotal: sum('factsTotal'), judged: sum('judged'), invented: sum('invented'),
    agreeOk: agree == null || agree >= BARS.agree, jumpsOk: jumps == null || jumps <= BARS.jumps};
}
