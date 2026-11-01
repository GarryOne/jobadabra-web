// How the nightly summary (admin/nightly-summary.js) is drawn, once, for the two pages that show it: the Testing Overview cards and the Testing → Scheduled rows (owner, 1 Nov 2026).
// A job = its name, last night's key number as a chip (icon + word for the verdict), and 14 cells, one per night, oldest first: a bar for a rate or a count (a line marks its bar or
// its median), a dot for a green/red night; grey for a night with no result. Only draws; no reader, no table. Guard: test/admin/nightly-summary.test.js.
import {esc} from '../shared/html.js';

// Own chip classes (nchip): /admin/testing/scheduled has its own .chip colours (shared/.. schedules.js CSS), the Overview uses admin/chip.js; this draws the same on both.
const STATUS = {good: ['✓ ok', 'good'], warn: ['! watch', 'warn'], bad: ['✕ off', 'bad'], none: ['◷ no data', 'off']};
const chip = (word, tone) => `<span class="nchip ${tone}">${esc(word)}</span>`;
const UNIT = {'beta-clock': ' min', 'night-clock': ' min'};
const pct = value => `${Math.round(value * 100)}%`;

// What one night says in the cell's tooltip.
function pointText(job, point) {
  if (point.value == null && point.ok == null) return `${point.day}: no result`;
  const verdict = point.ok == null ? '' : point.ok ? ' · ok' : ' · not ok';
  if (point.value == null) return `${point.day}: ${point.ok ? 'green' : 'red'}`;
  const rate = job.bar && job.bar.value != null && job.bar.value <= 1 && job.id !== 'agent-coding';
  return `${point.day}: ${rate ? pct(point.value) : `${point.value}${UNIT[job.id] || ''}`}${verdict}`;
}

/** The 14 cells of one job; a numeric series is bars scaled to the series (rates 0..1 to the full height), a green/red one is a row of dots. */
export function trendBars(job) {
  const numeric = job.series.some(point => point.value != null);
  const rate = numeric && job.series.every(point => point.value == null || point.value <= 1) && job.id !== 'agent-coding' && !UNIT[job.id];
  const top = rate ? 1 : Math.max(1, ...job.series.map(point => point.value ?? 0), job.median ?? 0);
  const line = job.bar && job.bar.value != null ? job.bar.value : job.median ?? null;
  const cells = job.series.map(point => {
    const tone = point.ok === true ? 'ok' : point.ok === false ? 'no' : point.value != null ? 'num' : 'gap';
    const height = !numeric ? (tone === 'gap' ? 30 : 100) : point.value == null ? 8 : Math.max(10, Math.round((point.value / top) * 100));
    return `<i class="${tone}" style="height:${height}%" title="${esc(pointText(job, point))}"></i>`;
  }).join('');
  const mark = numeric && line != null ? `<s style="bottom:${Math.round((line / top) * 100)}%" title="${esc(job.bar ? job.bar.label : `median ${line} min`)}"></s>` : '';
  const words = job.series.filter(point => point.value != null || point.ok != null).length;
  return `<div class="nbars${numeric ? '' : ' dots'}" role="img" aria-label="${esc(`${job.title}: ${words} of ${job.series.length} nights have a result`)}">${cells}${mark}</div>`;
}

/** One job as a block: title, key number, verdict chip, the 14 nights, and (full) the line under it. compact = one tight row for a table cell. */
export function trendHtml(job, {compact = false} = {}) {
  const [word, tone] = STATUS[job.status] || STATUS.none, badge = job.status === 'none' && job.value !== '–' ? '' : chip(word, tone);   // a number with no bar to judge it by (a wall clock) shows no verdict chip, never "no data"
  const bars = job.series.length ? trendBars(job) : '<div class="nbars none" aria-hidden="true"></div>';
  const bar = job.bar ? `<span class="muted small">bar: ${esc(job.bar.label)}</span>` : '';
  if (compact) return `<div class="nt compact"><span class="ntitle">${esc(job.title)}</span> <b>${esc(job.value)}</b> ${badge}${bars}</div>`;
  return `<div class="nt"><div class="nhead"><span class="ntitle">${esc(job.title)}</span> <b>${esc(job.value)}</b> ${badge}</div>${bars}<div class="muted small">${esc(job.sub)}${bar ? ` · ${bar}` : ''}</div></div>`;
}

/** A card's or a row's jobs (an empty list draws nothing). */
export const trendsHtml = (jobs, options) => (jobs && jobs.length ? `<div class="nts">${jobs.map(job => trendHtml(job, options)).join('')}</div>` : '');

export const NIGHTLY_STYLE = `.nchip{display:inline-block;border:1px solid #2a2f37;border-radius:999px;padding:1px 9px;font-size:12px;line-height:18px;white-space:nowrap;font-weight:400;color:#8d949c;background:transparent}
.nchip.good{border-color:#1f5a45;color:#3fb68b;background:#11261e}.nchip.warn{border-color:#4a3c1c;color:#f5b54a;background:#2a2312}.nchip.bad{border-color:#5a2326;color:#e5484d;background:#2a1213}
.nts{display:grid;gap:8px;border-top:1px solid #262c33;padding-top:8px}.nt{display:grid;gap:3px;font-size:13px;min-width:0}.nt .nhead{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.nt .ntitle{color:#8d949c;white-space:nowrap}.nt.compact{display:flex;flex-wrap:wrap;align-items:center;gap:3px 8px;min-width:230px}.nt.compact .nbars{flex:0 0 100%}
.nbars{position:relative;display:flex;align-items:flex-end;gap:3px;height:28px;min-width:120px;max-width:260px}.nbars i{flex:1 1 0;min-width:5px;border-radius:2px;background:#3a424c}
.nbars i.ok{background:#3fb68b}.nbars i.no{background:#e5484d}.nbars i.num{background:#6f8fb3}.nbars i.gap{background:transparent;border:1px solid #3a424c}.nbars.dots{height:12px;align-items:center}.nbars.dots i{height:100%;border-radius:50%;flex:0 0 9px}
.nbars.none{border-bottom:1px dashed #3a424c;height:12px}.nbars s{position:absolute;left:0;right:0;border-top:1px dashed #f5b54a;pointer-events:none}`;
