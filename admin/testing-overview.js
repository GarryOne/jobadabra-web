// /admin/testing/overview: every method we use to find bugs and keep the app stable, one card each in four rings (owner, 1 Nov 2026). The catalogue is admin/testing-overview-methods.js,
// the stored rows behind each card are resolved in admin/testing-overview-data.js; this file draws them. No AI, no new table. Guard: test/admin/testing-overview.test.js.
import {viewer, remember} from '../shared/auth.js';
import {esc} from '../shared/html.js';
import {PAGES} from './admin.js';
import {chip, CHIP_STYLE} from './chip.js';
import {load, resolve} from './testing-overview-data.js';

const HOUR = 3600000, DAY = 86400000;
/** "5 min ago" / "3 h ago" / "2 days ago" for a run's time; a date without a time counts whole days. */
export function ago(at, now = new Date()) {
  if (!at) return '';
  const dated = !String(at).includes('T'), diff = now.getTime() - Date.parse(dated ? `${at}T12:00:00Z` : at);
  if (!Number.isFinite(diff)) return '';
  if (dated || diff >= 2 * DAY) { const days = Math.max(0, Math.round(diff / DAY)); return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`; }
  return diff < HOUR ? `${Math.max(1, Math.round(diff / 60000))} min ago` : `${Math.round(diff / HOUR)} h ago`;
}

const STATE = {green: ['✓ green', 'good'], red: ['✕ red', 'bad'], none: ['◷ no run stored', 'off']};
/** The last-run chip: icon + word + time, a link to the run when there is one; "late" when a scheduled run was missed. */
export function lastChip(last, now) {
  const [word, tone] = STATE[last.state] || STATE.none;
  const text = last.state === 'none' ? word : `${word} · ${esc(ago(last.at, now))}`;
  const body = last.url ? `<a href="${esc(last.url)}">${chip(text, tone)}</a>` : `<span title="${esc(last.why || '')}">${chip(text, tone)}</span>`;
  return `${body}${last.late ? ` ${chip('late', 'warn')}` : ''}${last.note ? ` <span class="muted small">${esc(last.note)}</span>` : ''}`;
}

const CARD_CHIP = {green: ['✓ green', 'good'], red: ['✕ red', 'bad'], none: ['◷ no run', 'off']};
const lineHtml = (line, now, scheduled) => `<li><div class="what">${esc(line.label)}${line.when ? ` <span class="muted">· ${scheduled ? `<a href="${esc(scheduled)}">${esc(line.when)}</a>` : esc(line.when)}</span>` : ''}</div><div>${lastChip(line.last, now)}${line.last.explicit ? ` <span class="muted small">${esc(line.last.why)}</span>` : ''}</div></li>`;
const bugsHtml = bugs => (bugs.why ? `<div class="bugs"><span class="muted">Bugs caught</span> <b>—</b> <span class="muted small">${esc(bugs.why)}</span></div>`
  : `<div class="bugs"><span class="muted">Bugs caught</span> <b>${esc(bugs.text)}</b>${bugs.window ? ` <span class="muted small">· ${esc(bugs.window)}</span>` : ''}${bugs.detail ? ` <span class="muted small">· ${esc(bugs.detail)}</span>` : ''}</div>`);

function cardHtml(card, now, scheduled) {
  if (card.kind === 'planned') return `<article class="mcard planned"><h3>${card.icon} ${esc(card.title)} ${chip('◷ planned', 'off')}</h3><p class="muted">${esc(card.proves)}</p></article>`;
  const head = card.state === 'link' ? (card.pending ? chip('◷ being built', 'off') : '') : chip(...CARD_CHIP[card.state]);
  return `<article class="mcard"><h3>${card.icon} ${esc(card.title)} ${head}</h3><p class="muted">${esc(card.proves)}</p>
<ul class="lines">${card.lines.filter(line => card.state !== 'link' || line.last.state !== 'none').map(line => lineHtml(line, now, scheduled)).join('')}</ul>${card.state === 'link' ? '' : bugsHtml(card.bugs)}
${card.href ? `<a class="open" href="${esc(card.href)}">Open the page →</a>` : ''}</article>`;
}

const STYLE = `${CHIP_STYLE}
.band{margin-bottom:12px}.band b{font-weight:650}.band .big{font-size:18px;line-height:1.35}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:0 0 8px}
.tile b{display:block;font-size:28px;margin:4px 0;font-variant-numeric:tabular-nums}.ring{margin:22px 0 8px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#8d949c}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}.mcard{background:#14181d;border:1px solid #262c33;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:8px;min-width:0}
.mcard.planned{background:transparent;border-style:dashed;opacity:.8}.mcard h3{margin:0;font-size:15px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mcard p{margin:0;font-size:13px}
.lines{list-style:none;margin:0;padding:0;display:grid;gap:6px}.lines li{display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap;font-size:13px;border-top:1px solid #262c33;padding-top:6px}
.lines li:first-child{border-top:0;padding-top:0}.lines .what{min-width:0}.small{font-size:12px}.bugs{font-size:13px;margin-top:auto}.open{font-size:13px;text-decoration:none}`;

/** The page; `model` = resolve(...) output, `at` = when the rows were read. */
export function page(model, {now = new Date()} = {}) {
  const {counts, red} = model, ran = counts.green + counts.red;
  const verdict = counts.red ? `🔴 <b>${counts.red} of ${counts.live} methods ${counts.red === 1 ? 'is' : 'are'} red on the last run</b>: ${red.map(esc).join(', ')}.`
    : `🟢 <b>${counts.green} of ${counts.live} methods ran green on the last run.</b>`;
  const tile = (label, value, state, tone) => `<section class="card tile"><span class="muted">${label}</span><b>${value}</b>${chip(state, tone)}</section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Overview · Testing · Admin</title>
<link rel="icon" href="/favicon-32.png"><style>${STYLE}</style></head><body><main>
<header><h1>🧪 Testing overview</h1><span class="muted">${model.rings.length} rings · ${counts.live} methods running · ${counts.planned} planned · unit tests are not listed: they are for agent development</span></header>
<section class="card band"><div class="big">${verdict}${counts.none ? ` ${counts.none} ${counts.none === 1 ? 'has' : 'have'} no stored run to judge.` : ''} ${counts.planned} more ${counts.planned === 1 ? 'is' : 'are'} planned.</div></section>
<div class="tiles">${tile('Methods running', String(counts.live), `${ran} with a stored run`, 'off')}${tile('Green on the last run', String(counts.green), '✓ green', 'good')}${tile('Red on the last run', String(counts.red), counts.red ? '✕ red' : '✓ none', counts.red ? 'bad' : 'good')}${tile('No stored run', String(counts.none), '◷ not judged', 'off')}</div>
${model.rings.map(ring => `<div class="ring">${ring.icon} ${esc(ring.title)} <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">· ${esc(ring.note)}</span></div>
<div class="grid">${ring.cards.map(card => cardHtml(card, now, model.scheduled)).join('')}</div>`).join('\n')}
</main></body></html>`;
}

export async function view(request, env, now = new Date()) {
  if (!await viewer(request, env)) return new Response('Not found', {status: 404});
  const url = new URL(request.url);
  if (url.searchParams.has('key')) return remember(url, env, request);
  const model = resolve(await load(env, now), {pages: PAGES.map(item => item.path)});
  return new Response(page(model, {now}), {headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex'}});
}
