"""changelog-publish.yml: the What's new page publishes itself for every beta and stable (owner, 18 Oct 2026), without a commit or a PR."""
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
FLOW = (ROOT / '.github/workflows/changelog-publish.yml').read_text()
CODE = re.sub(r'(?m)^\s*#.*$', '', FLOW)


class ChangelogWorkflowTests(unittest.TestCase):
    def test_it_starts_on_the_hourly_schedule_or_by_hand(self):
        # the public repo cannot trigger a private workflow: the hourly run is the backup that catches every release
        triggers = FLOW.split('permissions:')[0]
        self.assertIn('schedule:', triggers)
        self.assertIn('workflow_dispatch:', triggers)
        self.assertNotIn('workflow_run', triggers)

    def test_it_never_commits_pushes_or_opens_a_pr(self):
        for word in ('git commit', 'git push', 'gh pr ', 'contents: write', 'pull-requests: write'):
            self.assertNotIn(word, CODE, word)

    def test_it_publishes_with_the_site_key_and_reports_its_ai_cost(self):
        self.assertIn('SELFHEAL_PUBLISH_KEY', CODE)
        self.assertIn('--job changelog-publish', CODE)
        self.assertIn('tree.sh --full', CODE)   # the commits between two release tags

    def test_the_automatic_run_has_no_backfill_switch(self):
        # the one-time backfill of older versions is a local run of the tool (owner, 18 Oct 2026), never a button in CI
        self.assertNotIn('backfill', CODE.lower())
        self.assertNotIn('inputs:', CODE)

    def test_one_run_at_a_time_and_a_run_that_fails_says_why_in_its_log(self):
        self.assertIn('group: changelog-publish', CODE)
        self.assertIn('tee', CODE)


if __name__ == '__main__':
    unittest.main()
