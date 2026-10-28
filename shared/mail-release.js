// The "What's new" mail at a stable release (spec docs/superpowers/specs/2026-10-28-release-mail-design.md): a navy hero with the one main change, then numbered
// sections, each with plain words, the app's own words as light-blue pills (*Find* in the text), optional steps and an app screenshot (demo data, hosted on the site).
// Email-safe: tables, inline styles, alt text. Data: {name?, version, month, headline, intro, hero?: {url, alt}, sections: [{title, text, steps?: [string], image?: {url, alt}}], updateUrl}.
import {button, esc, SITE} from './mail-frame.js';
import {LIGHT as C} from './mail-palette.js';

const FONT = '-apple-system,\'Segoe UI\',Helvetica,Arial,sans-serif';
const pill = text => `<span class="jp-pill" style="background:${C.soft};color:${C.softInk};border-radius:4px;padding:1px 6px;font-weight:600;white-space:nowrap">${esc(text)}</span>`;
export const withPills = text => esc(text).replace(/\*([^*]+)\*/g, (_, word) => pill(word.replace(/&amp;/g, '&')));
const plain = text => String(text ?? '').replace(/\*([^*]+)\*/g, '$1');
const picture = image => (image?.url ? `<p style="margin:12px 0 0"><img src="${esc(image.url)}" alt="${esc(image.alt || '')}" width="100%" style="display:block;width:100%;height:auto;border:1px solid ${C.line};border-radius:8px"></p>` : '');

export const releaseSubject = ({headline}) => `New in Jobadabra: ${plain(headline)}`;

export function releaseHero({name, version, month, headline, intro, hero}) {
  const hi = name ? `Hi ${esc(name)}, ` : 'Hi, ';
  return `<tr><td style="background:${C.hero};padding:26px 24px 0;color:${C.onHero};border-radius:12px 12px 0 0">`
    + `<p style="margin:0 0 14px;font-size:12px;letter-spacing:.04em;color:${C.onHeroMuted}"><img src="${SITE}/images/logo-mark.png" width="22" height="19" alt="" style="vertical-align:middle;border:0"> &nbsp;What's new in Jobadabra · ${esc(month)}</p>`
    + `<h1 style="margin:0 0 12px;font:700 22px/1.25 ${FONT};color:${C.onHero}">${withPills(headline).replace(/<span[^>]*>/g, '').replace(/<\/span>/g, '')}</h1>`
    + `<p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:${C.onHero}">${hi}Jobadabra ${esc(version)} is out. Here is what changed, and at the end, how to update in one click.</p>`
    + `${intro ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:${C.onHero}">${esc(intro)}</p>` : ''}`
    + `${hero?.url ? `<img src="${esc(hero.url)}" alt="${esc(hero.alt || '')}" width="100%" style="display:block;width:100%;height:auto;border-radius:8px 8px 0 0;border:0">` : '<div style="height:6px"></div>'}</td></tr>`;
}

export function releaseHtml({sections = [], updateUrl}) {
  const rows = sections.map((section, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="jp-line" style="${i ? `border-top:1px solid ${C.line};` : ''}margin-top:${i ? 22 : 0}px"><tr><td style="padding-top:${i ? 22 : 0}px">`
    + `<p class="jp-sig" style="margin:0 0 4px;font:700 13px ${FONT};color:${C.signal}">${String(i + 1).padStart(2, '0')}</p>`
    + `<h2 class="jp-ink" style="margin:0 0 8px;font:700 19px/1.3 ${FONT}">${esc(section.title)}</h2>`
    + `<p style="margin:0 0 8px;line-height:1.7">${withPills(section.text)}</p>`
    + (section.steps?.length ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 0">${section.steps.map((step, n) => `<tr><td valign="top" class="jp-sig" style="padding:3px 10px 3px 0;font-weight:700;color:${C.signal}">${n + 1}</td><td style="padding:3px 0;line-height:1.6">${withPills(step)}</td></tr>`).join('')}</table>` : '')
    + picture(section.image) + `</td></tr></table>`).join('');
  return `${rows}<p style="margin:26px 0 0;font-weight:700;font-size:17px" class="jp-ink">Update in one click</p>`
    + `<p style="margin:4px 0 0;line-height:1.6">Open Jobadabra and choose <b>Update</b> from the menu, or download the new version below. Your searches and settings stay as they are.</p>`
    + (updateUrl ? button({label: 'Get the new version', url: updateUrl}) : '');
}

export function releaseText({name, version, month, headline, sections = [], updateUrl}) {
  const parts = sections.map((s, i) => [`${String(i + 1).padStart(2, '0')}  ${s.title}`, plain(s.text), ...(s.steps || []).map((step, n) => `  ${n + 1}. ${plain(step)}`)].join('\n'));
  return [`What's new in Jobadabra · ${month}`, '', plain(headline), '', `${name ? `Hi ${name}, ` : 'Hi, '}Jobadabra ${version} is out. Here is what changed.`, '', ...parts.flatMap(p => [p, '']),
    'Update in one click: open Jobadabra and choose Update from the menu.', updateUrl ? `Or download it: ${updateUrl}` : ''].join('\n');
}
