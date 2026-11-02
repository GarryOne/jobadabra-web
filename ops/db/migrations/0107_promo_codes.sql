-- Pro promo codes (owner, 25 Oct 2026): codes the owner makes on /admin/promo-codes. Only a hash of each code is kept; Pro by a code lasts until its end date or its revoke.
CREATE TABLE pro_promo_codes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  code_hash TEXT NOT NULL UNIQUE,   -- digest of the normalised code, never the code
  last4 TEXT NOT NULL,              -- the code's last 4 characters, to tell codes apart on the page
  cap INTEGER NOT NULL,             -- most installs that may use it
  ends_at TEXT NOT NULL,            -- ISO: the last moment of the end day, UTC
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE TABLE pro_promo_uses (
  install TEXT PRIMARY KEY,         -- the raw random install id (as pro_devices): one install holds one code
  code TEXT NOT NULL,
  at TEXT NOT NULL,
  last_seen TEXT NOT NULL
);
CREATE INDEX pro_promo_uses_code ON pro_promo_uses (code);
