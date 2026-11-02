-- The integration tests' page (admin/integration-intel.js): ONE snapshot row the page reads. Built hourly by jobs/integration-intel.mjs; no logs, no personal data.
CREATE TABLE IF NOT EXISTS integration_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), at TEXT NOT NULL, body TEXT NOT NULL);
