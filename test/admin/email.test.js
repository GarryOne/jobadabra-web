// /admin/email: counts what mail_log, mail_off, mail_held and pro_accounts hold, shows the four switches, lists the page in the menu, and never prints an address (hash only). Fake D1.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import {PAGES} from '../../admin/admin.js';
import {collect, hashOf, SWITCHES, windowOf} from '../../admin/email-data.js';
import {page} from '../../admin/email.js';
import {addrOf} from '../../shared/mail.js';

const sql = file => readFileSync(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8');
function d1() {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0079_pro.sql', '0082_pro_trial.sql', '0083_mail.sql', '0085_mail_held.sql']) db.exec(sql(file));
  const statement = (text, args = []) => ({bind: (...values) => statement(text, values), run: async () => db.prepare(text).run(...args),
    all: async () => ({results: db.prepare(text).all(...args)}), first: async () => db.prepare(text).get(...args) ?? null});
  return {db, prepare: text => statement(text)};
}
const now = new Date('2026-10-26T12:00:00Z');
const log = (db, at, addr, template, status) => db.prepare('INSERT INTO mail_log (at, addr, list, template, status) VALUES (?, ?, ?, ?, ?)').run(at, addr, 'service', template, status);

async function fill() {
  const STATS = d1(), env = {STATS_SALT: 'salt', STATS, MAIL: 'on', MARKETING_MAIL: 'off'};
  const secret = await addrOf('real.person@example.com');
  log(STATS.db, '2026-10-26T10:00:00Z', secret, 'welcome', 'sent');
  log(STATS.db, '2026-10-26T11:00:00Z', secret, 'digest', 'sent');
  log(STATS.db, '2026-10-25T11:00:00Z', secret, 'digest', 'rate');
  log(STATS.db, '2026-10-24T11:00:00Z', secret, 'digest', 'failed');
  log(STATS.db, '2026-08-01T11:00:00Z', secret, 'digest', 'sent');   // outside the window
  STATS.db.prepare("INSERT INTO mail_off (addr, list, reason, at) VALUES (?, 'all', 'bounce', ?)").run(secret, '2026-10-20T00:00:00Z');
  STATS.db.prepare("INSERT INTO mail_held (account, at, subject, html, text) VALUES ('acc_1', '2026-10-26T09:00:00Z', 's', 'h', 't')").run();
  return {env, secret};
}

test('counts sent, refused, failed, stopped and held inside the window', async () => {
  const {env} = await fill();
  const data = await collect(env, {days: 7, now});
  assert.equal(data.sent, 2);
  assert.equal(data.notSent, 2);
  assert.equal(data.failed, 1);
  assert.equal(data.stopped, 1);
  assert.deepEqual(data.held, {items: 1, accounts: 1, oldest: '2026-10-26T09:00:00Z'});
  assert.equal(data.today, 2);
  assert.deepEqual(data.byTemplate.map(r => [r.template, r.sent, r.refused]), [['welcome', 1, 0], ['digest', 1, 2]]);
});

test('the four switches show on only when exactly "on"', async () => {
  const {env} = await fill();
  const data = await collect({...env, TRIAL_REMINDERS: 'ON'}, {now});
  assert.deepEqual(data.switches.map(s => [s.name, s.on]), [['MAIL', true], ['MARKETING_MAIL', false], ['TRIAL_REMINDERS', false], ['MAIL_LAUNCH', false]]);
  assert.equal(SWITCHES.length, 4);
});

test('the page never contains a full address hash, only the first 8 characters', async () => {
  const {env, secret} = await fill();
  const html = page(await collect(env, {days: 30, now}));
  assert.ok(!html.includes(secret));
  assert.ok(html.includes(`<code>${hashOf(secret)}</code>`));
  assert.ok(!html.includes('real.person'));
});

test('the window is 7, 30 or 90 days; anything else is 7; the page is in the Growth menu', () => {
  assert.deepEqual([7, 30, 90, 5, 'x', undefined].map(windowOf), [7, 30, 90, 7, 7, 7]);
  assert.ok(PAGES.some(p => p.path === '/admin/email' && p.group === 'Growth' && p.old === '/admin/signups'));
  assert.ok(!PAGES.some(p => p.path === '/admin/signups'), 'Signups is merged into E-mail');
});
