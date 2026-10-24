// Demo data for tools/page-shot.mjs: made-up rows only (codes, labels, people), never a real secret or the live site's data. Each seed gets {env, call}: call(path, init) goes through the real Worker as the owner.
const form = fields => ({method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams(fields)});

export const seeds = {
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
};
