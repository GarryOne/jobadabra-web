-- /admin/lab-job-search "Session checks" tab (owner, 24 Oct 2026): what a session's local search check found and concluded, so other sessions read it instead of re-running it.
-- Counts, seconds, a build sha, board names with listed/relevant counts and two short sentences: no job titles, no company names, no CV text. The newest 300 are kept.
CREATE TABLE IF NOT EXISTS session_checks (
  id TEXT PRIMARY KEY,
  session TEXT NOT NULL,
  case_id TEXT NOT NULL,
  label TEXT,
  country TEXT,
  role TEXT,
  run_at TEXT NOT NULL,
  build TEXT,
  mode TEXT NOT NULL,
  state TEXT NOT NULL,
  seconds INTEGER,
  first_s INTEGER,
  local_jobs INTEGER,
  in_places INTEGER,
  scored INTEGER,
  fit70 INTEGER,
  boards_json TEXT NOT NULL DEFAULT '[]',
  broke TEXT,
  conclusion TEXT,
  prs TEXT
);
CREATE INDEX IF NOT EXISTS session_checks_run ON session_checks (run_at);
