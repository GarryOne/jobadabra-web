
import {AGREE, REASONS} from '../shared/closed-sites.js';

// /admin/scouting "Closed sites": sites and boards installs found refused, browser-only, unreachable, page gone or without a feed, with who agrees and when each is tried again (owner, 20 Oct 2026). Host names, counts and dates only. Tests: test/closed-sites.test.js.
const esc = value => String(value ?? '').replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));
export const retryOn = (row, today = new Date()) => {
  const date = new Date(Date.parse(row.last) + REASONS[row.reason].rest * 86400000).toISOString().slice(0, 10);
  return date <= today.toISOString().slice(0, 10) ? 'due now' : date;
};
export function section(rows = [], today = new Date()) {
  const sorted = [...rows].sort((a, b) => (b.last || '').localeCompare(a.last || ''));
  const count = reason => sorted.filter(row => row.reason === reason).length;
  const chip = (key, label, n) => `<button type="button" class="filter" data-closed="${key}" aria-pressed="${key === ''}">${label} · ${n}</button>`;
  const body = sorted.map(row => `<tr data-reason="${row.reason}"><td>${esc(row.site)}<br><small class="muted">${esc(row.label ? row.label + ' · ' : '')}${esc(row.source)}</small></td>
<td><span class="pill">${REASONS[row.reason].label}</span></td><td class="n">${row.installs}</td><td>${esc(row.first)}</td><td>${esc(row.last)}</td><td>${retryOn(row, today)}</td><td>${row.served ? 'yes' : 'not yet'}</td></tr>`).join('');
  const served = sorted.filter(row => row.served).length;
  return `<section class="card" id="closed-sites"><h2>🚧 Closed sites · ${sorted.length}</h2>
<small class="muted">Sites and boards installs found refused, browser-only, unreachable, gone or without a feed. ${served} of ${sorted.length} are served, so installs skip them until the retry date. How often installs skipped: <a href="/admin/installs">/admin/installs</a>.</small>
<div class="filters seg" style="margin:10px 0 0">${chip('', 'All', sorted.length)}${Object.entries(REASONS).map(([key, {label}]) => chip(key, label, count(key))).join('')}</div>
<div class="scroll"><table><tr><th>Site or board</th><th>Reason</th><th>Installs agreeing</th><th>First seen</th><th>Last seen</th><th>Next retry</th><th>Served</th></tr>
${body || '<tr><td colspan="7" class="muted">Nothing reported yet.</td></tr>'}</table></div>
<small class="muted">Served = ${AGREE} installs agree (a single report is enough for No feed). Rests: ${Object.values(REASONS).map(r => r.label.toLowerCase() + ' ' + r.rest).join(', ')} days.</small>
<script>document.querySelectorAll('[data-closed]').forEach(b => b.onclick = () => { document.querySelectorAll('[data-closed]').forEach(x => x.setAttribute('aria-pressed', x === b));
  document.querySelectorAll('#closed-sites tr[data-reason]').forEach(tr => { tr.hidden = !!b.dataset.closed && tr.dataset.reason !== b.dataset.closed; }); });</script></section>`;
}
