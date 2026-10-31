// On-time hourly start of the e2e-intel collector (owner, 31 Oct 2026: "Start it from the Worker"). GitHub's own `schedule: 41 * * * *` in .github/workflows/e2e-intel.yml is best-effort:
// 60 runs from 21 to 31 Oct came a median 4.5 h apart (5 in the last 24 h, up to 7.6 h gaps), so /admin/operations/e2e showed runs hours old. Cloudflare's cron fires on time, so the
// Worker starts the workflow through the API; GitHub's cron stays as the backup (the workflow's concurrency group queues a second start, it never runs two at once).
// Same pattern as the public repo's worker/src/scheduler.js (#2653). The Worker's account has no free cron trigger (5 of 5 used), so this shares the Worker's every-5-minutes trigger and
// acts on one tick an hour. Guard: test/shared/e2e-intel-start.test.js.
export const E2E_INTEL_WORKFLOW = 'e2e-intel.yml';
export const E2E_INTEL_MINUTE = 40;   // UTC; one minute before the workflow's own :41 backup

/** True on the one 5-minute tick an hour that starts the collector. */
export const e2eIntelDue = date => date.getUTCMinutes() === E2E_INTEL_MINUTE;

/**
 * Starts e2e-intel.yml on main of the repo that holds it (this one, private) when `now` is the hourly tick. `dispatch(env, inputs, workflow)` is the Worker's (workers/www/index.js).
 * The repo is E2E_INTEL_REPO (default GarryOne/jobadabra-web) and the token MUST be E2E_INTEL_GITHUB_TOKEN (a fine-grained token on this repo, Actions: write): repo and token travel together,
 * as in api/brain.js. Why (31 Oct 2026, Gitar on #240): the site's GITHUB_TOKEN is the public repo's (index.js dispatch), so falling back to it would answer 403/404 every hour, only as a log line,
 * while the page quietly went back to GitHub's late schedule. Without the token the start is refused out loud (the caller logs it; GitHub's own schedule stays the backup).
 * Resolves to true when it dispatched, false off-tick; throws what dispatch throws.
 */
export async function startE2eIntel(env, now, dispatch) {
  if (!e2eIntelDue(now)) return false;
  if (!env.E2E_INTEL_GITHUB_TOKEN) throw new Error('E2E_INTEL_GITHUB_TOKEN is not set (the site GITHUB_TOKEN covers the public repo, not this one)');
  await dispatch({...env, GITHUB_REPO: env.E2E_INTEL_REPO || 'GarryOne/jobadabra-web', GITHUB_TOKEN: env.E2E_INTEL_GITHUB_TOKEN}, undefined, E2E_INTEL_WORKFLOW);
  return true;
}
