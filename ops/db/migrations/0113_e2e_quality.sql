-- How steady the AI is in the quality suite (admin/e2e-quality.js): one row per live quality night, counts only (no scores, no texts, no logs).
CREATE TABLE IF NOT EXISTS e2e_quality (run_id INTEGER PRIMARY KEY, day TEXT NOT NULL, pairs INTEGER NOT NULL, within8 INTEGER NOT NULL, over20 INTEGER NOT NULL,
  facts_exact INTEGER NOT NULL DEFAULT 0, facts_total INTEGER NOT NULL DEFAULT 0, judged INTEGER NOT NULL DEFAULT 0, invented INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS e2e_quality_day ON e2e_quality (day);
