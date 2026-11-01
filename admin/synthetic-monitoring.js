// /admin/testing/synthetic-monitoring: the checks that test the live app on the clock, with no code change and no commit behind them (owner, 1 Nov 2026: "Add a separate tab on the Admin -> Testing,
// to be called Synthetic Monitoring"). One table, one row per probe: what it checks, how often, the last result and the last 14 days. The Worker's own probe rounds (shared/synthetic.js) and the
// scheduled workflows that look at something live (the Scheduled tab's snapshot). Both are read by the readers that already exist; no query of its own, no AI. Guard: test/admin/synthetic-monitoring.test.js.
import {viewer, remember} from '../shared/auth.js';
import {esc} from '../shared/html.js';
import {PROBES, ROUND_MINUTES, readCard, readDays} from '../shared/synthetic.js';
import {words} from '../shared/schedules-model.js';
import {CHIP_STYLE} from './chip.js';
import {read as readSchedules} from './schedules.js';
import {lastOf} from './testing-overview-data.js';
import {daysTo, historyOf, MAP_DAYS} from './testing-overview-history.js';
import {cellHtml, dayHeads, MAP_STYLE} from './testing-overview-map.js';
import {lastChip} from './testing-overview.js';

const REPO = 'GarryOne/jobadabra';
/** What each Worker probe checks, in words; a probe added to shared/synthetic.js without a line here fails the guard test. */
export const OWN_WHAT = {
  site: 'The public website answers with the Jobadabra page',
  index: 'The employer index pack still holds employers and jobs',
  license: 'A fixed test install gets a plan answer back (the licence check)',
  'free-ai': 'The same test install can list Free AI models and read its caps',
  updates: 'The update feed offers the newest release with the Mac and Windows installers',
  broker: 'The Free AI broker answers and has its day meters',
};
/** The scheduled workflows that look at something live (not fixed or recorded inputs); each row reads the Scheduled tab's snapshot. */
export const WORKFLOWS = [
  {wf: 'release-guard.yml', label: 'Release · Guard Latest', what: 'Only a desktop release holds "Latest", the one the Download link and the updater follow'},
  {wf: 'schedule-watchdog.yml', label: 'Schedule watchdog', what: "The Worker's timers started the scheduled runs on time"},
  {wf: 'stable-canary.yml', label: 'Stable canary', what: "The stable build still works against the live world: Notion's API, the job sites' forms, certificates"},
  {wf: 'watch-live.yml', label: 'Daily watch list', what: 'Watched employer forms still fill, recorded live (held, never Submit)'},
];

const none = why => ({state: 'none', why});
/** One Worker probe's last result: red when it is down (2 reds in a row, the rule that alerts) or the rounds stopped, else green; a single miss is noted, not red. */
function ownLast(card, probe, now) {
  if (!card) return none('the probe tables are not readable from the Worker right now');
  if (card.stale) return {state: 'red', word: 'no round', at: card.lastRoundAt, note: 'no probe round for over 45 min'};
  const found = (card.probes || []).find(item => item.probe === probe.id);
  if (!found) return none('no round has stored this probe yet');
  const note = found.state === 'down' ? found.reason : !found.ok ? `one miss: ${found.reason}` : found.uptime24h != null ? `${found.uptime24h}% up in 24 h` : '';
  return {state: found.state === 'down' ? 'red' : 'green', at: found.at, note};
}

/** The table's rows from the stored readings: {data: {schedules, synthetic, syntheticDays, repo, now}} -> {rows, counts, red}. */
export function model(data) {
  const job = file => (data.schedules?.jobs || []).find(item => item.file === file && item.repo === data.repo);
  const round = historyOf(data, [{last: {synthetic: true}}]);
  const own = PROBES.map(probe => ({id: probe.id, label: probe.label, what: OWN_WHAT[probe.id] || '', cadence: `every ${60 / ROUND_MINUTES.length} min`, last: ownLast(data.synthetic, probe, data.now), days: round, href: ''}));
  const flows = WORKFLOWS.map(item => ({id: item.wf, label: item.label, what: item.what, cadence: (job(item.wf)?.crons || []).map(cron => words(cron, data.now)).join(', ') || 'no schedule listed',
    last: lastOf(data, {wf: item.wf}), days: historyOf(data, [{wf: item.wf}]), href: `https://github.com/${data.repo}/actions/workflows/${item.wf}`}));
  const rows = [...own, ...flows];
  const red = rows.filter(row => row.last.state === 'red').map(row => row.label);
  return {rows, red, counts: {all: rows.length, red: red.length, green: rows.filter(row => row.last.state === 'green').length, none: rows.filter(row => row.last.state === 'none').length}};
}

const rowHtml = (row, now) => `<tr class="${row.last.state === 'red' ? 'is-red' : ''}"><th scope="row">${row.href ? `<a href="${esc(row.href)}">${esc(row.label)}</a>` : esc(row.label)}<div class="muted small what">${esc(row.what)}</div></th>
<td class="when">${esc(row.cadence)}</td><td class="res">${lastChip(row.last, now)}</td>${row.days.map(cellHtml).join('')}</tr>`;

const STYLE = `${CHIP_STYLE}
.band .big{font-size:18px;line-height:1.35}.sm .when{white-space:nowrap;font-size:13px;color:#c9c3b6;padding-right:12px}.sm .res{white-space:nowrap;padding-right:12px}.sm th .what{font-weight:400;white-space:normal;max-width:380px}
.sm tr.group th{padding:14px 0 4px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#8d949c}`;

/** The page. `data` = the three stored readings plus {repo, now}; nothing here reads or writes. */
export function page(data) {
  const {rows, red, counts} = model(data), now = data.now, days = daysTo(now);
  const verdict = counts.red ? `🔴 <b>${counts.red} of ${counts.all} live checks ${counts.red === 1 ? 'is' : 'are'} red</b>: ${red.map(esc).join(', ')}.` : `🟢 <b>${counts.green} of ${counts.all} live checks are green.</b>${counts.none ? ` ${counts.none} ${counts.none === 1 ? 'has' : 'have'} no stored run to judge.` : ''}`;
  const group = title => `<tr class="group"><th colspan="${days.length + 3}">${title}</th></tr>`;
  const ownRows = rows.slice(0, PROBES.length), flowRows = rows.slice(PROBES.length);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Synthetic Monitoring · Testing · Admin</title>
<link rel="icon" href="/favicon-32.png"><style>${STYLE}
${MAP_STYLE}</style></head><body><main>
<header><h1>📡 Synthetic Monitoring</h1></header>
<section class="card band"><div class="big">${verdict}</div></section>
<section class="card hmap sm"><h2>What is checked, and how it went · last ${days.length} days</h2>
<div class="keys"><span><i class="c c-green">✓</i>no check red</span><span><i class="c c-red">✕</i>a check was red</span><span><i class="c c-none"></i>no run that day</span><span><i class="c c-unknown"></i>not stored</span><span class="muted">a probe is red after 2 misses in a row, the rule that sends the Telegram line</span></div>
<div class="scroll"><table><thead><tr><th class="m">Check</th><th>How often</th><th>Last result</th>${dayHeads(days)}</tr></thead>
<tbody>${group('📡 The Worker probes the live services (one request each)')}${ownRows.map(row => rowHtml(row, now)).join('')}
${group('⏰ Scheduled jobs that look at something live')}${flowRows.map(row => rowHtml(row, now)).join('')}</tbody></table></div>
<p class="muted small">Not here: scheduled tests on fixed or recorded inputs (judge exam, answer drift, planted bugs, page cases, the weekly upgrade + data test). They are on <a href="/admin/testing/scheduled">Scheduled</a>.</p></section>
</main></body></html>`;
}

/** What the page reads: the Worker's probe rounds and the Scheduled tab's snapshot, each through the reader that already exists. */
export async function load(env, now = new Date()) {
  const [schedules, synthetic, syntheticDays] = await Promise.all([readSchedules(env), readCard(env, now), readDays(env, MAP_DAYS, now)]);
  return {repo: env.GITHUB_REPO || REPO, schedules, synthetic, syntheticDays, now};
}

export async function view(request, env, now = new Date()) {
  if (!await viewer(request, env)) return new Response('Not found', {status: 404});
  const url = new URL(request.url);
  if (url.searchParams.has('key')) return remember(url, env, request);
  return new Response(page(await load(env, now)), {headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex'}});
}
