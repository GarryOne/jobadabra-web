-- /admin/operations/agent-coding (admin/agent-coding.js): one row per kind and day, rewritten by a repeat upload of that day.
CREATE TABLE IF NOT EXISTS agent_coding_days (
  kind TEXT NOT NULL,                   -- 'gate' (push-gate counts from the owner's Mac) or 'ci' (reds, fixes, areas, CI minutes from GitHub)
  day TEXT NOT NULL,                    -- YYYY-MM-DD (UTC)
  card TEXT NOT NULL,                   -- JSON, shape per kind in admin/agent-coding.js (counts and seconds only)
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind, day)
);
