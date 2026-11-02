-- The "What's new" mail at a stable release (admin/release-mail.js, spec docs/superpowers/specs/2026-10-28-release-mail-design.md): one row per version, a draft until the owner sends it.
-- The primary key is the idempotency: a version is drafted once and claimed for sending once.
CREATE TABLE IF NOT EXISTS release_mail (
  version TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft',   -- draft | sending | sent
  data TEXT NOT NULL,                     -- JSON: the template data of the 'release' mail (headline, sections, month ...)
  created_at TEXT NOT NULL,
  sent_at TEXT,
  sent_count INTEGER NOT NULL DEFAULT 0
);
