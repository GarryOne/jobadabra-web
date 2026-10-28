// A priority queue with N slots: at most N calls run at once, and a waiting PR check always goes before waiting scheduled or benchmark work.
// Why (28 Oct 2026, spec ci-on-codex-subscription-design): PR 0 measured 4 parallel calls at ~9.8 s each, 60 of 60 valid; PR checks must never queue behind a benchmark.
const ORDER = ['pr', 'scheduled', 'bench'];

/** Takes the number of slots; returns {acquire(lane) -> Promise<release()>, stats()}. Each release() frees its slot once. */
export function slots(n) {
  let active = 0;
  const waiting = {pr: [], scheduled: [], bench: []};
  const next = () => { for (const lane of ORDER) if (waiting[lane].length) return waiting[lane].shift(); return null; };
  const releaser = () => { let done = false; return () => { if (done) return; done = true; const w = next(); if (w) w(releaser()); else active--; }; };
  return {
    acquire(lane) {
      if (active < n) { active++; return Promise.resolve(releaser()); }
      return new Promise(resolve => waiting[lane].push(resolve));
    },
    stats: () => ({active, waiting: {pr: waiting.pr.length, scheduled: waiting.scheduled.length, bench: waiting.bench.length}}),
  };
}
