"""The search robot's daily draw (owner, 26 Oct 2026: "why we don't find these gaps with our automatic tooling?"; sketch https://claude.ai/artifact/5PjZZy6TyTBNQZYB6PaofR):
from everywhere, where tools/persona-search/draw.py picks one of 20 fixed jobs in one of 40 cities.
- Field: any role kind of the app's own list (src/role_kinds.py KINDS, read live, so a split of "other" is drawn the day it lands), and a specific role in it that the
  AI makes up (a "First Officer" or a "sound technician", not the kind's most common title). One small call on the draw's own key (Haiku, about $0.001).
- Coherent persona: a 2nd call judges whether the title, duty, education and skills name one kind of work, and which kind; a persona that does not is refused
  and asked again (26 Oct 2026: a fixed "First Officer" got a finance CV). The draw is filed under the AI's kind (drawn_kind keeps the seed's pick).
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


def judged_verdict(found):
    """(verdict, why not): the judge's answer as kept ({same_work: bool, kind: one of KINDS, why}), or None and the reason."""
    if not isinstance(found, dict) or not isinstance(found.get('same_work'), bool):
        return None, 'the judge did not say yes or no'
    if found.get('kind') not in KINDS:
        return None, f"the judge's kind {found.get('kind')!r} is not one of the app's kinds"
    return {'same_work': found['same_work'], 'kind': found['kind'], 'why': ' '.join(str(found.get('why') or '').split())[:200]}, ''


def JUDGE_ASK(role):
    """The judge's question (the AI decides, owner 26 Oct 2026): do the CV's lines name one kind of work, and which of the app's kinds is it."""
    kinds = '; '.join(f'{kind} ({WORK[kind]})' for kind in KINDS)
    return ('A made-up job seeker\'s CV has these lines. Title: "{title}". What they did: {duty} Education: {education}. Skills: {tools}.\n'
            'Do the title, what they did, the education and the skills all describe the same kind of work (one job a real person holds)? '
            'And which one of these kinds of work is the title\'s: {kinds}?\n'
            'Answer only JSON: {{"same_work": true or false, "kind": one kind id from the list, "why": a few words}}.').format(kinds=kinds, **role)


def parsed(text, check):
    """(kept, why not) for one JSON answer through its check."""
    match = re.search(r'\{.*\}', text or '', re.S)
    if not match:
        return None, 'no JSON in the answer'
    try:
        return check(json.loads(match.group(0)))
    except ValueError:
        return None, 'the JSON does not parse'


def invent(seed, kind, country, title='', ask=None):
    """{title, duty, education, tools, kind} for a role of this kind; `title` fixes the title (a re-run of a gap found earlier) and the role is then that
    title's work, whatever kind was drawn. `ask(prompt) -> text` is the model (both questions; the judge's prompt carries "same_work").
    The AI then judges the persona: title, duty, education and skills naming different work are refused and asked again (26 Oct 2026: a fixed "First
    Officer" on a finance_admin seed got an anti-money-laundering duty, and the before/after pair searched different things). `kind` in the answer is the
    AI's reading of the title, the field the draw is filed under."""
    work = f'the work a "{title}" does' if title else kind_words(kind)
    fixed = f'The title is "{title}"; the duty, education and skills are that job\'s. ' if title else ''
    prompt = ASK.format(country=country, work=work, seed=seed, fixed=fixed)
    why = ''
    for _ in range(3):
        role, why = parsed((ask or claude)(prompt), valid)
        if role:
            role = {**role, 'title': title or role['title']}
            verdict, why = parsed((ask or judge)(JUDGE_ASK(role)), judged_verdict)
            if verdict and verdict['same_work']:
                return {**role, 'kind': verdict['kind']}
            if verdict:
                why = f"title, duty and CV name different work: {verdict['why'] or 'no reason given'}"
        print(f'draw_wide: role answer refused ({why}), asking again', file=sys.stderr)
    raise SystemExit(f'draw_wide: no valid role from the AI for kind {kind} ({why})')


SCHEMA = {'type': 'object', 'additionalProperties': False, 'required': list(('title', 'duty', 'education', 'tools')),
          'properties': {key: {'type': 'string'} for key in ('title', 'duty', 'education', 'tools')}}
VERDICT = {'type': 'object', 'additionalProperties': False, 'required': ['same_work', 'kind', 'why'],
           'properties': {'same_work': {'type': 'boolean'}, 'kind': {'type': 'string', 'enum': list(KINDS)}, 'why': {'type': 'string'}}}


def request(prompt, schema=SCHEMA):
    """The Messages call's arguments, as the engine asks Haiku (src/ai/engine.structured): a JSON schema, low effort, and room for Haiku 5.5's thinking in
    max_tokens (26 Oct 2026: the SDK refused temperature, then 400 tokens left no answer after the thinking: three measured draws died)."""
    from src.ai import engine
    return {'model': MODEL, 'max_tokens': 4000, 'messages': [{'role': 'user', 'content': prompt}], 'output_config': engine.structured(schema, MODEL, 'low')}


def claude(prompt, schema=SCHEMA):
    """One call on the key in RANDOM_DRAWS_ANTHROPIC_KEY: in CI the Free AI relay's throwaway JPF1 key, the SDK pointed at it by ANTHROPIC_BASE_URL
    (random-draw.yml, owner 26 Oct 2026: Free AI only); never a user's or the production key."""
    import anthropic
    key = os.environ.get('RANDOM_DRAWS_ANTHROPIC_KEY')
    if not key:
        raise SystemExit('draw_wide: RANDOM_DRAWS_ANTHROPIC_KEY is not set (or pass --role and --other with a fixed role)')
    answer = anthropic.Anthropic(api_key=key).messages.create(**request(prompt, schema))
    return ''.join(block.text for block in answer.content if getattr(block, 'type', '') == 'text')


def judge(prompt):
    """The persona judge's call: the same key and model, the verdict's schema."""
    return claude(prompt, VERDICT)


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
    if draw['role']['kind'] != draw['kind']:   # filed under the work the persona does (/admin's field, the alarm's issue), the seed's pick kept beside it
        draw['drawn_kind'], draw['kind'] = draw['kind'], draw['role']['kind']
        if draw['other_kind'] == draw['kind']:
            draw['other_kind'] = draw['drawn_kind']
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
