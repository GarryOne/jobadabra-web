// Which lane a call is in, read from the verified run token and never from what the caller says: PR checks always go before scheduled work and benchmarks.
// Why (28 Oct 2026, spec ci-on-codex-subscription-design): a PR check must keep its own 15% of the week; scheduled and benchmark work stops at its 60% share.

/** Lane of a verified claim set: 'pr' (a pull_request run), 'bench' (a workflow whose file name has "bench"), else 'scheduled' (schedule, push, manual). */
export function laneOf(claims) {
  if (claims.event_name === 'pull_request') return 'pr';
  if (/bench/i.test(String(claims.job_workflow_ref || claims.workflow_ref || ''))) return 'bench';
  return 'scheduled';
}

export const LANES = ['pr', 'scheduled', 'bench'];
