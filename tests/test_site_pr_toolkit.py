"""A PR here is described and watched like a public one (20 Oct 2026: jobadabra-web#2 opened with a bare body): CI checks the description with the public tools/pr-body-check.py,
and the red/conflict hook of the public repo runs in a session started here. Fails when either is taken out."""
import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
WORKFLOW = (ROOT / '.github' / 'workflows' / 'tests.yml').read_text(encoding='utf-8')


class PrToolkit(unittest.TestCase):
    def test_ci_checks_the_pr_description_with_the_public_tool_on_every_edit(self):
        self.assertRegex(WORKFLOW, r'pull_request:\n\s+branches: \[main\]\n\s+types: \[[^\]]*edited[^\]]*\]', 'an edited description must re-run the check')
        step = re.search(r"- name: PR description laid out\n(?P<body>(?:        .*\n)+)", WORKFLOW)
        self.assertTrue(step, 'the job "All checks passed" needs the step "PR description laid out"')
        self.assertIn("github.event_name == 'pull_request'", step['body'])
        self.assertIn('github.event.pull_request.body', step['body'])
        self.assertIn('tools/pr-body-check.py', step['body'])

    def test_a_session_started_here_gets_the_red_and_conflict_hook(self):
        # in a joined tree the root .claude is the PUBLIC repo's: read this repo's own copy (CI: .private/), or the root when this repo is checked out alone
        own = ROOT / '.private' / '.claude' / 'settings.json'
        if not own.exists() and not (ROOT / 'tools' / 'pr-red-check.sh').exists():
            own = ROOT / '.claude' / 'settings.json'
        if not own.exists():
            self.skipTest('a joined tree without .private/ leaves this repo\'s .claude out')
        found = [own]
        hooks = json.loads(found[0].read_text(encoding='utf-8'))['hooks']
        for event in ('Stop', 'UserPromptSubmit'):
            commands = [h['command'] for group in hooks[event] for h in group['hooks']]
            self.assertTrue(any('job-pilotto/tools/pr-red-check.sh' in c for c in commands), f'{event} must run the public pr-red-check.sh')


if __name__ == '__main__':
    unittest.main()
