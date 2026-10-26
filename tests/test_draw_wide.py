"""The search robot's draw (jobs/persona-search/draw_wide.py): every role kind, place kind, path and engine is drawn; the same seed gives the same pick; the kinds
come from the app's own list (a new kind is drawn without a change here); the AI's role is checked; the note and the field change are what run.mjs reads."""
import json
import sys
import tempfile
import unittest
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'jobs' / 'persona-search'))
import draw_wide  # noqa: E402

DAYS = [(date(2026, 11, 1) + timedelta(days=i)).isoformat() for i in range(400)]


def judging(prompt):
    return '"same_work"' in prompt


def verdict(same=True, kind='aviation_transport', why='all flying'):
    return json.dumps({'same_work': same, 'kind': kind, 'why': why})


def fake_ai(prompt):
    if judging(prompt):
        return verdict()
    title = 'First Officer' if 'none of these covers' in prompt else 'Airline Pilot'
    return json.dumps({'title': title, 'duty': 'Flew short-haul routes as second in command.', 'education': 'ATPL licence', 'tools': 'A320 type rating, CRM'})


def scripted(roles, verdicts=None):
    """An AI that answers the role questions from `roles` and the judge from `verdicts` (default: same work), in order; keeps every prompt it got."""
    roles, verdicts = iter(roles), iter(verdicts or [])
    def ask(prompt):
        ask.prompts.append(prompt)
        return next(verdicts, verdict()) if judging(prompt) else next(roles)
    ask.prompts = []
    return ask


FIRST_OFFICER_AML = {'title': 'First Officer', 'duty': 'Monitoring financial transactions to detect and prevent money laundering activities.',
                     'education': "Bachelor's degree in Finance, AML certification", 'tools': 'AML software, KYC tools, regulatory databases'}
FIRST_OFFICER_FLYING = {'title': 'First Officer', 'duty': 'Flew A320 short-haul routes as second in command.', 'education': 'ATPL licence',
                        'tools': 'A320 type rating, CRM, flight planning'}


class PickTest(unittest.TestCase):
    def test_same_seed_same_pick(self):
        self.assertEqual(draw_wide.pick('2026-11-03'), draw_wide.pick('2026-11-03'))

    def test_every_kind_place_and_path_comes_up_in_a_year(self):
        picks = [draw_wide.pick(day) for day in DAYS]
        self.assertEqual({p['kind'] for p in picks}, set(draw_wide.KINDS))   # the app's list, whatever it holds today
        self.assertEqual({p['place_kind'] for p in picks}, set(draw_wide.PLACE_KINDS))
        self.assertEqual({p['path'] for p in picks}, {'first', 'field-change', 'again'})
        regions = {p['place'] for p in picks if p['place_kind'] == 'region'}
        self.assertIn('Europe', regions)
        self.assertGreaterEqual(min(Counter(p['kind'] for p in picks).values()), 400 // len(draw_wide.KINDS) // 3)   # no kind starved

    def test_engines_alternate_by_day(self):
        engines = [draw_wide.pick(day)['engine'] for day in DAYS[:6]]
        self.assertEqual(len(set(engines)), 2)
        self.assertTrue(all(a != b for a, b in zip(engines, engines[1:])))
        self.assertEqual({draw_wide.pick(day, ('api',))['engine'] for day in DAYS[:6]}, {'api'})

    def test_a_region_draw_lives_in_that_region(self):
        for day in DAYS:
            p = draw_wide.pick(day)
            if p['place_kind'] == 'region':
                region = next(r for r in draw_wide.REGIONS if r['name'] == p['place'])
                self.assertIn(p['country'], region['countries'])

    def test_the_field_change_goes_to_another_kind(self):
        self.assertTrue(all(p['other_kind'] != p['kind'] for p in map(draw_wide.pick, DAYS)))

    def test_presses_follow_the_path(self):
        for p in map(draw_wide.pick, DAYS[:40]):
            self.assertEqual(p['presses'], 1 if p['path'] == 'first' else 2)


class RoleTest(unittest.TestCase):
    def test_other_asks_for_work_no_listed_kind_covers(self):
        words = draw_wide.kind_words('other')
        for kind in draw_wide.KINDS:
            if kind != 'other':
                self.assertIn(draw_wide.WORK[kind], words)

    def test_a_bad_answer_is_asked_again_then_refused(self):
        ask = scripted(['no json', json.dumps({'title': 'Sound Technician', 'duty': 'Ran live sound.', 'education': 'Diploma', 'tools': 'Mixing desks'})])
        self.assertEqual(draw_wide.invent('s', 'other', 'Italy', ask=ask)['title'], 'Sound Technician')
        with self.assertRaises(SystemExit):
            draw_wide.invent('s', 'other', 'Italy', ask=lambda prompt: verdict() if judging(prompt) else json.dumps({'title': 'x\ny'}))

    def test_a_long_duty_or_tools_line_is_kept_on_one_line(self):
        long = {'title': 'Special Needs Teacher', 'duty': 'Planned and taught lessons for pupils with special educational needs, ' * 2, 'education': 'MEd',
                'tools': 'IEP writing, sign language, assistive technology, behaviour support plans, parent liaison, multi-agency work'}
        role = draw_wide.invent('s', 'education', 'Italy', ask=scripted([json.dumps(long)], [verdict(kind='education')]))
        self.assertEqual(role['title'], 'Special Needs Teacher')
        self.assertEqual(draw_wide.valid({**long, 'duty': 'x' * 400})[1], 'duty is 400 characters (at most 300)')

    def test_a_fixed_title_is_kept(self):
        self.assertEqual(draw_wide.invent('s', 'healthcare', 'Italy', 'First Officer', ask=fake_ai)['title'], 'First Officer')


class CoherentPersonaTest(unittest.TestCase):
    """26 Oct 2026, runs 40262591897 / 40262594144: a re-run fixed the title "First Officer" on a seed that drew finance_admin, so the AI wrote an
    anti-money-laundering duty and a finance CV; one build judged the search finance (9 jobs at 70+), the other aviation (0). The AI judges whether the
    title, duty, education and skills name the same work; a persona that does not is refused and drawn again."""

    def test_a_persona_naming_different_work_is_drawn_again(self):
        ask = scripted([json.dumps(FIRST_OFFICER_AML), json.dumps(FIRST_OFFICER_FLYING)],
                       [verdict(False, 'finance_admin', 'a pilot title with an AML duty'), verdict(True, 'aviation_transport')])
        role = draw_wide.invent('2026-03-28', 'finance_admin', 'France', 'First Officer', ask=ask)
        self.assertEqual(role['duty'], FIRST_OFFICER_FLYING['duty'])
        self.assertEqual(role['kind'], 'aviation_transport')
        self.assertEqual(sum(not judging(p) for p in ask.prompts), 2)   # the role was asked twice
        judged = [p for p in ask.prompts if judging(p)]
        for value in FIRST_OFFICER_AML.values():   # the judge saw every CV line of the refused persona
            self.assertIn(value, judged[0])

    def test_a_persona_never_coherent_is_refused(self):
        ask = scripted([json.dumps(FIRST_OFFICER_AML)] * 3, [verdict(False)] * 3)
        with self.assertRaises(SystemExit) as raised:
            draw_wide.invent('s', 'finance_admin', 'France', 'First Officer', ask=ask)
        self.assertIn('different work', str(raised.exception))

    def test_a_judge_answer_off_the_list_is_asked_again(self):
        ask = scripted([json.dumps(FIRST_OFFICER_FLYING)] * 3, [verdict(kind='aviation'), 'no json', json.dumps({'same_work': 'yes', 'kind': 'legal'})])
        with self.assertRaises(SystemExit):
            draw_wide.invent('s', 'aviation_transport', 'France', ask=ask)
        self.assertIsNone(draw_wide.judged_verdict({'same_work': 'yes', 'kind': 'legal', 'why': ''})[0])
        self.assertIsNone(draw_wide.judged_verdict({'same_work': True, 'kind': 'pilots', 'why': ''})[0])

    def test_the_judge_chooses_from_the_apps_own_kinds(self):
        prompt = draw_wide.JUDGE_ASK(FIRST_OFFICER_FLYING)
        for kind in draw_wide.KINDS:
            self.assertIn(kind, prompt)
        schema = draw_wide.VERDICT['properties']
        self.assertEqual(schema['kind']['enum'], list(draw_wide.KINDS))
        self.assertEqual(schema['same_work']['type'], 'boolean')

    def test_a_fixed_title_asks_for_that_titles_work_not_the_drawn_kind(self):
        ask = scripted([json.dumps(FIRST_OFFICER_FLYING)])
        draw_wide.invent('s', 'finance_admin', 'France', 'First Officer', ask=ask)
        asked = next(p for p in ask.prompts if not judging(p))
        self.assertIn('First Officer', asked)
        self.assertNotIn(draw_wide.WORK['finance_admin'], asked)

    def test_the_draw_is_filed_under_the_kind_the_ai_reads(self):
        with tempfile.TemporaryDirectory() as out:
            draw = draw_wide.write('2026-03-28', out, role='First Officer', ask=fake_ai)
        self.assertEqual(draw['kind'], 'aviation_transport')   # what /admin and the alarm call the field
        self.assertEqual(draw['drawn_kind'], draw_wide.pick('2026-03-28')['kind'])
        self.assertNotEqual(draw['other_kind'], draw['kind'])


class WriteTest(unittest.TestCase):
    def test_files_run_mjs_reads(self):
        day = next(d for d in DAYS if draw_wide.pick(d)['path'] == 'field-change' and draw_wide.pick(d)['place_kind'] == 'region')
        with tempfile.TemporaryDirectory() as out:
            draw = draw_wide.write(day, out, ask=fake_ai)
            folder = Path(out) / 'draw'
            self.assertTrue((folder / 'cv.pdf').read_bytes().startswith(b'%PDF'))
            self.assertIn(f"anywhere in {draw['place']}", (folder / 'note.txt').read_text())
            self.assertEqual(json.loads((folder / 'field.json').read_text()), [draw['other_role']])
            kept = json.loads((folder / 'draw.json').read_text())
            self.assertEqual(kept['role']['title'], draw['role']['title'])
            self.assertIn('@example.test', ' '.join(draw_wide.cv(draw)))   # invented contact only


if __name__ == '__main__':
    unittest.main()


class WorkflowTest(unittest.TestCase):
    YML = (ROOT / '.github' / 'workflows' / 'random-draw.yml').read_text(encoding='utf-8')

    def test_the_workflow_draws_wide_and_runs_the_drawn_path(self):
        self.assertIn('jobs/persona-search/draw_wide.py', self.YML)
        self.assertNotIn('tools/persona-search/draw.py "$seed"', self.YML)
        for flag in ('--presses "$presses"', '--note "$folder/note.txt"', '--change-field "$folder/field.json"', '--engine api'):
            self.assertIn(flag, self.YML)

    def test_a_draw_pinned_off_main_never_files_or_closes_issues(self):
        # 26 Oct 2026: a "before" draw on an old sha would reopen a gap main had fixed; a PR-under-test draw could close one main still has.
        step = next(s for s in self.YML.split('      - name: ') if 'node jobs/persona-search/draw-alarm.mjs' in s)
        self.assertIn('PUBLIC_REF: ${{ inputs.public_ref }}', step)
        self.assertIn('if [ -n "$GH_TOKEN" ] && [ -z "$PUBLIC_REF" ]; then', step)

    def test_the_kept_artifact_drops_titles_and_sources(self):
        self.assertIn("for(const key of ['top10','sources','local_by_source'])delete row[key]", self.YML)


class SdkTest(unittest.TestCase):
    def test_the_role_call_uses_only_arguments_the_installed_sdk_takes(self):
        import importlib.util
        import inspect
        if not importlib.util.find_spec('anthropic'):
            self.skipTest('no anthropic package here (CI installs requirements.txt)')
        from anthropic.resources.messages import Messages
        params = inspect.signature(Messages.create).parameters
        if not any(p.kind == p.VAR_KEYWORD for p in params.values()):
            self.assertLessEqual(set(draw_wide.request('x')), set(params))

    def test_the_role_call_asks_like_the_engine_with_room_to_think(self):
        call = draw_wide.request('x')
        self.assertEqual(call['output_config']['format']['type'], 'json_schema')
        self.assertEqual(call['output_config'].get('effort'), 'low')
        self.assertGreaterEqual(call['max_tokens'], 2000)   # Haiku 5.5's thinking counts towards it

    def test_every_step_that_tees_fails_with_its_pipe(self):
        for step in WorkflowTest.YML.split('      - name: '):
            if '| tee' in step:
                self.assertIn('set -o pipefail', step, step.splitlines()[0])
