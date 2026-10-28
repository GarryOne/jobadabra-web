// The release mail (admin/release-mail.js, shared/mail-release.js): a version is drafted once from its What's new entry, goes to every address not stopped (accounts and the waitlist),
// never twice, never to an unsubscribed or bounced address, never before the owner sends it and MARKETING_MAIL is on; every promotional template carries the unsubscribe link. Fake sender and fake D1/KV; no real address.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import {dataFrom, draft, sendAll, audience, ingest} from '../../admin/release-mail.js';
import {SAMPLES} from '../../admin/email-preview.js';
import {compose, stopLink, settingsLink, addrOf} from '../../shared/mail.js';
import {TEMPLATES} from '../../shared/mail-templates.js';
import {createAccount} from '../../shared/pro.js';
import {unsubscribe} from '../../api/mail-unsub.js';

const sql = file => readFileSync(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8');
function d1() {
  const db = new DatabaseSync(':memory:');
  for (const file of ['0079_pro.sql', '0082_pro_trial.sql', '0083_mail.sql', '0093_changelog.sql', '0117_release_mail.sql']) db.exec(sql(file));
  const statement = (text, args = []) => ({bind: (...values) => statement(text, values),
    run: async () => { const r = db.prepare(text).run(...args); return {meta: {changes: Number(r.changes)}}; },
    all: async () => ({results: db.prepare(text).all(...args)}), first: async () => db.prepare(text).get(...args) ?? null});
  return {db, prepare: text => statement(text)};
}
const kv = () => { const m = new Map(); return {m, get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); },
  list: async ({prefix}) => ({keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({name})), list_complete: true})}; };
const now = new Date('2026-10-28T10:00:00Z');
const groups = [{kind: 'features', items: [{lead: 'Faster jobs', text: 'Open a job and see why it fits.'}, {lead: 'Calendar', text: 'Interviews show on a calendar.'}]}, {kind: 'fixes', items: [{lead: 'A fix', text: 'Something works.'}]}];
function setup(extra = {}) {
  const sent = [], e = {MAIL: 'on', MARKETING_MAIL: 'on', STATS: d1(), WAITLIST: kv(), STATS_SALT: 'salt', SELFHEAL_PUBLISH_KEY: 'k', EMAIL: {send: async m => { sent.push(m); return {messageId: `m${sent.length}`}; }}, ...extra};
  e.STATS.db.prepare('INSERT INTO changelog_entries (version, date, channel, hidden, body, at) VALUES (?, ?, ?, 0, ?, ?)').run('0.8.42', '2026-10-27', 'stable', JSON.stringify(groups), 'x');
  return {e, sent};
}

test('the draft comes from the changelog entry: first feature is the headline, fixes stay out', () => {
  const data = dataFrom({version: '0.8.42', date: '2026-10-27', groups});
  assert.equal(data.headline, 'Open a job and see why it fits');
  assert.equal(data.month, 'October 2026');
  assert.deepEqual(data.sections.map(s => s.title), ['Faster jobs', 'Calendar']);
});

test('a version is drafted once; a second promotion call changes nothing; an unknown version drafts nothing', async () => {
  const {e} = setup();
  assert.deepEqual(await draft(e, '0.8.42', now), {drafted: true});
  assert.deepEqual(await draft(e, '0.8.42', now), {exists: true});
  assert.deepEqual(await draft(e, '9.9.9', now), {empty: true});
  assert.equal(e.STATS.db.prepare('SELECT COUNT(*) n FROM release_mail').get().n, 1);
});

test('the trigger from a fake promotion: wrong key is a 404, right key drafts', async () => {
  const {e} = setup();
  const call = key => ingest(new Request('https://x/release-mail/draft', {method: 'POST', headers: {Authorization: `Bearer ${key}`}, body: JSON.stringify({version: '0.8.42'})}), e);
  assert.equal((await call('wrong')).status, 404);
  assert.deepEqual(await (await call('k')).json(), {drafted: true});
});

test('the audience is every account and waitlist address, once; sending reaches all but the stopped and never mails a version twice', async () => {
  const {e, sent} = setup();
  await createAccount(e, 'trial@example.com', now, {plan: 'trial'});
  await createAccount(e, 'stop@example.com', now, {plan: 'trial'});
  await createAccount(e, 'bounced@example.com', now, {plan: 'trial'});
  await e.WAITLIST.put('signup:wait@example.com', '1');
  await e.WAITLIST.put('signup:trial@example.com', '1');   // on both lists: once
  assert.equal((await audience(e)).length, 4);
  e.STATS.db.prepare("INSERT INTO mail_off (addr, list, reason, at) VALUES (?, 'marketing', 'unsubscribe', 'x')").run(await addrOf('stop@example.com'));
  e.STATS.db.prepare("INSERT INTO mail_off (addr, list, reason, at) VALUES (?, 'all', 'bounce', 'x')").run(await addrOf('bounced@example.com'));
  await draft(e, '0.8.42', now);
  assert.deepEqual(await sendAll(e, '0.8.42', {now}), {sent: 2, skipped: 2});
  assert.deepEqual(sent.map(m => m.to).sort(), ['trial@example.com', 'wait@example.com']);
  assert.ok(sent.every(m => m.from.startsWith('Igor from Jobadabra <')));
  assert.deepEqual(await sendAll(e, '0.8.42', {now}), {refused: 'not a draft'});
  assert.equal(sent.length, 2);
});

test('with MARKETING_MAIL off nothing is sent', async () => {
  const {e, sent} = setup({MARKETING_MAIL: 'off'});
  await e.WAITLIST.put('signup:wait@example.com', '1');
  await draft(e, '0.8.42', now);
  await sendAll(e, '0.8.42', {now});
  assert.equal(sent.length, 0);
});

test('every promotional template carries the unsubscribe link in its html and text, and the one-click header', () => {
  const links = {stop: 'https://www.jobadabra.top/unsubscribe?stop', settings: 'https://www.jobadabra.top/email-settings?x'};
  for (const [name, spec] of Object.entries(TEMPLATES).filter(([, spec]) => spec.list === 'marketing')) {
    const mail = compose(name, SAMPLES[name], links);
    assert.ok(mail.html.includes(links.stop) && mail.text.includes(links.stop), `${name}: no stop link in the footer`);
    assert.equal(mail.headers['List-Unsubscribe'], `<${links.stop}>`, name);
  }
});

test('the release mail renders: pills, numbered sections, the stop link', () => {
  const mail = compose('release', SAMPLES.release, {stop: 'https://s/stop', settings: 'https://s/set'});
  assert.match(mail.subject, /^New in Jobadabra: Apply to a job/);
  assert.ok(mail.html.includes('01') && mail.html.includes('02') && mail.html.includes('Update in one click') && mail.html.includes('https://s/stop'));
  assert.match(mail.html, /<span[^>]*>Jobs<\/span>/);
  assert.ok(!mail.text.includes('*'));
});
