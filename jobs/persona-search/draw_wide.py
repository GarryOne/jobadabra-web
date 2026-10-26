"""The search robot's daily draw (owner, 26 Oct 2026: "why we don't find these gaps with our automatic tooling?"; sketch https://claude.ai/artifact/5PjZZy6TyTBNQZYB6PaofR):
from everywhere, where tools/persona-search/draw.py picks one of 20 fixed jobs in one of 40 cities.
- Field: any role kind of the app's own list (src/role_kinds.py KINDS, read live, so a split of "other" is drawn the day it lands), and a specific role in it that the
  AI makes up (a "First Officer" or a "sound technician", not the kind's most common title). One small call on the draw's own key (Haiku, about $0.001).
- Place: a city, a country, a region (places.json: Europe, DACH, ...) or remote, written as the wizard note a person types ("Jobs anywhere in Europe").
- Path: the first search (half the draws), a field change then a 2nd search on the same install (run.mjs --change-field), or the same search again at once.
- Engine: the API key or Free AI, every other day (a date seed); --engines narrows it.
Synthetic only: every name, mail and employer is invented. Same seed, same pick (the AI's role is kept in draw.json, so a re-run can pass it back with --role).
Usage (joined tree, from its root): python3 jobs/persona-search/draw_wide.py <seed> <out> [--engines api,free] [--role <title>] [--other <title>]
  -> <out>/draw/: cv.pdf, note.txt, field.json (field change only), draw.json; prints draw.json. Guard: tests/test_draw_wide.py.
"""
import datetime
import hashlib
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / 'tools' / 'persona-search')]
from personas import pdf  # noqa: E402
from draw import FIRST, LAST  # noqa: E402
from src.role_kinds import KINDS, WORK  # noqa: E402

DRAWS = json.loads((ROOT / 'tools' / 'persona-search' / 'draws.json').read_text(encoding='utf-8'))
REGIONS = json.loads((HERE / 'places.json').read_text(encoding='utf-8'))['regions']
PLACE_KINDS = ('city', 'country', 'region', 'remote')
PATHS = ('first', 'first', 'field-change', 'again')   # half the draws are a first search
PRESSES = {'first': 1, 'field-change': 2, 'again': 2}
ENGINES = ('api', 'free')
MODEL = 'claude-haiku-5-5'


def number(seed, part):
    """A stable number for one part of the pick: each part has its own hash, so adding a kind does not move the places."""
    return int(hashlib.sha256(f'{seed}|{part}'.encode()).hexdigest(), 16)


def engine_of(seed, engines):
    """Alternating by day for a date seed (owner, 26 Oct 2026: one draw a day, engines alternating), else by hash."""
    try:
        day = datetime.date.fromisoformat(seed).toordinal()
    except ValueError:
        day = number(seed, 'engine')
    return engines[day % len(engines)]


def pick(seed, engines=ENGINES):
    """The draw for this seed, before the AI names the role: kind, the other kind (field change), place, home city, path, engine, name."""
    at = number(seed, 'kind') % len(KINDS)
    other = KINDS[(at + 1 + number(seed, 'other') % (len(KINDS) - 1)) % len(KINDS)]
    place_kind = PLACE_KINDS[number(seed, 'place') % len(PLACE_KINDS)]
    cities, region = DRAWS['cities'], None
    if place_kind == 'region':
        region = REGIONS[number(seed, 'region') % len(REGIONS)]
        cities = [city for city in cities if city['country'] in region['countries']]
    home = cities[number(seed, 'home') % len(cities)]
    place = {'city': home['city'], 'country': home['country'], 'region': region and region['name'], 'remote': 'remote'}[place_kind]
    path = PATHS[number(seed, 'path') % len(PATHS)]
    digits = number(seed, 'name')
    return {'seed': seed, 'kind': KINDS[at], 'other_kind': other, 'place_kind': place_kind, 'place': place,
            'city': home['city'], 'country': home['country'], 'language': home['language'], 'path': path, 'presses': PRESSES[path],
            'engine': engine_of(seed, engines), 'name': f'{FIRST[digits % len(FIRST)]} {LAST[(digits >> 8) % len(LAST)]}'}


def note(draw):
    """The wizard's "What should the AI know about what you want?", in a person's words."""
    return {'city': f"I'm looking for {draw['role']['title']} jobs in {draw['city']}.",
            'country': f"I'm looking for {draw['role']['title']} jobs anywhere in {draw['country']}, on-site or hybrid.",
            'region': f"I'm looking for {draw['role']['title']} jobs anywhere in {draw['place']}. I can move.",
            'remote': f"I'm looking for remote {draw['role']['title']} jobs only, from {draw['city']}, {draw['country']}."}[draw['place_kind']]


def kind_words(kind):
    """What a kind covers; 'other' as the work no listed kind covers, so the AI goes where our lists are thin."""
    if kind != 'other':
        return WORK[kind]
    return 'work none of these covers: ' + '; '.join(WORK[k] for k in KINDS if k != 'other')


ASK = ('Invent one specific, real job a person in {country} could hold, of this kind of work: {work}. Prefer a specialised or less common title over the '
       "kind's most common one (draw {seed}). {fixed}Answer only JSON: {{\"title\": the job title in English, one to four words; \"duty\": one sentence of what they did; "
       '"education": the usual diploma or licence; "tools": the skills, tools or certificates, comma-separated}}.')


LIMITS = {'title': 60, 'duty': 300, 'education': 160, 'tools': 300}   # characters; a CV line wraps, so only a runaway answer is refused


def valid(found):
    """(role, why not): the AI's role as kept (four single-line strings, the title at most six words), or None and the reason."""
    if not isinstance(found, dict):
        return None, 'not a JSON object'
    role = {key: ' '.join(str(found.get(key) or '').split()) for key in LIMITS}
    for key, most in LIMITS.items():
        if not role[key]:
            return None, f'{key} is empty'
        if len(role[key]) > most:
            return None, f'{key} is {len(role[key])} characters (at most {most})'
    if len(role['title'].split()) > 6:
        return None, 'title is more than six words'
    return role, ''


def invent(seed, kind, country, title='', ask=None):
    """{title, duty, education, tools} for a role of this kind; `title` fixes the title (a re-run of a gap found earlier). `ask(prompt) -> text` is the model."""
    fixed = f'The title is "{title}". ' if title else ''
    prompt = ASK.format(country=country, work=kind_words(kind), seed=seed, fixed=fixed)
    why = ''
    for _ in range(3):
        text = (ask or claude)(prompt)
        match = re.search(r'\{.*\}', text or '', re.S)
        try:
            role, why = valid(json.loads(match.group(0))) if match else (None, 'no JSON in the answer')
        except ValueError:
            role, why = None, 'the JSON does not parse'
        if role:
            return {**role, 'title': title or role['title']}
        print(f'draw_wide: role answer refused ({why}), asking again', file=sys.stderr)
    raise SystemExit(f'draw_wide: no valid role from the AI for kind {kind} ({why})')


SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': list(('title', 'duty', 'education', 'tools')),
          'properties': {key: {'type': 'string'} for key in ('title', 'duty', 'education', 'tools')}}


def request(prompt):
    """The Messages call's arguments, as the engine asks Haiku (src/ai/engine.structured): a JSON schema, low effort, and room for Haiku 5.5's thinking in
    max_tokens (26 Oct 2026: the SDK refused temperature, then 400 tokens left no answer after the thinking: three measured draws died)."""
    from src.ai import engine
    return {'model': MODEL, 'max_tokens': 4000, 'messages': [{'role': 'user', 'content': prompt}], 'output_config': engine.structured(SCHEMA, MODEL, 'low')}


def claude(prompt):
    """One Haiku call on the draw's own key (RANDOM_DRAWS_ANTHROPIC_KEY, the Jobadabra Tests workspace), never a user's or the production key."""
    import anthropic
    key = os.environ.get('RANDOM_DRAWS_ANTHROPIC_KEY')
    if not key:
        raise SystemExit('draw_wide: RANDOM_DRAWS_ANTHROPIC_KEY is not set (or pass --role and --other with a fixed role)')
    answer = anthropic.Anthropic(api_key=key).messages.create(**request(prompt))
    return ''.join(block.text for block in answer.content if getattr(block, 'type', '') == 'text')


def cv(draw):
    """The CV lines (the shape of draw.py's): the role, six invented years, the home country's language, English B2."""
    role, name = draw['role'], draw['name']
    slug = name.lower().replace(' ', '.')
    mode = 'remote' if draw['place_kind'] == 'remote' else 'on-site or hybrid'
    return [name, f"{role['title']}, {draw['city']}, {draw['country']}", f'{slug}@example.test | +00 000 000000', '', 'SUMMARY',
            f"{role['title']} with 6 years of experience, based in {draw['city']}.", role['duty'], '',
            'EXPERIENCE', f"2021 - now   {role['title']}, Example Group, {draw['city']}", f"  - {role['duty']}",
            f"2018 - 2021  {role['title']}, Sample Works, {draw['city']}", f"  - Same kind of work for a smaller employer; skills: {role['tools']}.", '',
            'EDUCATION', f"{role['education']}, {draw['city']}, 2018", '',
            'LANGUAGES', f"{draw['language']} native, English good (B2)", '',
            'WORK RIGHTS', f"Citizen of {draw['country']}. Lives in {draw['city']}; {mode}."]


def write(seed, out, engines=ENGINES, role='', other='', ask=None):
    draw = pick(seed, engines)
    draw['role'] = invent(seed, draw['kind'], draw['country'], role, ask)
    folder = Path(out) / 'draw'
    folder.mkdir(parents=True, exist_ok=True)
    (folder / 'cv.pdf').write_bytes(pdf(cv(draw)))
    (folder / 'note.txt').write_text(note(draw) + '\n', encoding='utf-8')
    if draw['path'] == 'field-change':
        draw['other_role'] = invent(f'{seed}-other', draw['other_kind'], draw['country'], other, ask)['title']
        (folder / 'field.json').write_text(json.dumps([draw['other_role']]), encoding='utf-8')
    (folder / 'draw.json').write_text(json.dumps(draw), encoding='utf-8')
    return draw


def main(argv):
    if len(argv) < 2 or argv[0].startswith('--'):
        sys.exit(__doc__)
    flag = lambda name, fallback='': argv[argv.index(name) + 1] if name in argv else fallback
    engines = tuple(e for e in flag('--engines', ','.join(ENGINES)).split(',') if e in ENGINES) or ENGINES
    print(json.dumps(write(argv[0], argv[1], engines, flag('--role'), flag('--other'))))


if __name__ == '__main__':
    main(sys.argv[1:])
