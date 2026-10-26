// Charts for /admin/job-search/installs: the employer list over time split into the central scout's part and what installs added. Plain SVG strings
// on the admin's dark surface, hover text through the page's [data-tip] tooltip. Tests: test/installsimpact.test.js.
import {C, esc, n} from '../shared/scoutingcharts.js';

// Stacked areas, oldest first: rows [{day, central, installs}]. One scale from 0, the top labelled; each day has a hover column.
export function stacked(rows, {width = 420, height = 170, label = ''} = {}) {
  if (rows.length < 2) return '<p class="muted empty">Needs two daily snapshots: the second comes with the next publish.</p>';
  const left = 38, bottom = 18, top = 8, pw = width - left - 6, ph = height - bottom - top;
  const max = Math.max(1, ...rows.map(row => row.central + row.installs));
  const x = i => left + (i * pw) / (rows.length - 1), y = value => top + ph - (value * ph) / max;
  const area = (upper, lower) => rows.map((row, i) => `${x(i).toFixed(1)},${y(upper(row)).toFixed(1)}`).join(' ') + ' '
    + rows.map((row, i) => `${x(rows.length - 1 - i).toFixed(1)},${y(lower(rows[rows.length - 1 - i])).toFixed(1)}`).join(' ');
  const grid = [0, max / 2, max].map(value => `<line x1="${left}" x2="${width - 6}" y1="${y(value).toFixed(1)}" y2="${y(value).toFixed(1)}" stroke="${C.faint}"/>`
    + `<text x="${left - 4}" y="${(y(value) + 3).toFixed(1)}" text-anchor="end" fill="${C.muted}" font-size="10">${n(Math.round(value))}</text>`).join('');
  const hover = rows.map((row, i) => `<rect x="${(x(i) - pw / rows.length / 2).toFixed(1)}" y="${top}" width="${(pw / rows.length).toFixed(1)}" height="${ph}" fill="transparent" data-tip="${esc(`${row.day} · ${n(row.central + row.installs)} employers · ${n(row.installs)} from installs`)}"/>`).join('');
  return `<svg viewBox="0 0 ${width} ${height}" style="width:100%;height:auto" role="img" aria-label="${esc(label)}: ${n(rows[rows.length - 1].installs)} of ${n(rows[rows.length - 1].central + rows[rows.length - 1].installs)} from installs today">${grid}`
    + `<polygon points="${area(row => row.central, () => 0)}" fill="${C.gray}"/>`
    + `<polygon points="${area(row => row.central + row.installs, row => row.central)}" fill="${C.accent}" stroke="${C.surface}" stroke-width="2"/>`
    + `<text x="${left}" y="${height - 4}" fill="${C.muted}" font-size="10">${esc(rows[0].day)}</text><text x="${width - 6}" y="${height - 4}" text-anchor="end" fill="${C.muted}" font-size="10">${esc(rows[rows.length - 1].day)}</text>${hover}</svg>`;
}
