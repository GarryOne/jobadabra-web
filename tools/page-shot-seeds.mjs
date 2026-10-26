// Demo data for tools/page-shot.mjs: made-up rows only (codes, labels, people), never a real secret or the live site's data. Each seed gets {env, call}: call(path, init) goes through the real Worker as the owner.
import {ACTIONS} from '../shared/aicost.js';
const form = fields => ({method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams(fields)});

export const seeds = {
  'lab-form-filling': async ({env}) => {   // made-up recorded sites on the usual form platforms, a week of smoke runs: fills, a left field, a bot check, a regression (26 Oct 2026, admin on a phone)
    const {ingest} = await import('../admin/applying.js');
    const hosts = ['job-boards.greenhouse.io', 'jobs.lever.co', 'demo.wd5.myworkdayjobs.com', 'jobs.ashbyhq.com', 'apply.workable.com', 'career5.successfactors.eu', 'jobs.smartrecruiters.com', 'careers.demo-company.example'];
    const sites = hosts.flatMap((host, i) => [0, 1].map(j => ({name: `Demo site ${i * 2 + j + 1}`, start_host: host, signature: `posting>form@${host}#${j ? 'form' : 'ready'}`})));
    const today = new Date();
    await ingest(env.STATS, {kind: 'pool', day: today.toISOString().slice(0, 10), rows: sites}, today);
    for (let back = 6; back >= 0; back--) {
      const at = new Date(today.getTime() - back * 86400000), day = at.toISOString().slice(0, 10);
      await ingest(env.STATS, {kind: 'smoke', day, version: `0.9.${190 + 6 - back}`, rows: sites.map((site, n) => ({name: site.name, host: site.start_host,
        reached: n % 7 === 3 ? 'code/bot' : n % 5 === 4 ? 'form' : 'ready', filled: 6 + (n * 3 + back) % 9, left: (n + back) % 4 === 0 ? 1 : 0, regression: back === 0 && n === 5}))}, at);
    }
  },
  'self-healing': async ({env}) => {   // made-up snapshots of the self-healing loop over 10 days, with long issue titles and detector names (26 Oct 2026, admin on a phone)
    const today = Date.now();
    for (let back = 9; back >= 0; back--) {
      const at = new Date(today - back * 86400000).toISOString(), real = 20 + back;
      const body = {schema: 1, at, totals: {filed: 95 - back, fixed: 19, queued: real - 19, falsePositive: 22, duplicate: 10, harness: 6, unclear: 25, open: 6, real, precision: 54},
        byDetector: ['AI screenshot review', 'AI code review of the latest merged pull requests', 'Recorded replay mismatch', 'Console errors'].map((detector, i) => ({detector, filed: 38 - i * 7, fixed: 4 + i, queued: 7, falsePositive: 10 - i, duplicate: 3, harness: i, unclear: 6, open: 1})),
        fixer: {opened: 8, merged: 2, landed: 5, closed: 4, open: 0}, verdicts: {real: 9, falsePositive: 8}, cost: {usd: 1.06, runs: 12, byJob: {review: 0.6, fixer: 0.46}, perRealBug: 0.04},
        recall: {planted: 13, caught: 11, missed: ['page-overflow', 'a11y-contrast']}, daily: [{day: at.slice(0, 10), filed: 33, real: 20, falsePositive: 9}],
        notable: [1, 2, 3, 4].map(n => ({number: 100 + n, title: `Demo issue ${n}: a long made-up title that names a component, the symptom and where_it_happens_in_some/long/path/file-name.js`, url: `https://github.com/demo/demo/issues/${100 + n}`,
          detector: 'AI code review', status: n % 2 ? 'fixed' : 'queued', severity: 'medium'}))};
      await env.STATS.prepare('INSERT INTO selfheal_snapshots (day, at, body) VALUES (?, ?, ?) ON CONFLICT(day) DO UPDATE SET at = excluded.at, body = excluded.body').bind(at.slice(0, 10), at, JSON.stringify(body)).run();
    }
  },
  email: async ({env}) => {   // made-up mail for /admin/growth/email (26 Oct 2026): 14 days of sends and refusals under made-up address hashes, a bounce, an unconfirmed stop, two held items
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
  'closed-sites': async ({env}) => {   // made-up closed sites for /admin/job-search/scouting (27 Oct 2026, table tools): 52 dead ends (refused, unreachable, no feed) and 12 browser-only or gone pages, over 6 weeks
    const day = n => new Date(Date.parse('2026-10-26T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);
    for (let n = 1; n <= 52; n++) {
      const outcome = n % 5 === 0 ? 'refused' : n % 7 === 0 ? 'unreachable' : null, installs = outcome ? 1 + n % 4 : 1;
      for (let i = 0; i < installs; i++) await env.STATS.prepare('INSERT INTO nofeed (install, day, key, company, host, outcome) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(`demo-install-${i}`, day((n * 3 + i) % 42), `demo-${n}`, `Demo employer ${n}`, `jobs.demo-${n}.example`, outcome).run();
    }
    for (let n = 1; n <= 12; n++) for (let i = 0; i < 1 + n % 4; i++) await env.STATS.prepare('INSERT INTO sitefacts (install, day, host, kind) VALUES (?, ?, ?, ?)')
      .bind(`demo-install-${i}`, day((n * 5 + i) % 40), `careers.demo-site-${n}.example`, n % 3 ? 'browser' : 'dead').run();
  },
  'promo-codes': async ({env, call}) => {   // three codes in the list: active with uses, used up, and one made before full codes were kept
    await call('/admin/growth/promo-codes', form({action: 'import', code: 'DEMO-CODE-ONE1', label: 'Friends and family', cap: '20', ends: '2999-12-31'}));
    await call('/admin/growth/promo-codes', form({action: 'import', code: 'DEMO-CODE-TWO2', label: 'Beta testers', cap: '2', ends: '2999-12-31'}));
    const rows = (await env.STATS.prepare('SELECT id, label FROM pro_promo_codes').all()).results;
    const at = '2026-10-24T10:00:00.000Z';
    for (const [n, row] of rows.entries()) for (let i = 0; i < (row.label === 'Beta testers' ? 2 : 3); i++) {
      await env.STATS.prepare('INSERT INTO pro_promo_uses (code, install, at, last_seen) VALUES (?, ?, ?, ?)').bind(row.id, `demo-install-${n}-${i}`, at, at).run();
    }
    await env.STATS.prepare("INSERT INTO pro_promo_codes (id, label, code_hash, last4, cap, ends_at, created_at) VALUES ('promo_old', 'Early list', 'demo-hash', 'ZZZZ', 10, '2999-12-31T23:59:59.999Z', ?)").bind(at).run();
    // An AI-credit code (shared/promo-credit.js) once its migration is in: €10 per person, 1 of 20 used. Skipped on an older tree (the before shot).
    const credit = await call('/admin/growth/promo-codes', form({action: 'import', code: 'friends-jobadabra-10e-topup', label: 'Friends top-up', cap: '20', ends: '2999-12-31', kind: 'credit', credit: '10'}));
    const topup = await env.STATS.prepare("SELECT id FROM pro_promo_codes WHERE label = 'Friends top-up'").first();
    if (credit && topup?.id) await env.STATS.prepare('INSERT INTO pro_promo_credit_uses (code, install, at) VALUES (?, ?, ?)').bind(topup.id, 'demo-install-credit', at).run().catch(() => {});
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
