-- Benchmark Job Search (admin/benchmark-search.js): one summary row per tool on a persona, written once by the bake-off's search-bench publish step (PUT /benchmark-search/data), and one snapshot row the page reads.
CREATE TABLE IF NOT EXISTS benchmark_search_runs (id TEXT PRIMARY KEY, at TEXT NOT NULL, round TEXT NOT NULL, persona TEXT NOT NULL, kind TEXT NOT NULL, country TEXT NOT NULL DEFAULT '', tool TEXT NOT NULL,
  ours INTEGER NOT NULL DEFAULT 0, build TEXT NOT NULL DEFAULT '', found INTEGER NOT NULL DEFAULT 0, place INTEGER NOT NULL DEFAULT 0, role INTEGER NOT NULL DEFAULT 0, relevant INTEGER NOT NULL DEFAULT 0,
  employers INTEGER NOT NULL DEFAULT 0, seconds INTEGER NOT NULL DEFAULT 0, cents INTEGER NOT NULL DEFAULT 0, missed TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS benchmark_search_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), at TEXT NOT NULL, body TEXT NOT NULL);
