// /admin/promo-codes (owner, 25 Oct 2026): make a Pro promo code (one per Make: random, or the owner's own text; with a cap of people and an end date), see every use per install, revoke or delete. Owner only (the usual 404 for anyone else).
// A code is kept as a hash (to check redeems) and encrypted with PROMO_CODE_KEY (to show it in full here, owner only); never in plain text (shared/promo.js). Changes are POSTs from this page (same origin). A hidden action "import" (Bearer) loads a code given on stdin, so a code
// the owner already holds goes in without being shown. Guard: test/admin/promo-codes.test.js.
import {digestOf} from '../shared/guard.js';
import {isOwner} from '../shared/auth.js';
import {esc} from '../shared/html.js';
import {customError, endOfDay, hashOf, newCode, openCode, sealCode} from '../shared/promo.js';

const NOT_FOUND = () => new Response('Not found', {status: 404});
const html = body => new Response(body, {headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex'}});
const stamp = value => (value ? esc(String(value).slice(0, 16).replace('T', ' ')) : 'never');

export function stateOf(code, used, now = Date.now()) {
  if (code.revoked_at) return {text: 'Revoked', tone: 'bad'};
  if (Date.parse(code.ends_at) <= now) return {text: 'Expired', tone: 'bad'};
  if (used >= code.cap) return {text: 'Used up', tone: 'warn'};
  return {text: 'Active', tone: 'good'};
}

export async function collect(env, now = new Date()) {
  const codes = (await env.STATS.prepare(`SELECT c.*, (SELECT COUNT(*) FROM pro_promo_uses u WHERE u.code = c.id) AS used, (SELECT MAX(last_seen) FROM pro_promo_uses u WHERE u.code = c.id) AS last_used
    FROM pro_promo_codes c ORDER BY c.created_at DESC`).all()).results || [];
  const wrong = (await env.STATS.prepare("SELECT COALESCE(SUM(n), 0) AS n FROM anomalies WHERE kind = 'promo-wrong' AND day >= ?").bind(new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10)).first().catch(() => null))?.n || 0;
  return {codes, wrong, now: now.getTime()};
}
async function usesOf(env, id) {
  const rows = (await env.STATS.prepare('SELECT install, at, last_seen FROM pro_promo_uses WHERE code = ? ORDER BY at DESC').bind(id).all()).results || [];
  return Promise.all(rows.map(async row => ({id: (await digestOf(row.install)).slice(0, 8), at: row.at, lastSeen: row.last_seen})));
}

export function page({codes = [], wrong = 0, created = null, detail = null, error = '', keyMissing = false, now = Date.now()}) {
  const total = codes.reduce((sum, code) => sum + code.used, 0), active = codes.filter(code => stateOf(code, code.used, now).text === 'Active').length;
  const rows = codes.map(code => {
    const state = stateOf(code, code.used, now), open = !code.revoked_at;
    return `<tr><td><a href="/admin/promo-codes?code=${esc(code.id)}"><b>${esc(code.label)}</b></a></td><td>${code.full ? `<span class="full" id="c-${esc(code.id)}">${esc(code.full)}</span> <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('c-${esc(code.id)}').innerText)">Copy</button>` : `…${esc(code.last4)} <span class="muted">(made before full codes: re-make it with the Code field to see it)</span>`}</td><td>${code.used} of ${code.cap} people</td><td>${esc(code.ends_at.slice(0, 10))}</td><td>${stamp(code.last_used)}</td><td class="${state.tone}">${state.text}</td>
<td class="actions">${open ? `<form method="post" onsubmit="return confirm('Revoke ${esc(code.label)}? Pro ends now for everyone who used it.')"><input type="hidden" name="action" value="revoke"><input type="hidden" name="id" value="${esc(code.id)}"><button class="danger">Revoke</button></form>` : ''}
<form method="post" onsubmit="return confirm('Delete ${esc(code.label)} and its uses? Pro ends now for everyone who used it.')"><input type="hidden" name="action" value="delete"><input type="hidden" name="id" value="${esc(code.id)}"><button class="danger">Delete</button></form></td></tr>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Promo codes · Admin</title><link rel="icon" href="/favicon-32.png">
<style>
.card{padding:16px;margin-bottom:12px}h2{margin:0 0 4px}.good{color:#3fb68b}.bad{color:#e5484d}.warn{color:#f5b54a}
th,td{padding:8px 6px;vertical-align:middle}.actions{display:flex;gap:6px;white-space:nowrap}form{display:inline-flex;gap:6px;margin:0;flex-wrap:wrap;align-items:center}label{display:inline-flex;gap:6px;align-items:center}
input[type=text],input[type=number],input[type=date]{background:#0b0d10;color:#f4efe3;border:1px solid #262c33;border-radius:8px;padding:7px 9px;font:inherit}
button{background:#1b2027;color:#f4efe3;border:1px solid #262c33;border-radius:8px;padding:7px 12px;font:inherit;cursor:pointer}
button.primary{background:#f5b54a;color:#0b0d10;border-color:#f5b54a;font-weight:600}button.danger{color:#e5484d}
.notice{padding:10px 14px;margin-bottom:12px;border:1px solid #f5b54a;border-radius:10px;color:#f5b54a}.notice.bad{border-color:#e5484d;color:#e5484d}.full{font-family:ui-monospace,monospace;user-select:all}.created{border-color:#3fb68b}.codes{font-family:ui-monospace,monospace;font-size:18px;line-height:1.8;user-select:all}
</style></head><body><main>
<header><h1>🎟️ Promo codes</h1><span class="muted">only you see this page · ${total} redemptions · ${active} active codes · ${wrong} wrong tries in 7 days</span></header>
${keyMissing ? `<div class="notice">Full codes can't be shown: the site's PROMO_CODE_KEY is not set. A new code is shown once, right after you make it, so copy it then.</div>` : ''}${error ? `<div class="notice bad" role="alert">${esc(error)}</div>` : ''}
${created ? `<section class="card created"><h2>New code for ${esc(created.label)}</h2><small class="muted">${keyMissing ? 'Copy it now: it is not kept in the list (no key).' : 'It also stays in the list below.'}</small>
<div class="codes" id="made">${created.codes.map(esc).join('<br>')}</div><button class="primary" type="button" onclick="navigator.clipboard.writeText(document.getElementById('made').innerText)">Copy</button></section>` : ''}
<section class="card"><h2>Make a code</h2><small class="muted">The code gives Pro with no AI credit to the people cap you set, until its end date (or until you revoke it). Leave Code empty for a random one, or type your own: 8+ letters, digits or dashes. A short or common word is easy to guess, so prefer a long one.</small>
<form method="post" style="margin-top:10px"><input type="hidden" name="action" value="generate"><input type="text" name="label" placeholder="Label" required maxlength="60" aria-label="Label"><input type="text" name="code" placeholder="Code (optional)" maxlength="40" autocomplete="off" spellcheck="false" aria-label="Code">
<label class="muted">People who can use it <input type="number" name="cap" value="20" min="1" max="10000"></label><label class="muted">Ends <input type="date" name="ends" value="2026-12-31" min="${new Date(now).toISOString().slice(0, 10)}" required></label><button class="primary">Make</button></form></section>
<section class="card"><h2>Codes</h2><div class="wrap"><table><tr><th>Label</th><th>Code</th><th>People</th><th>Ends (UTC)</th><th>Last used (UTC)</th><th>State</th><th></th></tr>
${rows || '<tr><td colspan="7" class="muted">No codes yet.</td></tr>'}</table></div></section>
${detail ? `<section class="card"><h2>Uses of ${esc(detail.label)}</h2><small class="muted">One row per install: a short id, never the full install id.</small><table><tr><th>Install</th><th>Redeemed (UTC)</th><th>Last seen (UTC)</th><th>Pro now</th></tr>
${detail.uses.map(use => `<tr><td>${esc(use.id)}</td><td>${stamp(use.at)}</td><td>${stamp(use.lastSeen)}</td><td>${stateOf(detail, 0, now).tone === 'bad' ? 'no' : 'yes'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Not used yet.</td></tr>'}</table></section>` : ''}
</main></body></html>`;
}

async function make(env, {label, cap, ends, code}, now) {
  const hash = await hashOf(env, code), id = `promo_${hash}`;
  await env.STATS.prepare('INSERT OR IGNORE INTO pro_promo_codes (id, label, code_hash, last4, cap, ends_at, created_at, code_enc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, label, hash, code.replace(/[^A-Z0-9]/gi, '').slice(-4).toUpperCase(), cap, endOfDay(ends), now.toISOString(), await sealCode(env, code)).run();
  await env.STATS.prepare('UPDATE pro_promo_codes SET code_enc = ? WHERE id = ? AND code_enc IS NULL').bind(await sealCode(env, code), id).run();   // a re-import gives an older code its ciphertext
}

// GET shows the page (?code=<id> opens a code's uses); POST (from this page) makes, revokes or deletes. Owner only.
export async function view(request, env, now = new Date()) {
  if (!await isOwner(request, env, now.getTime()) || !env.STATS) return NOT_FOUND();
  const url = new URL(request.url);
  let created = null, error = '', status = 200;
  if (request.method === 'POST') {
    if (request.headers.get('Origin') !== url.origin) return NOT_FOUND();   // a form on another site cannot post here
    const form = await request.formData().catch(() => new FormData());
    const action = form.get('action'), id = String(form.get('id') || '');
    const label = String(form.get('label') || '').trim().slice(0, 60) || 'Promo', cap = Math.min(10000, Math.max(1, Math.floor(Number(form.get('cap')) || 0)));
    const ends = String(form.get('ends') || '');
    if (action === 'generate' || action === 'import') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ends) || !(Date.parse(endOfDay(ends)) > now.getTime())) return new Response('Pick an end date in the future.', {status: 400});
      if (action === 'import') {
        if (!request.headers.get('Authorization')) return NOT_FOUND();   // only by key, never from the page: the code is the one the owner already holds
        const code = String(form.get('code') || '').trim();
        if (code.length < 8) return new Response('Code too short.', {status: 400});
        await make(env, {label, cap, ends, code}, now);
        return new Response('imported\n');
      }
      const typed = String(form.get('code') || '').trim();   // empty = a random code; a "count" field, if sent, is ignored
      error = typed ? customError(typed) || ((await env.STATS.prepare('SELECT 1 AS n FROM pro_promo_codes WHERE code_hash = ?').bind(await hashOf(env, typed)).first()) ? 'That code already exists.' : '') : '';
      if (error) status = 400;
      else {
        const code = typed || newCode();
        await make(env, {label, cap, ends, code}, now);
        created = {label, codes: [code]};
      }
    } else if (action === 'revoke' && id) await env.STATS.prepare('UPDATE pro_promo_codes SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').bind(now.toISOString(), id).run();
    else if (action === 'delete' && id) { await env.STATS.prepare('DELETE FROM pro_promo_uses WHERE code = ?').bind(id).run(); await env.STATS.prepare('DELETE FROM pro_promo_codes WHERE id = ?').bind(id).run(); }
    else return new Response('Unknown action', {status: 400});
    if (!created && !error) return new Response(null, {status: 303, headers: {Location: '/admin/promo-codes'}});
  } else if (request.method !== 'GET') return new Response('Method not allowed', {status: 405});
  const data = await collect(env, now), open = url.searchParams.get('code'), shown = data.codes.find(code => code.id === open);
  for (const code of data.codes) code.full = await openCode(env, code.code_enc);
  const res = html(page({...data, created, error, keyMissing: !env.PROMO_CODE_KEY, detail: shown ? {...shown, uses: await usesOf(env, shown.id)} : null}));
  return status === 200 ? res : new Response(res.body, {status, headers: res.headers});
}
