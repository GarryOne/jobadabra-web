// /admin/testing/gtm-readiness (owner, 1 Nov 2026): how stable each critical journey is, as one gauge, a Tier 1 table (e2e steps after merge, beta, night) and a Tier 2 table (integration tests).
// Draws the ONE snapshot row the collector keeps (gtm_snapshot); no table scan. Report only: no gate, no CI check. Guard: test/admin/gtm-readiness.test.js.
import {viewer, remember} from '../shared/auth.js';
import {esc} from '../shared/html.js';
import {readSnapshot} from './gtm-intel.js';
import {TRELLO_BOARD, TRELLO_CARD} from '../shared/gtm-trello.js';
import {CHIP_STYLE, chip} from './chip.js';
import {QUIET_DAYS, STABLE_RUNS, WINDOW_DAYS, tier1Rows, tier2Rows, verdict} from './gtm-readiness-data.js';

const REPO = 'GarryOne/jobadabra';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayWords = day => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
const pct = share => (share === null || share === undefined ? '–' : `${Math.round(share * 1000) / 10}%`);
const KIND = {'after-merge': 'after merge', beta: 'beta', nightly: 'night'};
const run = (runId, label = `#${runId}`) => `<a href="https://github.com/${REPO}/actions/runs/${Number(runId)}">${esc(label)}</a>`;
const STATES = {stable: ['Stable', 'good', '✓'], unstable: ['Not stable', 'bad', '✕'], few: [`Under ${STABLE_RUNS} runs`, 'warn', '…'], none: ['No runs', 'off', '–']};
const TRENDS = {up: ['▲', 'good', 'better than the 14 days before'], down: ['▼', 'bad', 'worse than the 14 days before'], flat: ['＝', 'off', 'same as the 14 days before'], null: ['–', 'off', 'needs 28 days of runs']};
const card = id => (TRELLO_CARD[id] ? `<a href="${TRELLO_BOARD}" title="card ${TRELLO_CARD[id]} on the GTM board">Trello ${TRELLO_CARD[id]}</a>` : '<span class="muted">–</span>');
const tone = share => (share === null ? 'off' : share >= 0.95 ? 'good' : share >= 0.8 ? 'warn' : 'bad');

const strip = (runs, pad) => `<span class="strip" role="img" aria-label="last ${runs.length} runs, newest right">${'<i class="e"></i>'.repeat(Math.max(0, pad - runs.length))}${runs.map(item =>
  `<a class="${item.bad ? 'r' : 'g'}" href="https://github.com/${REPO}/actions/runs/${Number(item.runId)}" title="${esc(dayWords(item.day))} · ${esc(KIND[item.kind] || item.kind)} · ${item.bad ? 'red' : 'green'}"></a>`).join('')}</span>`;

function gauge(done, total) {
  const share = total ? done / total : 0, circ = 2 * Math.PI * 52, shade = share >= 0.9 ? '#3fb68b' : share >= 0.7 ? '#f5b54a' : '#e5484d';
  return `<svg class="gauge" viewBox="0 0 130 130" role="img" aria-label="${done} of ${total} Tier 1 journeys stable"><circle cx="65" cy="65" r="52" fill="none" stroke="var(--line,#262c33)" stroke-width="14"/>
<circle cx="65" cy="65" r="52" fill="none" stroke="${shade}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(circ * share).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 65 65)"/>
<text x="65" y="64" text-anchor="middle" font-size="30" font-weight="700" fill="currentColor">${done}/${total}</text><text x="65" y="84" text-anchor="middle" font-size="12" fill="currentColor" opacity=".7">stable</text></svg>`;
}

function tier1Card(rows) {
  const body = rows.map(row => { const [word, stateTone, icon] = STATES[row.state], [arrow, arrowTone, arrowWhy] = TRENDS[row.trend];
    return `<tr><td class="nowrap"><b>${esc(row.id === 'K' ? 'Kept' : row.id)}</b></td><td>${esc(row.name)}</td><td>${chip(`${icon} ${esc(word)}`, stateTone)}</td>
<td class="num">${row.os.mac ? chip(pct(row.os.mac.green), tone(row.os.mac.green)) : '<span class="muted">–</span>'}</td><td class="num">${row.os.windows ? chip(pct(row.os.windows.green), tone(row.os.windows.green)) : '<span class="muted">–</span>'}</td>
<td>${strip(row.strip, 20)}</td><td class="nowrap">${row.lastBad ? `${esc(dayWords(row.lastBad.day))} · ${esc(KIND[row.lastBad.kind] || row.lastBad.kind)} ${run(row.lastBad.runId)}` : '<span class="muted">none in 14 days</span>'}</td>
<td title="${esc(arrowWhy)}">${chip(arrow, arrowTone)}</td><td>${card(row.id)}</td></tr>`; }).join('');
  return `<section class="card"><h2>Tier 1 · the journeys that block a user · last ${WINDOW_DAYS} days</h2>
<div class="scroll"><table><tr><th>Id</th><th>Journey</th><th>State</th><th class="num">Mac</th><th class="num">Windows</th><th>Last 20 runs</th><th>Last red</th><th>Trend</th><th>Board</th></tr>${body}</table></div>
<p class="muted">Green share = runs with no failed step, from the e2e runs after each merge, the beta and the night (every run of a journey's steps, on each OS). <b>Stable</b> = green in its last ${STABLE_RUNS} runs and no red in the last ${QUIET_DAYS} days. A run is red for a journey when one of its registry steps failed, or its suite died before the step ran. The kept row bundles safety and data steps no journey owns; it is not in the count.</p></section>`;
}

function tier2Card(rows) {
  const body = rows.map(row => `<tr><td class="nowrap"><b>${esc(row.id)}</b></td><td>${esc(row.name)}</td><td class="num">${row.tests}</td><td class="num">${row.runs}</td>
<td class="num">${row.runs ? chip(pct(row.share), tone(row.share)) : '<span class="muted">–</span>'}</td><td class="nowrap">${row.lastRed ? esc(dayWords(row.lastRed.day)) : '<span class="muted">none</span>'}</td><td>${card(row.id)}</td></tr>`).join('');
  return `<section class="card"><h2>Tier 2 · integration tests only · last ${WINDOW_DAYS} days</h2>
<div class="scroll"><table><tr><th>Id</th><th>Journey</th><th class="num">Tests</th><th class="num">Runs</th><th class="num">Green</th><th>Last red</th><th>Board</th></tr>${body}</table></div>
<p class="muted">Runs of “CI · Integration tests”: they run on pull requests and on main (the integration job of CI · Tests), so a red on a PR can be a real bug a test caught. The history grows from the first collector run.</p></section>`;
}

const CSS = `${CHIP_STYLE}.gtmhero{display:flex;gap:24px;align-items:center;flex-wrap:wrap}.gauge{width:130px;height:130px;flex:none}.verdict{font-size:19px;margin:0 0 6px}.gtmhero>div{flex:1 1 320px;min-width:0}.gtmhero .muted{margin:0}
.scroll{overflow-x:auto}table{width:100%;font-size:14px}td:nth-child(2){min-width:170px}td:last-child{white-space:nowrap}th,td{padding-left:6px;padding-right:6px}h2{margin:0 0 8px}td.num,th.num{text-align:right}.nowrap{white-space:nowrap}
.strip{display:inline-flex;gap:2px;vertical-align:middle}.strip i,.strip a{display:block;width:6px;height:18px;border-radius:2px}.strip .g{background:#3fb68b}.strip .r{background:#e5484d}.strip .e{background:var(--line,#262c33)}`;

export function page(snapshot, {now = new Date()} = {}) {
  const rows = snapshot ? tier1Rows(snapshot, now) : [], say = verdict(rows);
  const body = !snapshot ? '<section class="card"><h2>No data yet</h2><p class="muted">The collector (<code>e2e-intel.yml</code>) fills this page from the e2e and integration runs.</p></section>'
    : `<section class="card"><div class="gtmhero">${gauge(say.stable, say.total)}<div><p class="verdict"><b>${esc(say.text)}</b></p><p class="muted">Tier 1 = the journeys that block a user's flow; each is proved by e2e steps after every merge, in the beta and the night. Tier 2 = integration tests only.</p></div></div></section>
${tier1Card(rows)}\n${tier2Card(tier2Rows(snapshot, now))}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>GTM readiness · Testing · Admin</title>
<link rel="icon" href="/favicon-32.png"><style>${CSS}</style></head><body><main>
<header><h1>🚦 GTM readiness</h1><span class="muted">${snapshot ? `as of ${esc(snapshot.at.slice(0, 16).replace('T', ' '))} UTC · critical journeys of <code>desktop/e2e/critical-journeys.json</code>` : ''}</span></header>
${body}</main></body></html>`;
}

export async function view(request, env) {
  if (!await viewer(request, env)) return new Response('Not found', {status: 404});
  const url = new URL(request.url);
  if (url.searchParams.has('key')) return remember(url, env, request);
  return new Response(page(await readSnapshot(env.STATS)), {headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex'}});
}
