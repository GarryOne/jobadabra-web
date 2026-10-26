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


def fake_ai(prompt):
    title = 'First Officer' if 'none of these covers' in prompt else 'Ward Nurse'
    return json.dumps({'title': title, 'duty': 'Flew short-haul routes as second in command.', 'education': 'ATPL licence', 'tools': 'A320 type rating, CRM'})


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
        answers = iter(['no json', json.dumps({'title': 'Sound Technician', 'duty': 'Ran live sound.', 'education': 'Diploma', 'tools': 'Mixing desks'})])
        self.assertEqual(draw_wide.invent('s', 'other', 'Italy', ask=lambda _: next(answers))['title'], 'Sound Technician')
        with self.assertRaises(SystemExit):
            draw_wide.invent('s', 'other', 'Italy', ask=lambda _: json.dumps({'title': 'x\ny'}))

    def test_a_fixed_title_is_kept(self):
        self.assertEqual(draw_wide.invent('s', 'healthcare', 'Italy', 'First Officer', ask=fake_ai)['title'], 'First Officer')


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

    def test_the_kept_artifact_drops_titles_and_sources(self):
        self.assertIn("for(const key of ['top10','sources','local_by_source'])delete row[key]", self.YML)
