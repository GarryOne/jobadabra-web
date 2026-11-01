// The one verdict band of the Testing pages (owner, 1 Nov 2026: "here again too much text" on GTM readiness; "it's too hard to read" on Synthetic Monitoring): one short bold line,
// the exceptions as small chips (never a sentence), one muted note. Overview, Synthetic Monitoring and GTM readiness draw theirs here, so they cannot drift apart again.
import {esc} from '../shared/html.js';
import {chip, CHIP_STYLE} from './chip.js';

/** The inside of a band: `headline` (plain text, ≤ ~6 words), `chips` [{label, tone, title?, href?}] (a red/amber exception each, the date or reason in `title`), `note` (one muted line). */
export function verdictInner({icon = '', headline, chips = [], note = ''}) {
  const one = c => {
    const body = chip(esc(c.label), c.tone || '');
    const link = c.href ? `<a href="${esc(c.href)}">${body}</a>` : body;
    return c.title ? `<span title="${esc(c.title)}">${link}</span>` : link;
  };
  return `<p class="vb-line">${icon ? `<span class="vb-icon" aria-hidden="true">${icon}</span>` : ''}<b>${esc(headline)}</b></p>`
    + (chips.length ? `<p class="vb-chips">${chips.map(one).join(' ')}</p>` : '')
    + (note ? `<small class="muted vb-note">${esc(note)}</small>` : '');
}

/** A whole band as a card section. */
export const verdictBand = parts => `<section class="card band">${verdictInner(parts)}</section>`;

export const BAND_STYLE = `${CHIP_STYLE}
.vb-line{font-size:18px;line-height:1.3;margin:0 0 6px}.vb-icon{margin-right:8px}.vb-chips{margin:0 0 6px;display:flex;gap:6px;flex-wrap:wrap}.vb-chips a{text-decoration:none}.vb-note{display:block;font-size:12px}`;
