// /admin/email (owner, 26 Oct 2026: "so that we can keep track and manage this from admin also"): the switches, how much mail went out and was refused, who can still get it, the templates and the digest queue.
// Read-only; it replaces the Signups page (owner, 26 Oct 2026: merged; /admin/signups redirects here); the Pro-launch send is still POST /admin/mail/launch (admin/signups.js). Addresses never show (short hash only). Data: admin/email-data.js. Guard: tests/test_site_admin_email.js.
import {viewer} from '../shared/auth.js';
import {esc} from '../shared/html.js';
import {collect as accountsOf} from './signups.js';
import {collect, windowOf, WINDOWS} from './email-data.js';
import {previews} from './email-preview.js';
import {TEST_INBOX, testSend} from './email-test-send.js';

const n = value => (Number(value) || 0).toLocaleString('en-US');

const templateCard = (mail, sent) => `<section class="card tpl"><h2>${esc(mail.name)}</h2><p class="muted">${esc(mail.list)}${mail.essential ? ' · essential' : ''} · sent ${n(sent)} in the window</p>${mail.error ? `<p>Cannot render: ${esc(mail.error)}</p>` : `<p><b>${esc(mail.subject)}</b></p><iframe sandbox title="${esc(mail.name)}" srcdoc="${esc(mail.html)}"></iframe><form method="post" action="/admin/email"><input type="hidden" name="template" value="${esc(mail.name)}"><button type="submit">Send to test inbox</button></form>`}</section>`;

// ?test=<template>:<sent or a refusal reason> after a test send; only known words are printed.
const noticeOf = value => {
  const [template, result] = String(value || '').split(':');
  if (!previews().some(mail => mail.name === template) || !/^[a-z_]+$/.test(result || '')) return '';
  return `<p class="pill ${result === 'sent' ? 'on' : 'off'}">${esc(template)}: ${result === 'sent' ? 'sent to the test inbox' : `not sent (${esc(result)})`}</p>`;
};

export function page(data, accounts = null, notice = '') {
  const tile = (label, value, note) => `<section class="card tile"><span class="muted">${label}</span><b>${n(value)}</b><span class="muted">${note}</span></section>`;
  const table = (title, head, rows) => `<section class="card"><h2>${title}</h2>${rows.length ? `<table><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map((c, i) => `<td${i ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</table>` : '<p class="muted">Nothing yet.</p>'}</section>`;
  const top = Math.max(1, ...data.perDay.map(row => (row.sent || 0) + (row.refused || 0)));
  const bars = data.perDay.map(row => `<i class="s" style="height:${Math.round(100 * (row.sent || 0) / top)}%" title="${esc(row.day)}: ${n(row.sent)} sent"></i><i class="r" style="height:${Math.round(100 * (row.refused || 0) / top)}%" title="${esc(row.day)}: ${n(row.refused)} refused"></i>`).join('');
  const windows = WINDOWS.map(d => d === data.days ? `<b>${d} days</b>` : `<a href="/admin/email?days=${d}">${d}</a>`).join(' · ');
  const switches = data.switches.map(s => `<span class="pill ${s.on ? 'on' : 'off'}">${esc(s.name)} ${s.on ? 'on' : 'off'}</span>`).join(' ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>E-mail · Admin</title>
<style>.tpl form{margin-top:10px}.tpl button{font:inherit;font-size:13px;color:#f5b54a;background:#1b2027;border:1px solid #f5b54a;border-radius:6px;padding:5px 12px;cursor:pointer}.tpl button:hover{background:#262c33}.tpl button:focus-visible{outline:2px solid #f5b54a;outline-offset:2px}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}.tile b{display:block;font-size:30px;margin:4px 0}h2{margin:0 0 8px}.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;margin-bottom:16px}
.pill{display:inline-block;padding:1px 10px;border-radius:99px;border:1px solid currentColor;font-size:13px}.pill.on{color:#4cc38a}.pill.off{color:#ff7b70}.tpl iframe{width:100%;height:540px;border:1px solid #2c3340;border-radius:8px;background:#fff}.days{display:flex;align-items:flex-end;gap:2px;height:80px}.days i{flex:1;min-width:2px;border-radius:2px 2px 0 0}.days .s{background:#ff8a4c}.days .r{background:#ff7b70;opacity:.7}</style></head><body><main>
<header><h1>✉️ E-mail</h1><span class="muted">What our e-mail did · ${windows}</span></header>
<section class="card" style="margin-bottom:16px"><h2>Switches</h2>${switches} <span class="muted">· ${n(data.today)} of ${n(data.dayMax)} sent in the last 24 h · 6 a day per address · change them in Cloudflare</span></section>
${accounts ? `<div class="tiles">${tile('Trial accounts', accounts.trial, 'gave an address')}${tile('Confirmed', accounts.confirmed, 'clicked the first mail')}${tile('Unconfirmed', accounts.unconfirmed, 'follow up')}${tile('Always on paused', accounts.paused, 'hosted schedule paused')}${tile('Converted to Pro', accounts.converted, 'trial accounts that paid')}</div>` : ''}
<div class="tiles">${tile('Sent', data.sent, `last ${data.days} days`)}${tile('Not sent', data.notSent, 'refused before sending')}${tile('Failed', data.failed, 'the provider said no')}${tile('Bounces and complaints', data.stopped, 'addresses stopped, all time')}${tile('Held for the digest', data.held.items, `${n(data.held.accounts)} accounts${data.held.oldest ? ` · oldest ${esc(data.held.oldest.slice(0, 16).replace('T', ' '))}` : ''}`)}</div>
<section class="card" style="margin-bottom:16px"><h2>Per day</h2><div class="days" role="img" aria-label="Mail per day">${bars}</div><span class="muted">orange = sent, red = not sent</span></section>
<div class="pair">${table('By template', ['Template', 'Sent', 'Not sent', 'Last sent'], data.byTemplate.map(r => [esc(r.template), n(r.sent), n(r.refused), esc((r.last || '').slice(0, 16).replace('T', ' '))]))}
${table('Why mail was not sent', ['Reason', 'Mails'], data.refused.map(r => [esc(r.reason), n(r.n)]))}</div>
<div class="pair">${table('Addresses', ['Group', 'Accounts'], [['Confirmed', n(data.confirmed)], ['Unconfirmed', n(data.unconfirmed)], ['Product news opt-in', n(data.optIn)]])}
${table('Stopped (all time)', ['Reason', 'List', 'Addresses'], data.offReasons.map(r => [esc(r.reason), esc(r.list), n(r.n)]))}</div>
<h2>Templates, as the person sees them <span class="muted">(sample data, example links)</span></h2>${notice}<p class="muted">"Send to test inbox" mails only <code>${esc(TEST_INBOX)}</code> through the real sender, so it counts in the daily caps; it needs the MAIL switch on.</p>${data.testMail.length ? `<section class="card"><h2>Arrived in the test inbox (7 days)</h2><table>${data.testMail.map(m => `<tr><td>${esc(m.received_at.slice(0, 16).replace('T', ' '))}</td><td>${esc(m.to_addr)}</td><td>${esc(m.subject)}</td></tr>`).join('')}</table></section>` : ''}<div class="pair tpls">${previews().map(mail => templateCard(mail, data.byTemplate.find(r => r.template === mail.name)?.sent || 0)).join('')}</div>
${table('Last 10 refusals and failures', ['When (UTC)', 'Address (hash)', 'Template', 'Why'], data.recent.map(r => [esc(r.at.slice(0, 16).replace('T', ' ')), `<code>${esc(r.addr)}</code>`, esc(r.template), esc(r.status)]))}
</main></body></html>`;
}

export async function view(request, env) {
  if (request.method === 'POST') return testSend(request, env);
  if (!await viewer(request, env)) return new Response('Not found', {status: 404});
  return new Response(page(await collect(env, {days: windowOf(new URL(request.url).searchParams.get('days'))}), await accountsOf(env), noticeOf(new URL(request.url).searchParams.get('test'))), {headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex'}});
}
