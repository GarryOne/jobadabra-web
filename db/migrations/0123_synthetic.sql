-- Synthetic monitoring (shared/synthetic.js): one row per probe per 15-minute round, and each probe's up/down state (down after 2 reds in a row; told = 0 until the owner has been told the change).
-- Rows older than 30 days go in the daily job. A reason is a short fixed-form phrase (HTTP 502, timeout 10s), never a response body.
CREATE TABLE IF NOT EXISTS synthetic_probes (probe TEXT NOT NULL, at TEXT NOT NULL, ok INTEGER NOT NULL, ms INTEGER NOT NULL DEFAULT 0, reason TEXT NOT NULL DEFAULT '', PRIMARY KEY (probe, at));
CREATE TABLE IF NOT EXISTS synthetic_state (probe TEXT PRIMARY KEY, state TEXT NOT NULL DEFAULT 'up', since TEXT NOT NULL, red_since TEXT NOT NULL DEFAULT '', streak INTEGER NOT NULL DEFAULT 0, reason TEXT NOT NULL DEFAULT '', told INTEGER NOT NULL DEFAULT 1);
