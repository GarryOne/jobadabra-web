// Which lane a call is in, read from the verified run token and never from what the caller says: PR checks always go before scheduled work and benchmarks.
// Why (31 Oct 2026, owner: "CI can use up to 100%"): all lanes may use the whole week; PR checks keep queue priority over scheduled work and benchmarks.

/** Lane of verified claims: PR first, the exact nightly drift workflow, benchmarks, then other scheduled/push/manual runs. */
export function laneOf(claims) {
  if (claims.event_name === 'pull_request') return 'pr';
  const workflow = String(claims.job_workflow_ref || claims.workflow_ref || '');
  if (/(^|\/)\.github\/workflows\/ai-answer-drift\.yml$/.test(workflow.split('@')[0])) return 'drift';
  if (/bench/i.test(workflow)) return 'bench';
  return 'scheduled';
}

export const LANES = ['pr', 'scheduled', 'bench', 'drift'];
