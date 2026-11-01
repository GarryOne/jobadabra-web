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
  'agent-coding': async ({env}) => {   // made-up push-gate and CI days over 8 weeks: form stops dominating, fixes mostly product, one area circling this week (1 Nov 2026)
    const {ingest} = await import('../admin/agent-coding.js');
    const now = new Date(), put = (kind, days) => ingest(new Request('https://x/agent-coding/data', {method: 'PUT', headers: {Authorization: 'Bearer k'}, body: JSON.stringify({kind, days})}), {STATS: env.STATS, SELFHEAL_PUBLISH_KEY: 'k'}, now);
    const gate = [], ci = [], areas = ['desktop/renderer', 'src/ai', 'extension', 'desktop/main', 'src/sources', 'worker/src', 'desktop/lib', 'src/stores'];
    const checks = [['desktop (clean checkout)', 'real', 400], ['spec proof', 'form', 55], ['file size', 'form', 9], ['stale expectations', 'form', 14], ['recorded cases', 'form', 21], ['python (clean checkout)', 'real', 310], ['journey gate', 'real', 150], ['why comments', 'form', 6]];
    for (let back = 55; back >= 0; back--) {
      const day = new Date(now.getTime() - back * 86400000).toISOString().slice(0, 10), weekend = [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay()), n = weekend ? 3 : 9 + (back * 7) % 8, week = Math.floor(back / 7);
      const form = Math.round(n * (0.35 + 0.08 * ((back * 5) % 4))), real = Math.round(n * (0.06 + 0.02 * (week % 3))), other = back % 5 === 0 ? 1 : 0;
      gate.push({day, pushes: n, secs: n * 70, stopped: {form, real, other}, stoppedSecs: {form: form * 55, real: real * 190, other: other * 40},
        steps: Object.fromEntries(checks.map(([name, cls, secs], i) => [name, {runs: n, fails: cls === 'form' ? Math.round(form / (i + 1)) : Math.round(real / 2), secs: n * secs / 10, cls}]))});
      const merged = weekend ? 2 : 6 + (back * 3) % 6, circling = week === 0 && !weekend;
      ci.push({day, prs: {merged, ci: Math.round(merged * (0.7 - week * 0.04))}, reds: {product: 3 + back % 3, test: 2 + back % 2, ci: 1 + back % 3, form: 2 + (back + 1) % 3, nofix: back % 4 === 0 ? 1 : 0},
        fixPrs: Object.fromEntries(areas.filter((_, i) => (back + i) % 3 === 0 || (circling && i === 0)).map((area, i) => [area, circling && i === 0 ? (back < 3 ? 2 : 1) : 1])),
        wall: Array.from({length: merged + 3}, (_, i) => 9 + ((i * 7 + back) % 20) + week * 0.4), queue: Array.from({length: merged + 3}, (_, i) => 0.4 + ((i + back) % 5) * 0.3), cancelledMin: merged * 2.1});
    }
    await put('gate', gate.slice(-30)); await put('gate', gate.slice(0, 26)); await put('ci', ci.slice(-30)); await put('ci', ci.slice(0, 26));
  },
  'agent-coding-sdlc': async ({env}) => {   // the SDLC tab (1 Nov 2026): the real cards in $SDLC_REAL_DIR (gate-days.json, sdlc.json from tools/sdlc-stats.mjs) when set, else made-up days
    const {ingest} = await import('../admin/agent-coding.js');
    const {readFileSync, existsSync} = await import('node:fs');
    const put = body => ingest(new Request('https://x/agent-coding/data', {method: 'PUT', headers: {Authorization: 'Bearer k'}, body: JSON.stringify(body)}), {STATS: env.STATS, SELFHEAL_PUBLISH_KEY: 'k'});
    const dir = process.env.SDLC_REAL_DIR;
    if (dir && existsSync(`${dir}/sdlc.json`)) { for (const file of ['gate-days.json', 'sdlc.json']) if (existsSync(`${dir}/${file}`)) await put(JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'))); return; }
    const now = new Date(), days = Array.from({length: 14}, (_, i) => new Date(now.getTime() - (13 - i) * 86400000).toISOString().slice(0, 10));
    const checks = [['CI · Tests · python', 3.7, 9], ['CI · Tests · desktop', 2.8, 12], ['CI · Harness tests', 2.1, 3], ['CI · Pull request', 0.6, 1], ['CI · Tests · worker', 1.4, 5]];
    await put({kind: 'sdlc', days: days.map((day, i) => ({day, bugs: i % 4 === 0 ? 1 : 0, phases: {merged: 20 + i, nospec: 6 + i % 3, unmerged: 1 + i % 2, prCommits: 60 + i, fixAfter: 3 + i % 4, reverts: i % 5 === 0 ? 1 : 0, redMain: i % 3 === 0 ? 1 : 0},
      layers: {pr: Object.fromEntries(checks.map(([name, mins, fails], c) => [name, {runs: 60 + i, fails: fails + i % 3, secs: (60 + i) * mins * 60, catches: {product: c < 2 ? 3 : 0, test: c === 1 ? 2 : 0, ci: 1, form: c === 3 ? 4 : 1, flaky: c === 2 ? 3 : 0, nofix: 1}}])), main: {}, night: {}}}))});
  },
  'self-healing': async ({env}) => {   // made-up snapshots of the self-healing loop over 10 days, with long issue titles and detector names (26 Oct 2026, admin on a phone)
    const today = Date.now();
    for (let back = 9; back >= 0; back--) {
      const at = new Date(today - back * 86400000).toISOString(), real = 20 + back;
      const body = {schema: 1, at, totals: {filed: 95 - back, fixed: 19, queued: real - 19, falsePositive: 22, duplicate: 10, harness: 6, unclear: 25, open: 6, real, precision: 54},
        byDetector: ['AI screenshot review', 'AI code review of the latest merged pull requests', 'Recorded replay mismatch', 'Console errors'].map((detector, i) => ({detector, filed: 38 - i * 7, fixed: 4 + i, queued: 7, falsePositive: 10 - i, duplicate: 3, harness: i, unclear: 6, open: 1})),
        fixer: {opened: 8, merged: 2, landed: 5, closed: 4, open: 0}, verdicts: {real: 9, falsePositive: 8}, cost: {usd: 1.06, runs: 12, byJob: {review: 0.6, fixer: 0.46}, perRealBug: 0.04},
        recall: {planted: 13, caught: 11, missed: ['page-overflow', 'a11y-contrast']}, quality: {mutation: {rate: 100, note: '12 of 12 planted code bugs caught'}, escape: {rate: 66, note: '68 of 103 bugs found outside the Finder'}}, daily: [{day: at.slice(0, 10), filed: 33, real: 20, falsePositive: 9}],
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
  coverage: async ({env}) => {   // made-up daily snapshots for /coverage's kind × country table (27 Oct 2026): big markets and IT strong, small ones thin, many not sorted yet; a week apart
    const {EUROPE} = await import('../shared/pool-tags.js'), {KINDS} = await import('../shared/pool-labels.js');
    const size = {de: 9, gb: 10, fr: 7, es: 6, nl: 6, ch: 5, it: 4, pl: 5, se: 4, ie: 3, at: 2, be: 2, pt: 3, dk: 2, no: 1, fi: 1, cz: 1, ro: 2, hu: 1, gr: 1, bg: 1};
    const weight = kind => ({software: 12, sales_b2b: 7, engineering: 3, creative_media: 2, other: 3, unknown: 30}[kind] ?? (kind.length % 3) * 0.4);
    const cellsAt = grow => Object.fromEntries([...KINDS, 'unknown'].flatMap((kind, k) => EUROPE.map((country, c) => {
      const count = Math.round((size[country] ?? 0.5) * weight(kind) * grow * (0.6 + ((k * 7 + c * 3) % 9) / 10));
      return [`${kind}|${country}`, [count, count * 12]];
    })).filter(([, [count]]) => count > 0));
    for (const [day, grow] of [['2026-10-20', 0.9], ['2026-10-27', 1]]) {
      const cells = cellsAt(grow), feeds = Math.round(Object.values(cells).reduce((sum, [count]) => sum + count, 0) / 1.4);
      await env.STATS.prepare('INSERT INTO index_daily (day, feeds, non_it, failing, from_pool, dead_ends, cells) VALUES (?, ?, ?, 0, 0, 0, ?)').bind(day, feeds, Math.round(feeds / 3), JSON.stringify(cells)).run();
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
  'benchmark-search': async ({env, call}) => {   // made-up search round for /admin/job-search/benchmark (27 Oct 2026): ours and two other tools on 3 personas; Tool B's run time was not recorded (0)
    env.SELFHEAL_PUBLISH_KEY = 'page-shot-publish-key';
    const at = '2026-10-27T10:00:00Z', personas = [['Nurse · Townville', 'non-tech'], ['Coder · Cityburg', 'tech'], ['Cook · Portside', 'non-tech']];
    const tools = [['Ours', true, [40, 10, 25], [12, 3, 8], 300], ['Ours with every source', false, [55, 18, 38], [22, 6, 15], 320], ['Tool A', false, [60, 30, 45], [30, 12, 20], 45], ['Tool B', false, [20, 8, 12], [9, 2, 5], 0]];
    const runs = tools.flatMap(([tool, ours, found, relevant, seconds]) => personas.map(([persona, kind], i) => ({id: `demo/${i}/${tool}`, at, round: '2026-10-27', persona, kind, country: 'Land', tool, ours, build: ours ? 'abc1234' : '',
      found: found[i], place: relevant[i] + 2, role: relevant[i] + 4, relevant: relevant[i], employers: relevant[i] + 1, seconds, cents: 0, ...(tool === 'Ours with every source' ? {beyond: {...(i < 2 ? {'Tool A': 6 + i} : {}), 'Tool B': 14 + i, 'Tool C': null}} : {})})));   // 27 Oct 2026: the second line and what it adds beyond each rival (Tool A has no number for the third persona; Tool C failed for every persona and is sent as null)
    await call('/benchmark-search/data', {method: 'PUT', headers: {Authorization: `Bearer ${env.SELFHEAL_PUBLISH_KEY}`, 'Content-Type': 'application/json'}, body: JSON.stringify({runs})});
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
  'ai-cost-fallback': async ({env}) => {   // fictional CI spend; no broker, Telegram or AI is contacted
    await seeds['ai-cost-pro']({env});
    env.CODEX_BROKER = {fetch: async () => Response.json({fallback: {day: new Date().toISOString().slice(0, 10),
      claude: 4.25, freeAi: 0.12, claudeCap: 5, freeAiCap: 2, held: {claude: 0, freeAi: 0}}})};
  },
  'ai-cost-pro': async ({env}) => {   // fictional charged calls only; no provider request or real account
    const at = new Date().toISOString();
    for (const [account, credit, action] of [['fixture-a', -100000, 'kit'], ['fixture-a', -80000, 'tailor'], ['fixture-b', -60000, 'answer']]) {
      await env.STATS.prepare('INSERT INTO pro_credit (account, delta_micro, reason, ref, at) VALUES (?, ?, ?, ?, ?)').bind(account, credit, 'ai_call', action, at).run();
    }
  },
  'ai-cost-web': async ({env}) => {   // the Free AI board web search this month: $3.50 of its $10 line, 100 searches paid, 40 answered from the shared answers
    const month = new Date().toISOString().slice(0, 7);
    env.WEB_SEARCH_ANTHROPIC_KEY = 'demo-not-a-key';
    await env.WAITLIST.put(`freeai:web:usd:${month}`, String(3.5 * 1e6));
    await env.WAITLIST.put(`freeai:web:calls:${month}`, '100');
    await env.WAITLIST.put(`freeai:web:hits:${month}`, '40');
  },
  e2e: async ({env}) => {   // made-up e2e runs for /admin/testing/e2e (28 Oct 2026, scorecard + where e2e work goes): a week of PR and nightly runs, reds of every group, four weeks of commits by kind
    const {ingest} = await import('../admin/e2e-intel.js');
    env.SELFHEAL_PUBLISH_KEY = 'demo-publish';
    const today = Date.now(), dayAt = back => new Date(today - back * 86400000).toISOString(), reds = [['apply', 'product'], ['applyflows-1of2', 'flake'], ['applyflows-2of2', 'product'], ['quality', 'ai'],
      ['quality', 'drift'], ['settings', 'product'], ['strategy', 'timing'], ['strategy', 'open'], ['failuresnotion', 'ci'], ['upload', 'test']];
    const runs = [], fails = [];
    for (let back = 6; back >= 0; back--) for (let n = 0; n < 4; n++) {
      const runId = 9000 + back * 10 + n, red = (back + n) % 3 === 0, [suite, cause] = reds[(back * 4 + n) % reds.length], createdAt = dayAt(back);
      runs.push({runId, createdAt, kind: n % 2 ? 'pr' : 'nightly', conclusion: red ? 'failure' : 'success', minutes: 12 + n * 4});
      if (red) fails.push({runId, suite, platform: n === 3 ? 'windows' : 'mac', cause, minutes: 8 + n * 3, day: createdAt.slice(0, 10), kind: n % 2 ? 'pr' : 'nightly'});
    }
    const work = [], weekFiles = ['.github/workflows/e2e.yml', 'desktop/e2e/test-sets.json', 'desktop/e2e/lib/pick-steps.mjs', 'tools/ship.sh', 'desktop/e2e/suites/quality.mjs', 'desktop/e2e/lib/extension.mjs'];
    for (let back = 27; back >= 0; back--) {
      const day = dayAt(back).slice(0, 10), mix = {product: 9 + (back % 4), expectations: 2 + (back % 3), plumbing: Math.max(1, 6 - Math.floor((27 - back) / 6)), tests: 3, other: 2};
      for (const [kind, commits] of Object.entries(mix)) work.push({day, kind, commits});
    }
    const {weekOf} = await import('../admin/e2e-work.js'), weeks = [...new Set(work.map(row => weekOf(row.day)))];
    const workFiles = weeks.flatMap((week, w) => weekFiles.map((file, i) => ({week, file, commits: 18 - i * 3 - w})));
    // Four made-up live quality nights (admin/e2e-quality.js); the newest two carry the nightly prompt-case replay (one got worse, one with nothing changed).
    const replay = {status: 'asked', total: 63, right: 60, flipped: 1, noise: 2, newWrong: 0, unconfirmed: 0, calls: 66};
    const quality = [0, 1, 2, 3].map(back => ({runId: 41010 - back, day: dayAt(back + 1).slice(0, 10), pairs: 24, within8: [22, 20, 23, 21][back], over20: back === 2 ? 1 : 0, factsExact: 63, factsTotal: 63, judged: 18, invented: 1,
      promptCases: back === 0 ? replay : back === 1 ? {...replay, status: 'carried', flipped: 0, noise: 0, calls: 0} : undefined}));
    const week = weekOf(dayAt(0).slice(0, 10)), escapes = [
      {week, sha: 'a'.repeat(40), suites: ['apply'], none: false, journey: 'Applying with a silent Chrome extension'},
      {week, sha: 'b'.repeat(40), suites: [], none: true, journey: 'a card stuck on Checking'},
    ];
    await ingest(new Request('https://demo/e2e/data', {method: 'PUT', headers: {Authorization: 'Bearer demo-publish'}, body: JSON.stringify({rules: 3, runs, fails, work, workFiles, escapes, quality})}), env);
  },
  'e2e-green': async ({env}) => {   // fixture-only 30 days of runs per kind for the "Green runs per day" card (31 Oct 2026): main after merge climbs from ~5% (days 7-13 ago) to ~80% (today); not live measurements
    const {ingest} = await import('../admin/e2e-intel.js');
    env.SELFHEAL_PUBLISH_KEY = 'demo-publish';
    const at = Date.now(), runs = [];
    // [runs, greens] per day back (0 = today) for each kind; a missing day = no run that day
    const plan = {
      'after-merge': back => (back <= 1 ? [back ? 9 : 6, back ? 7 : 5] : back <= 6 ? [8, 6 + (back % 2)] : back <= 13 ? [3 + (back % 3), back === 10 ? 1 : 0] : back <= 20 ? [5, 2 + (back % 3)] : [6, 4 - (back % 2)]),
      beta: back => (back % 6 === 5 ? null : [7, back <= 6 ? 3 + (back % 2) : back <= 13 ? 1 : 2 + (back % 2)]),
      pr: back => [14 + (back % 4), 9 + (back % 3) + (back <= 6 ? 2 : 0)],
      nightly: back => (back % 9 === 4 ? null : [2, back <= 3 ? 2 : back % 2 + 1]),
    };
    let runId = 7000;
    for (let back = 29; back >= 0; back--) for (const [kind, rule] of Object.entries(plan)) {
      const cell = rule(back); if (!cell) continue;
      for (let i = 0; i < cell[0]; i++) runs.push({runId: runId++, createdAt: new Date(at - back * 86400000).toISOString(), kind, conclusion: i < cell[1] ? 'success' : 'failure', minutes: 14});
      if (kind === 'beta' && back % 3 === 0) runs.push({runId: runId++, createdAt: new Date(at - back * 86400000).toISOString(), kind, conclusion: 'cancelled', minutes: 2});   // cancelled runs stay out of the share
    }
    for (let i = 0; i < runs.length; i += 400) {   // ingest refuses more than 500 runs in one PUT
      const res = await ingest(new Request('https://demo/e2e/data', {method: 'PUT', headers: {Authorization: 'Bearer demo-publish'}, body: JSON.stringify({rules: 3, runs: runs.slice(i, i + 400), fails: []})}), env);
      if (!res.ok) throw new Error(`e2e-green seed: ingest answered ${res.status}`);
    }
  },
  'e2e-beta': async ({env}) => {   // fixture-only beta runs for the "Suites per beta run" card (1 Nov 2026): 14 days, 2-4 betas a day, 62 suites each; reds fall from a bad stretch to a few, two betas released; not live measurements
    const {ingest} = await import('../admin/e2e-intel.js');
    env.SELFHEAL_PUBLISH_KEY = 'demo-publish';
    const at = Date.now(), runs = [], betaRuns = [], reds = [4, 0, 43, 37, 4, 1, 2, 1, 0, 1, 1, 2, 8, 1, 0, 1, 2, 0, 1, 0, 0, 3, 1, 0, 0], hours = [1, 6, 14, 22];
    let runId = 9000, step = 0;
    for (let back = 13; back >= 0; back--) for (const hour of hours.slice(0, 2 + (back % 3))) {
      const when = new Date(at - back * 86400000), createdAt = `${when.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:${String((step * 7) % 60).padStart(2, '0')}:00Z`;
      if (Date.parse(createdAt) > at) continue;
      const red = reds[step % reds.length], stopped = step % 11 === 6, grey = stopped ? 40 : 0, cancelled = step % 17 === 9;
      const names = Array.from({length: red}, (_, i) => `${i % 2 ? 'Windows' : 'Mac + Linux'} · ${['apply', 'foryou', 'settings', 'quality', 'calendar', 'interviews', 'cardstates', 'jobs'][(step + i) % 8]}`).sort();
      runs.push({runId, createdAt, kind: 'beta', conclusion: cancelled ? 'cancelled' : red ? 'failure' : 'success', minutes: 26});
      betaRuns.push({runId, createdAt, sha: (0xabc000 + step * 4099).toString(16).padStart(7, '0'), conclusion: cancelled ? 'cancelled' : red ? 'failure' : 'success', green: 62 - red - grey, red, grey, released: !red && !grey && !cancelled && step % 5 === 3, redSuites: names});
      runId += 1; step += 1;
    }
    const res = await ingest(new Request('https://demo/e2e/data', {method: 'PUT', headers: {Authorization: 'Bearer demo-publish'}, body: JSON.stringify({rules: 3, runs, fails: [], betaRuns})}), env);
    if (!res.ok) throw new Error(`e2e-beta seed: ingest answered ${res.status}`);
  },
  integration: async ({env}) => {   // made-up integration results for /admin/testing/integrations (1 Nov 2026): a week of main runs on three layers, two flaky tests, slow tests, 14 days of the move
    const {ingest} = await import('../admin/integration-intel.js');
    env.SELFHEAL_PUBLISH_KEY = 'demo-publish';
    const dayAt = back => new Date(Date.now() - back * 86400000).toISOString().slice(0, 10), runs = [], layers = {extension: [38000, 0], app: [61000, 1], store: [9000, 2]};
    for (let back = 6; back >= 0; back--) for (let n = 0; n < 2 + (back % 3); n++) for (const [layer, [base, offset]] of Object.entries(layers)) for (const platform of layer === 'app' ? ['linux', 'windows'] : ['linux']) {
      const red = layer === 'app' && platform === 'windows' && back === 3 && n === 1 || layer === 'extension' && back === 5 && n === 0;
      runs.push({runId: 41000 + back * 100 + n * 10 + offset, layer, platform, day: dayAt(back), on: 'main', sha: (back * 31 + n * 7 + offset + 1).toString(16).padStart(7, 'a'), conclusion: red ? 'failure' : 'success', tests: layer === 'app' ? 118 : layer === 'extension' ? 64 : 41, failed: red ? 1 : 0, ms: base + back * 700 + n * 300 + (platform === 'windows' ? 24000 : 0)});
    }
    const ref = (runId, sha) => ({runId, sha});
    const flaky = [{layer: 'app', test: 'focus: the card keeps its state after Dismiss', file: 'integration/app/screen-focus.test.js', kind: 'same-commit', day: dayAt(3), red: ref(41310, 'a00005e'), green: ref(41311, 'a00005e')},
      {layer: 'extension', test: 'recorded page: two-step form reads both steps', file: 'integration/extension/forms.test.mjs', kind: 'unchanged-files', day: dayAt(5), red: ref(41500, 'a000084'), green: ref(41400, 'a000075')}];
    const slowest = [['app', 'settings: engine panel and ⌘K open on every tab', 'integration/app/screen-settings.test.js', 9400], ['extension', 'recorded page: long Workday form fills to the end', 'integration/extension/workday.test.mjs', 8100],
      ['app', 'activity: failures wording for every cause', 'integration/app/screen-activity-failures.test.js', 6200], ['extension', 'recorded page: sign-in wall stops the read', 'integration/extension/wall.test.mjs', 4300], ['app', 'calendar: month grid with 40 events', 'integration/app/screen-calendar.test.js', 3900],
      ['store', 'scoring: 500 jobs dedupe by employer and title', 'integration/store/dedupe.test.mjs', 2800], ['app', 'foryou: empty, loading and full states', 'integration/app/screen-foryou.test.js', 2500], ['store', 'strategy: places re-judged on a change', 'integration/store/strategy.test.mjs', 1700],
      ['extension', 'recorded page: cookie banner is left alone', 'integration/extension/banner.test.mjs', 1500], ['store', 'store: round trip of 200 rows', 'integration/store/roundtrip.test.mjs', 900]].map(([layer, test, file, ms]) => ({layer, test, file, ms, runs: 5}));
    const days = Array.from({length: 14}, (_, i) => { const back = 13 - i; return {day: dayAt(back), e2eSuites: 29 - Math.floor(i / 5), e2eSteps: 296 - i * 5, integration: {extension: i > 8 ? 8 + (i - 8) * 8 : 0, app: 40 + i * 6, store: i > 10 ? (i - 10) * 14 : 0}}; });
    const body = {runs, flaky, slowest, counts: {extension: {tests: 64, files: 9}, app: {tests: 118, files: 16}, store: {tests: 41, files: 6}}, move: {days, e2eSteps: days[13].e2eSteps, lanes: 28}};
    await ingest(new Request('https://demo/integration/data', {method: 'PUT', headers: {Authorization: 'Bearer demo-publish'}, body: JSON.stringify(body)}), env);
  },
  'integration-not-starting': async ({env}) => {   // /admin/testing/integrations when the Worker's last start of its collector was refused (1 Nov 2026): the integration data plus the red line
    await seeds.integration({env});
    const {recordStarts} = await import('../shared/intel-start.js');
    await recordStarts(env.STATS, [{workflow: 'integration-intel.yml', error: 'E2E_INTEL_GITHUB_TOKEN is not set (the site GITHUB_TOKEN covers the public repo, not this one)'}]);
  },
  'e2e-grey': async ({env}) => {   // fixture-only Grey lifecycle: four lanes, seven quality nights (two red), and the stored grey ledger (suite × reason); direct snapshot works for before shots too
    const at = new Date(), dayAt = back => new Date(at.getTime() - back * 86400000).toISOString().slice(0, 10);
    const suiteNights = Array.from({length: 7}, (_, back) => ({runId: 9100 + 6 - back, day: dayAt(back), kind: 'nightly', suite: 'quality', platform: 'mac',
      green: ![1, 4].includes(back), rates: {agree: [0.92, 0.70, 0.94, 0.90, 0.74, 0.91, 0.93][back]}}));
    const snapshot = {schema: 2, at: at.toISOString(),
      lanes: {suites: {
        quality: {lane: 'tolerant', input: 'ai', since: '2026-10-29', why: 'One fixture question still needs a recorded answer.', returns: 'Record the fixture answer and prove a green run.'},
        qualityai: {lane: 'tolerant', input: 'ai', since: '2026-10-29', why: 'Fixture answer quality is measured as a rate.', returns: 'Seven fixture nights within the measured band.'},
        'notion-real': {lane: 'tolerant', input: 'outside', since: '2026-10-28', why: 'The fixture service can refuse or delay a request.', returns: 'Seven steady fixture service nights.'},
        'fixture-suite': {lane: 'suspended', input: 'clock', since: '2026-10-10', why: 'The fixture flipped red then green on the same commit.'}
      }}, suiteNights, mainBands: {quality: {agree: {lower: 0.80, upper: 0.95}}},
      days: suiteNights.map(night => ({day: night.day, kind: 'nightly', runs: 1, reds: night.green ? 0 : 1, greens: night.green ? 1 : 0, redMin: night.green ? 0 : 12})),
      fails: suiteNights.filter(night => !night.green).map(night => ({day: night.day, kind: 'nightly', suite: 'quality', platform: 'mac', cause: 'ai', n: 1, min: 12})),
      latest: suiteNights.map(night => ({runId: night.runId, day: night.day, kind: 'nightly', conclusion: night.green ? 'success' : 'failure', minutes: 12})),
      quality: [], breaks: [], caught: [], work: [], workFiles: []};
    await env.STATS.prepare('INSERT INTO e2e_snapshot (id, at, body) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET at = excluded.at, body = excluded.body')
      .bind(snapshot.at, JSON.stringify(snapshot)).run();
  },
  'e2e-speed': async ({env, call}) => {   // fixture-only job medians: main's three slowest suites, a sparse row, and a PR warning (not live measurements)
    await seeds.e2e({env, call});
    const at = new Date(), createdAt = at.toISOString(), samples = [
      ['jobs', [290, 307, 320, 307, 305]], ['activityfailures', [180, 194, 201, 194, 190]], ['focus', [20, 22, 25, 22, 21]], ['updates', [6, 7, 8, 7, 7]], ['new-suite', [12]]
    ];
    const speedRuns = Array.from({length: 5}, (_, i) => ({runId: 9800 + i, createdAt, kind: 'scheduled',
      suiteJobs: samples.filter(([, values]) => i < values.length).map(([suite, values]) => ({suite, seconds: values[i]}))}));
    speedRuns.push(...[1, 2, 3].map(i => ({runId: 9900 + i, createdAt, kind: 'pr', suiteJobs: [{suite: 'fixture-slow-pr', seconds: 480 + i}]})));
    const row = await env.STATS.prepare('SELECT body FROM e2e_snapshot WHERE id = 1').first(), snapshot = JSON.parse(row.body);
    await env.STATS.prepare('UPDATE e2e_snapshot SET body = ? WHERE id = 1').bind(JSON.stringify({...snapshot, speedRuns})).run();
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
