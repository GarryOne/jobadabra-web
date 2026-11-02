-- The last on-time start of each CI collector by the Worker (shared/intel-start.js): one row per workflow, ok 0 + the reason when GitHub refused it or the token is missing.
-- /admin/operations/e2e and /admin/operations/integrations draw "collector not starting: <reason>" from it. A reason is a short sentence, never a token.
CREATE TABLE IF NOT EXISTS intel_start (workflow TEXT PRIMARY KEY, at TEXT NOT NULL, ok INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT '');
