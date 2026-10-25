"""Every secrets.X / vars.X a workflow reads is listed in .github/expected-secrets.json, and the list names nothing unused
(secrets do not move with a workflow: after the 20 Oct 2026 site split the draws, the search lab and its repair ran red or skipped for 5 days)."""
import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
if (ROOT / '.private' / '.github').is_dir():   # CI runs this repo's tests in the public tree, with this repo at .private: its own workflows only
    ROOT = ROOT / '.private'
EXPECTED = json.loads((ROOT / '.github' / 'expected-secrets.json').read_text(encoding='utf-8'))


def used(kind):
    names = set()
    for path in (ROOT / '.github' / 'workflows').glob('*.y*ml'):
        names |= set(re.findall(r'(?<![\w.-])%s\.([A-Z][A-Z0-9_]+)' % kind, path.read_text(encoding='utf-8')))
    return names - {'GITHUB_TOKEN'}


class WorkflowSecrets(unittest.TestCase):
    def test_every_secret_a_workflow_reads_is_listed(self):
        missing = used('secrets') - set(EXPECTED['secrets']) - set(EXPECTED['optional_secrets'])
        self.assertEqual(missing, set(), 'add to .github/expected-secrets.json and run: gh secret set NAME -R GarryOne/jobadabra-web')

    def test_every_variable_a_workflow_reads_is_listed(self):
        self.assertEqual(used('vars') - set(EXPECTED['vars']), set())

    def test_the_list_names_nothing_unused(self):
        self.assertEqual((set(EXPECTED['secrets']) | set(EXPECTED['optional_secrets'])) - used('secrets'), set())
        self.assertEqual(set(EXPECTED['vars']) - used('vars'), set())

    def test_the_weekly_check_reads_the_same_list(self):
        text = (ROOT / '.github' / 'workflows' / 'secrets-check.yml').read_text(encoding='utf-8')
        self.assertIn('expected-secrets.json', text)
        self.assertNotIn('SECRETS_CHECK_TOKEN', EXPECTED['secrets'])


if __name__ == '__main__':
    unittest.main()
