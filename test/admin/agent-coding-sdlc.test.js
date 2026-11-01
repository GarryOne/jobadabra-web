// The SDLC tab of the agent coding page (admin/agent-coding-sdlc.js, the `sdlc` upload in admin/agent-coding.js): ingest clamps, the four corners of the Checks grid, checks with too few runs, the path and phases, the tab link.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {cleanGate, cleanSdlc} from '../../admin/agent-coding.js';
import {page} from '../../admin/agent-coding-page.js';
import {checksOf, cornerOf, sdlcPage} from '../../admin/agent-coding-sdlc.js';

const now = new Date('2026-11-01T12:00:00Z');
const row = (kind, day, card) => ({kind, day, card: JSON.stringify(card), updated_at: `${day}T05:00:00Z`});
const catches = (extra = {}) => ({product: 0, test: 0, ci: 0, form: 0, flaky: 0, rebase: 0, nofix: 0, ...extra});
const sdlcDay = (layers, extra = {}) => ({layers: {pr: {}, main: {}, night: {}, ...layers}, phases: {merged: 10, nospec: 3, unmerged: 1, prCommits: 30, fixAfter: 2, reverts: 0, redMain: 0}, bugs: 2, ...extra});
const gateDay = steps => ({pushes: 5, secs: 100, stopped: {form: 1, real: 1, other: 0}, stoppedSecs: {form: 10, real: 90, other: 0}, steps});

test('the upload keeps only counts, seconds and check names: clamped, cut, unknown layers and classes dropped', () => {
  const clean = cleanSdlc({layers: {pr: {'CI · Tests<script>': {runs: -4, fails: 1e12, secs: 'x', catches: {product: 2, evil: 9}}}, hack: {a: {runs: 1}}}, phases: {merged: 5, branch: 'secret'}, bugs: 3, branch: 'secret'});
  assert.deepEqual(Object.keys(clean.layers), ['pr', 'main', 'night']);
  const [name, check] = Object.entries(clean.layers.pr)[0];
  assert.ok(!name.includes('<'), 'the label is cut to its charset');
  assert.deepEqual([check.runs, check.fails <= 1e7, check.secs, check.catches.product, 'evil' in check.catches], [0, true, 0, 2, false]);
  assert.equal(clean.phases.merged, 5);
  assert.ok(!JSON.stringify(clean).includes('secret'));
  assert.equal(cleanSdlc(null), null);
});

test('the four corners: slow x valuable, with a plain rule; a check with under 20 runs is not placed', () => {
  const base = {runs: 100, secs: 0, real: 0};
  assert.equal(cornerOf({...base, perRun: 5, real: 5}), 'keep');
  assert.equal(cornerOf({...base, perRun: 300, real: 5}), 'faster');
  assert.equal(cornerOf({...base, perRun: 300, real: 0}), 'remove');
  assert.equal(cornerOf({...base, perRun: 2, real: 0}), 'quiet');
  assert.equal(cornerOf({...base, perRun: 300, real: 0, runs: 19}), 'few');
  assert.equal(cornerOf({...base, perRun: 2, real: 1, runs: 1000}), 'quiet', 'one catch in 1000 runs is under 1 in 100');
});

test('checks come from both uploads: a push-check stop that is not a form check is real; on other layers a real catch is a product or test fix; form and flaky stay apart', () => {
  const week = {gate: [gateDay({'file size': {runs: 50, fails: 5, secs: 40, cls: 'form'}, 'desktop (clean checkout)': {runs: 30, fails: 4, secs: 2400, cls: 'real'}})],
    sdlc: [sdlcDay({pr: {'CI · Tests · python': {runs: 40, fails: 9, secs: 8000, catches: catches({product: 3, test: 1, form: 2, flaky: 2, nofix: 1})}}})]};
  const by = Object.fromEntries(checksOf([week]).map(check => [check.name, check]));
  assert.deepEqual([by['file size'].real, by['file size'].form, by['desktop (clean checkout)'].real], [0, 5, 4]);
  assert.deepEqual([by['CI · Tests · python'].real, by['CI · Tests · python'].form, by['CI · Tests · python'].flaky, by['CI · Tests · python'].layer], [4, 2, 2, 'pr']);
  assert.equal(cornerOf(by['file size']), 'quiet');
  assert.equal(cornerOf(by['desktop (clean checkout)']), 'faster');
});

test('the tab draws the grid, the path and the phases from the three uploads; every corner has a word, not only a colour', () => {
  const rows = [row('gate', '2026-10-30', gateDay({'file size': {runs: 50, fails: 5, secs: 40, cls: 'form'}, 'python (clean checkout)': {runs: 40, fails: 6, secs: 3200, cls: 'real'}})),
    row('sdlc', '2026-10-30', sdlcDay({pr: {'CI · Tests · python': {runs: 40, fails: 9, secs: 8000, catches: catches({product: 3})}, 'CI · Pull request': {runs: 90, fails: 8, secs: 5400, catches: catches({form: 8})}}, main: {'CI · Tests': {runs: 30, fails: 2, secs: 600, catches: catches({nofix: 2})}}})),
    row('sdlc', '2026-10-23', sdlcDay({}, {phases: {merged: 10, nospec: 3, unmerged: 1, prCommits: 30, fixAfter: 3, reverts: 0, redMain: 0}})),
    row('sdlc', '2026-10-16', sdlcDay({}, {phases: {merged: 10, nospec: 1, unmerged: 0, prCommits: 20, fixAfter: 1, reverts: 0, redMain: 0}}))];
  const html = sdlcPage(rows, now);
  for (const word of ['Checks: value and cost', 'The path', 'The four phases', 'Make faster', 'Remove?', 'Cheap, quiet', 'Agent hooks', 'not measured yet', 'worse than the week before', 'CI · Tests · python', 'file size']) assert.ok(html.includes(word), word);
  assert.match(html, /<svg class="ac-scatter"[^>]*role="img"/);
  assert.ok(html.includes('/admin/agents/agent-coding?tab=sdlc') && html.includes('aria-current="page"'));
  assert.ok(page(rows, now).includes('SDLC · the whole path'), 'the weekly page links to the tab');
});

test('with no upload the tab says so, draws no scatter, and names nothing that is not there', () => {
  const html = sdlcPage([], now);
  assert.ok(html.includes('No upload yet') && html.includes('No SDLC upload yet'));
  assert.ok(!html.includes('<svg class="ac-scatter"'));
});

test('a check name from the upload is escaped', () => {
  const rows = [row('sdlc', '2026-10-30', sdlcDay({pr: {'a<img src=x>': {runs: 40, fails: 1, secs: 100, catches: catches()}}}))];
  assert.ok(!sdlcPage(rows, now).includes('<img src=x>') && sdlcPage(rows, now).includes('a&lt;img src=x&gt;'));
});

test('the phases compare the last two COMPLETE weeks, never a half-finished one: this week alone says nothing, and a full week is not read as better because this week has few days yet', () => {
  const thisWeekOnly = [row('sdlc', '2026-10-27', sdlcDay({}))];
  assert.ok(sdlcPage(thisWeekOnly, now).includes('No SDLC upload yet for a full week'));
  const rows = [row('sdlc', '2026-10-27', sdlcDay({}, {phases: {merged: 1, nospec: 0, unmerged: 0, prCommits: 1, fixAfter: 0, reverts: 0, redMain: 0}})),   // this week: one day, tiny counts
    row('sdlc', '2026-10-21', sdlcDay({})), row('sdlc', '2026-10-14', sdlcDay({}))];
  const html = sdlcPage(rows, now);
  assert.ok(!html.includes('better than the week before'), 'a half week with small counts must not read as an improvement');
  assert.ok(html.includes('same as the week before'));
});

// Owner's yes, 1 Nov 2026 (layer 0): the Agent hooks row shows blocks per hook once the upload carries them, and says "not measured yet" before.
test('the gate upload keeps hook counts only for the four fixed labels; the Agent hooks row is "not measured yet" until a block is seen, then shows blocks per hook', () => {
  const clean = cleanGate({pushes: 1, hooks: {'session-cap': 2, 'foreground-long-run': 1e12, 'rm -rf /': 5, secret: 'x'}});
  assert.deepEqual(Object.keys(clean.hooks), ['guard-primary-checkout', 'background-tee', 'foreground-long-run', 'session-cap']);
  assert.equal(clean.hooks['session-cap'], 2);
  assert.ok(!JSON.stringify(clean).includes('rm -rf') && !JSON.stringify(clean).includes('secret'));
  assert.equal('hooks' in cleanGate({pushes: 1}), false, 'a day without blocks carries no hooks field');
  const without = [row('gate', '2026-10-30', gateDay({}))];
  assert.ok(sdlcPage(without, now).includes('not measured yet: no hook has blocked anything'));
  const withBlocks = [row('gate', '2026-10-30', {...gateDay({}), hooks: {'session-cap': 2, 'background-tee': 1}})];
  const html = sdlcPage(withBlocks, now);
  assert.ok(html.includes('session-cap <b>2</b>') && html.includes('background-tee <b>1</b>'));
  assert.ok(!html.includes('not measured yet: no hook'));
});
