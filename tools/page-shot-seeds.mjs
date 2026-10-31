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
  e2e: async ({env}) => {   // made-up e2e runs for /admin/operations/e2e (28 Oct 2026, scorecard + where e2e work goes): a week of PR and nightly runs, reds of every group, four weeks of commits by kind
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
    const week = weekOf(dayAt(0).slice(0, 10)), escapes = [
      {week, sha: 'a'.repeat(40), suites: ['apply'], none: false, journey: 'Applying with a silent Chrome extension'},
      {week, sha: 'b'.repeat(40), suites: [], none: true, journey: 'a card stuck on Checking'},
    ];
    await ingest(new Request('https://demo/e2e/data', {method: 'PUT', headers: {Authorization: 'Bearer demo-publish'}, body: JSON.stringify({rules: 3, runs, fails, work, workFiles, escapes})}), env);
  },
  'e2e-grey': async ({env}) => {   // fixture-only Grey lifecycle: four lanes, seven quality nights (two red), and stored PR reasons; direct snapshot works for before shots too
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
      prGreys: Object.entries({main: 3, runner: 2, 'ai-credit': 1, install: 2, tolerant: 4}).map(([reason, n]) => ({day: dayAt(0), reason, n})),
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
