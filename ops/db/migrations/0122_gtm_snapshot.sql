-- GTM readiness (owner, 1 Nov 2026): ONE snapshot row the page reads, like e2e_snapshot and integration_snapshot (admin/gtm-readiness.js). No logs, no personal data.
CREATE TABLE IF NOT EXISTS gtm_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), at TEXT NOT NULL, body TEXT NOT NULL);
