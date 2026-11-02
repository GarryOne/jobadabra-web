"""A step that pipes a job into `tee` must set pipefail (owner, 24 Oct 2026): GitHub's default `bash -e` returns tee's status, so changelog-publish.yml ended GREEN while every draft was refused."""
import os
import pathlib
import re
import unittest

# The joined tree holds the public repo's workflows too (they have their own test, tests/test_workflow_pipefail.py, with its summary-only list): scan only THIS repo's (site-guards.sh and site-run.sh say where it is).
SITE_REPO = pathlib.Path(os.environ.get('SITE_REPO_DIR') or pathlib.Path(__file__).resolve().parent.parent)
WORKFLOWS = SITE_REPO / '.github/workflows'


def steps(text):
    """The text of each step: from one `- name:`/`- uses:`/`- run:` line to the next at the same indent."""
    return re.split(r'(?m)^\s{6}- (?=\w+:)', text)[1:]


def offenders():
    found = []
    for path in sorted(WORKFLOWS.glob('*.yml')):
        for step in steps(path.read_text()):
            code = re.sub(r'(?m)^\s*#.*$', '', step)
            if re.search(r'\|\s*tee\b', code) and not re.search(r'pipefail|shell:\s*bash', code):
                found.append(f"{path.name}: {step.splitlines()[0].strip()[:70]}")
    return found


class PipefailTests(unittest.TestCase):
    def test_every_tee_step_fails_when_its_job_fails(self):
        self.assertEqual(offenders(), [])
