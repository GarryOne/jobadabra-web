// Demo data for tools/page-shot.mjs: made-up rows only (codes, labels, people), never a real secret or the live site's data. Each seed gets {env, call}: call(path, init) goes through the real Worker as the owner.
import {ACTIONS} from '../shared/aicost.js';
const form = fields => ({method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams(fields)});

export const seeds = {
  email: async ({env}) => {   // made-up mail for /admin/email (26 Oct 2026): 14 days of sends and refusals under made-up address hashes, a bounce, an unconfirmed stop, two held items
    const templates = ['digest', 'digest', 'digest', 'welcome', 'account-code', 'message'], why = ['rate', 'unsubscribed', 'not_opted_in', 'suppressed', 'failed'];
    const today = Date.now();
    for (let day = 0; day < 14; day++) for (let i = 0; i < 18 + (day * 7) % 23; i++) {
      const at = new Date(today - day * 86400000 - i * 600000).toISOString(), template = templates[i % templates.length], refused = i % 9 === 0;
      await env.STATS.prepare('INSERT INTO mail_log (at, addr, list, template, status, message_id) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(at, (0x1000000 + i * 7919 + day * 104729 + 0xa3f9c1d200).toString(16).padStart(16, '0'), 'service', template, refused ? why[(i + day) % why.length] : 'sent', refused ? null : `demo-${day}-${i}`).run();
    }
    await env.STATS.prepare("INSERT INTO mail_off (addr, list, reason, at) VALUES ('demo000000000001', 'all', 'bounce', ?), ('demo000000000002', 'service', 'unsubscribe', ?), ('demo000000000003', 'service', 'unconfirmed', ?)")
      .bind(new Date(today - 86400000).toISOString(), new Date(today - 2 * 86400000).toISOString(), new Date(today - 3 * 86400000).toISOString()).run();
    await env.STATS.prepare("INSERT INTO test_mail (received_at, to_addr, from_addr, subject, body) VALUES (?, 'test-account-admin@jobpilotto.top', 'notifications@jobadabra.top', 'Confirm your email for Jobadabra', 'Demo')").bind(new Date(today - 600000).toISOString()).run();
    for (const account of ['acc_demo1', 'acc_demo2']) await env.STATS.prepare("INSERT INTO mail_held (account, at, subject, html, text) VALUES (?, ?, 'Demo', '<p>Demo</p>', 'Demo')").bind(account, new Date(today - 3600000).toISOString()).run();
  },
  'random-draws': async ({env}) => {   // made-up draws of the search robot (26 Oct 2026): an old-shape draw, a wide first search, a weak field change; the wide columns only where the schema has them
    const rows = [['2026-10-25', 'support', 'Milan', 'Italy', 62, 326, 664, 155, 106, 2, null], ['2026-10-26', 'healthcare', 'Cluj-Napoca', 'Romania', 48, 210, 540, 212, 140, 9,
      {role: 'Dialysis Nurse', place_kind: 'region', place: 'the EU', path: 'first', engine: 'api', ai_usd: 0.71, funnel: {kinds: ['healthcare'], employers_picked: 640, boards_read: 7, web_searches: 1, looked: 52300}}],
    ['2026-10-27', 'other', 'Milan', 'Italy', null, null, null, 0, 0, 0,
      {role: 'First Officer', place_kind: 'region', place: 'Europe', path: 'field-change', engine: 'api', ai_usd: 0.93, funnel: {kinds: ['finance_admin'], employers_picked: 1025, boards_read: 1, web_searches: 0, looked: 81070}}]];
    for (const [day, family, city, country, first, tenth, fit, places, scored, fit70, wide] of rows) {
      await env.STATS.prepare('INSERT INTO search_lab_draws (draw_date, seed, family, city, country, source, build, state, first_s, tenth_s, fit_s, in_places, scored, fit70) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(day, day, family, city, country, 'ci', 'abc1234', 'ok', first, tenth, fit, places, scored, fit70).run();
      if (wide) await env.STATS.prepare('UPDATE search_lab_draws SET role = ?, place_kind = ?, place = ?, path = ?, engine = ?, ai_usd = ?, funnel = ? WHERE draw_date = ?')
        .bind(wide.role, wide.place_kind, wide.place, wide.path, wide.engine, wide.ai_usd, JSON.stringify(wide.funnel), day).run().catch(() => null);
    }
  },
  scouting: async ({env}) => {   // made-up employers over the European countries, one or two per kind and country, plus a few of the kinds split out of Other (26 Oct 2026)
    const kinds = ['software', 'sales_b2b', 'sales_retail', 'logistics', 'hospitality', 'healthcare', 'creative_media', 'finance_admin', 'education', 'trades',
      'engineering', 'business_ops', 'manufacturing', 'science', 'customer_service', 'legal', 'aviation_transport', 'public_security', 'other'];
    const countries = ['ch', 'de', 'at', 'fr', 'it', 'gb', 'ie', 'nl', 'be', 'es', 'pt', 'se', 'pl', 'ro'];
    let n = 0;
    for (const [k, kind] of kinds.entries()) for (const [c, country] of countries.entries()) for (let i = 0; i < (k + c) % 4; i++) {
      n += 1;
      const feed = {company: `Demo employer ${n}`, ats: 'greenhouse', slug: `demo-${n}`, quality: 70, checked: '2026-10-25', kinds: {[kind]: 0.8}, countries: [country], fresh: {jobs: 10 + n % 40}};
      await env.STATS.prepare('INSERT INTO index_feeds (ats, slug, regions, body, generated) VALUES (?, ?, ?, ?, ?)').bind('greenhouse', `demo-${n}`, ',europe,', JSON.stringify(feed), '2026-10-25T00:00:00Z').run();
    }
  },
  'promo-codes': async ({env, call}) => {   // three codes in the list: active with uses, used up, and one made before full codes were kept
    await call('/admin/promo-codes', form({action: 'import', code: 'DEMO-CODE-ONE1', label: 'Friends and family', cap: '20', ends: '2999-12-31'}));
    await call('/admin/promo-codes', form({action: 'import', code: 'DEMO-CODE-TWO2', label: 'Beta testers', cap: '2', ends: '2999-12-31'}));
    const rows = (await env.STATS.prepare('SELECT id, label FROM pro_promo_codes').all()).results;
    const at = '2026-10-24T10:00:00.000Z';
    for (const [n, row] of rows.entries()) for (let i = 0; i < (row.label === 'Beta testers' ? 2 : 3); i++) {
      await env.STATS.prepare('INSERT INTO pro_promo_uses (code, install, at, last_seen) VALUES (?, ?, ?, ?)').bind(row.id, `demo-install-${n}-${i}`, at, at).run();
    }
    await env.STATS.prepare("INSERT INTO pro_promo_codes (id, label, code_hash, last4, cap, ends_at, created_at) VALUES ('promo_old', 'Early list', 'demo-hash', 'ZZZZ', 10, '2999-12-31T23:59:59.999Z', ?)").bind(at).run();
  },
  'ai-cost-web': async ({env}) => {   // the Free AI board web search this month: $3.50 of its $10 line, 100 searches paid, 40 answered from the shared answers
    const month = new Date().toISOString().slice(0, 7);
    env.WEB_SEARCH_ANTHROPIC_KEY = 'demo-not-a-key';
    await env.WAITLIST.put(`freeai:web:usd:${month}`, String(3.5 * 1e6));
    await env.WAITLIST.put(`freeai:web:calls:${month}`, '100');
    await env.WAITLIST.put(`freeai:web:hits:${month}`, '40');
  },
  'ai-cost-free': async ({env}) => {   // one made-up install's Free AI day (26 Oct 2026 shape): $0.42 and 2.5M tokens, under the lines wrangler.toml sets; each step as this tree's log records it
    Object.assign(env, {FREE_AI_INSTALL_DAY_USD: '0.50', FREE_AI_INSTALL_MONTH_USD: '5', FREE_AI_MONTH_STOP_USD: '200', FREE_AI_MONTH_ALERT_USD: '100'});
    const day = new Date().toISOString().slice(0, 10), model = '@cf/qwen/qwen3-30b-a3b-fp8';
    const steps = [['scout', 210, 900000, 110000, 105000], ['enrich', 100, 330000, 60000, 80000], ['score', 140, 500000, 90000, 65000], ['decide', 110, 220000, 60000, 46000],
      ['title_triage', 160, 180000, 50000, 40000], ['place_triage', 120, 120000, 30000, 30000], ['visit_relevant', 60, 70000, 20000, 18000], ['role_ideas', 58, 40000, 10000, 36000]];
    for (const [step, calls, tin, tout, micro] of steps) {
      const action = ACTIONS.includes(step) ? step : 'other';
      await env.STATS.prepare('INSERT INTO ai_calls (day, who, action, model, calls, tokens_in, tokens_out, cache_read, micro_usd) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?) ON CONFLICT (day, who, action, model) DO UPDATE SET '
        + 'calls = calls + excluded.calls, tokens_in = tokens_in + excluded.tokens_in, tokens_out = tokens_out + excluded.tokens_out, micro_usd = micro_usd + excluded.micro_usd')
        .bind(day, 'demo0001', action, model, calls, tin, tout, micro).run();
    }
  },
};
