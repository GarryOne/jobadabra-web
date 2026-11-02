-- Full promo codes on /admin/promo-codes (owner, 25 Oct 2026): the code is also kept encrypted (AES-GCM, key = Worker secret PROMO_CODE_KEY), so a leaked database alone gives no working code. NULL = made before this (or no key then).
ALTER TABLE pro_promo_codes ADD COLUMN code_enc TEXT;
