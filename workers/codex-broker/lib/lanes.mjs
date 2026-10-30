// Which lane a call is in, read from the verified run token and never from what the caller says: PR checks always go before scheduled work and benchmarks.
// Why (28 Oct 2026, spec ci-on-codex-subscription-design): a PR check must keep its own 15% of the week; scheduled and benchmark work stops at its 60% share.

/** Lane of verified claims: PR first, the exact nightly drift workflow, benchmarks, then other scheduled/push/manual runs. */
export function laneOf(claims) {
  if (claims.event_name === 'pull_request') return 'pr';
  const workflow = String(claims.job_workflow_ref || claims.workflow_ref || '');
  if (/(^|\/)\.github\/workflows\/ai-answer-drift\.yml$/.test(workflow.split('@')[0])) return 'drift';
  if (/bench/i.test(workflow)) return 'bench';
  return 'scheduled';
}

export const LANES = ['pr', 'scheduled', 'bench', 'drift'];
