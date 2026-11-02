-- AI-credit promo codes (owner, 26 Oct 2026: "the new ones should have a topup value. I want to be able to topup with 10e for example, using a promo code"):
-- a code of kind 'credit' adds its euros of AI credit to the install that redeems it, once per install per code; codes stack. The plan stays as it was.
ALTER TABLE pro_promo_codes ADD COLUMN kind TEXT NOT NULL DEFAULT 'pro';   -- 'pro' (Pro, no credit) | 'credit' (AI credit, plan unchanged)
ALTER TABLE pro_promo_codes ADD COLUMN credit_eur INTEGER;                  -- kind 'credit': whole euros of AI credit per install
CREATE TABLE pro_promo_credit_uses (
  code TEXT NOT NULL,
  install TEXT NOT NULL,            -- the raw random install id (as pro_promo_uses)
  at TEXT NOT NULL,
  PRIMARY KEY (code, install)
);
-- AI credit held by an install, not an account (a credit code needs no e-mail): served by the credit lane (shared/pro-ai.js) while it lasts, then the Free rules again.
-- Its ledger rows are in pro_credit with account = 'install:' + the install's digest.
CREATE TABLE install_credit (
  install TEXT PRIMARY KEY,
  credit_micro INTEGER NOT NULL DEFAULT 0,        -- micro-credit-euros left (as pro_accounts.credit_micro)
  credit_added_micro INTEGER NOT NULL DEFAULT 0,  -- every credit ever added: "N% left" reads it
  updated_at TEXT NOT NULL
);
