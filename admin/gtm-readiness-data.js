// GTM readiness numbers (owner, 1 Nov 2026: "how ready is GTM our app, from the critical journeys point of view. How stable are they"). Pure: the stored snapshot -> rows.
// Snapshot (admin/gtm-readiness.js reads it; admin/gtm-intel.js validates it): {at, journeys: [{id, name, tier}], tier1: [[runId, day, kind, os, journey, seen, failed, cut]],
// tier2: [{day, journey, tests, runs, red}]}. A Tier 1 row is one run on one OS for one journey; seen = registry steps found in the run's steps.json (0 with cut = 1: the suite died first). Guard: test/admin/gtm-readiness.test.js.
// Why (1 Nov 2026): a run is red for a journey when a registry step FAILED, or the suite died before a registry step ran (cut); the e2e store keeps reds only, so greens come from the runs' steps.json.
const DAY = 86400000;
export const STABLE_RUNS = 10;   // stable = green in the last 10 runs of the journey (all OSes pooled by run) AND no red in the last QUIET_DAYS days; the owner may change both
export const QUIET_DAYS = 3;   // Why (1 Nov 2026 measurement): a journey that runs on every merge fills its last 10 runs in a day, so 10 greens alone forgot a red from yesterday
export const WINDOW_DAYS = 14;
export const STRIP = 20;
const dayOf = date => date.toISOString().slice(0, 10);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayWords = day => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
const bad = row => row.failed > 0 || row.cut > 0;
const rowOf = ([runId, day, kind, os, journey, seen, failed, cut]) => ({runId, day, kind, os, journey, seen, failed, cut});

/** @returns {{id, name, kind, runs, state, os, strip, lastBad, trend}} one row per Tier 1 journey (kept steps "K" last). */
export function tier1Rows(snapshot, now = new Date()) {
  const from = dayOf(new Date(now.getTime() - (WINDOW_DAYS - 1) * DAY)), prevFrom = dayOf(new Date(now.getTime() - (2 * WINDOW_DAYS - 1) * DAY));
  const rows = [];
  for (const journey of (snapshot?.journeys || []).filter(item => item.tier === 1)) {
    const own = (snapshot.tier1 || []).map(rowOf).filter(row => row.journey === journey.id && (row.seen > 0 || bad(row)));   // a suite that died before any step (seen 0, cut) is a red run
    const byRun = new Map();
    for (const row of own) { const one = byRun.get(row.runId) || {runId: row.runId, day: row.day, kind: row.kind, bad: false}; one.bad = one.bad || bad(row); byRun.set(row.runId, one); }
    const runs = [...byRun.values()].sort((a, b) => b.runId - a.runId), current = runs.filter(run => run.day >= from), previous = runs.filter(run => run.day >= prevFrom && run.day < from);
    const share = list => (list.length ? list.filter(run => !run.bad).length / list.length : null);
    const os = Object.fromEntries(['mac', 'windows'].map(name => { const list = own.filter(row => row.os === name && row.day >= from); return [name, list.length ? {runs: list.length, green: list.filter(row => !bad(row)).length / list.length} : null]; }));
    const last = runs.slice(0, STABLE_RUNS), lastBad = runs.find(run => run.bad) || null, quietFrom = dayOf(new Date(now.getTime() - (QUIET_DAYS - 1) * DAY));
    const state = !current.length ? 'none' : last.length < STABLE_RUNS ? 'few' : last.every(run => !run.bad) && !(lastBad && lastBad.day >= quietFrom) ? 'stable' : 'unstable';
    const now14 = share(current), before14 = share(previous);
    const trend = now14 === null || before14 === null || current.length < 5 || previous.length < 5 ? null : Math.abs(now14 - before14) < 0.02 ? 'flat' : now14 > before14 ? 'up' : 'down';
    rows.push({id: journey.id, name: journey.name, runs: current.length, share: now14, state, os, strip: runs.slice(0, STRIP).reverse(), lastBad, trend});
  }
  return rows.sort((a, b) => (a.id === 'K') - (b.id === 'K') || Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

/** One row per Tier 2 journey from the per-day tallies of its integration tests. */
export function tier2Rows(snapshot, now = new Date()) {
  const from = dayOf(new Date(now.getTime() - (WINDOW_DAYS - 1) * DAY));
  return (snapshot?.journeys || []).filter(item => item.tier === 2).map(journey => {
    const days = (snapshot.tier2 || []).filter(row => row.journey === journey.id && row.day >= from).sort((a, b) => (a.day < b.day ? 1 : -1));
    const runs = days.reduce((sum, row) => sum + row.runs, 0), red = days.reduce((sum, row) => sum + row.red, 0), lastRed = days.find(row => row.red > 0) || null;
    return {id: journey.id, name: journey.name, tests: Math.max(0, ...days.map(row => row.tests)), runs, red, share: runs ? (runs - red) / runs : null, lastRed, days: days.length};
  }).sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

/** The gauge and the verdict in words. Kept steps (K) are shown but are not a journey: not in the count. */
export function verdict(rows) {
  const journeys = rows.filter(row => row.id !== 'K' && row.state !== 'none'), stable = journeys.filter(row => row.state === 'stable'), unstable = journeys.filter(row => row.state === 'unstable');
  const short = row => row.name.replace(/[:(].*$/, '').trim();
  const words = [...unstable.map(row => `${row.id} ${short(row)} red ${dayWords(row.lastBad.day)}`), ...journeys.filter(row => row.state === 'few').map(row => `${row.id} ${short(row)} only ${row.runs} ${row.runs === 1 ? 'run' : 'runs'}`)];
  return {stable: stable.length, total: journeys.length, text: `${stable.length} of ${journeys.length} Tier 1 journeys stable${words.length ? `; ${words.join('; ')}` : ''}`};
}
