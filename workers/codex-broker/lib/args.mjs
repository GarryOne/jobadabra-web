/** Builds one call's Codex arguments from its request and prepared image filenames. Keeps the prompt after -- so images cannot swallow it. */
export function buildArgs({prompt, schema, imageNames = [], model, search}) {
  const args = ['exec', '--skip-git-repo-check', '--ignore-user-config', '--ephemeral', '-s', 'read-only', '--disable', 'shell_tool', '--json', '-o', 'out.txt'];
  if (model) args.push('-m', String(model));   // the worker maps a tier to one of three slugs (lib/tiers.mjs); the container runs only what it is given
  if (schema) args.push('--output-schema', 'schema.json');
  for (const name of imageNames) args.push('-i', name);
  if (search === true) args.push('-c', 'web_search="live"');
  args.push('--', String(prompt));   // -i takes several values and would swallow the prompt as another image ("No prompt provided via stdin", 28 Oct 2026)
  return args;
}
