"""The CI App's token is minted by its Client ID (the repo variable CI_APP_CLIENT_ID), never the deprecated `app-id` input (owner, 26 Oct 2026)."""
# create-github-app-token@v3: "Input 'app-id' has been deprecated... Use 'client-id'". The public repo's tests/test_workflow_app_client_id.py guards its own workflows; this one is named site_* so it never replaces it in the joined tree (tools/site-guards.sh).
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if (ROOT / '.private' / '.github').is_dir():   # CI runs this repo's tests in the public tree, with this repo at .private: its own workflows only (as test_site_workflow_secrets.py)
    ROOT = ROOT / '.private'


class AppClientId(unittest.TestCase):
    def test_no_workflow_uses_app_id(self):
        bad = [f'{path.name}:{number}: {line.strip()}' for path in sorted(ROOT.glob('.github/workflows/*.yml'))
               for number, line in enumerate(path.read_text(encoding='utf-8').split('\n'), 1) if re.search(r'\bapp-id\b|secrets\.CI_APP_ID\b', line)]
        self.assertEqual(bad, [], 'use client-id: ${{ vars.CI_APP_CLIENT_ID }}:\n' + '\n'.join(bad))

    def test_every_token_step_names_the_client_id(self):
        steps = [text.count('uses: actions/create-github-app-token@') for text in (p.read_text(encoding='utf-8') for p in ROOT.glob('.github/workflows/*.yml'))]
        names = [text.count('client-id: ${{ vars.CI_APP_CLIENT_ID }}') for text in (p.read_text(encoding='utf-8') for p in ROOT.glob('.github/workflows/*.yml'))]
        self.assertGreater(sum(steps), 0)
        self.assertEqual(steps, names, 'each create-github-app-token step passes client-id: ${{ vars.CI_APP_CLIENT_ID }}')


if __name__ == '__main__':
    unittest.main()
