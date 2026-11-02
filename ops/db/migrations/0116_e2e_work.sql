-- Where e2e work goes (owner, 28 Oct 2026; admin/e2e-work.js): commits of the public repo's main per day and kind (product, expectations, plumbing, tests, other),
-- and per week the e2e and CI files changed most. Counts and file paths only; the collector rewrites the days and weeks it sends (a rewritten main lowers a count).
CREATE TABLE IF NOT EXISTS e2e_work (day TEXT NOT NULL, kind TEXT NOT NULL, commits INTEGER NOT NULL, PRIMARY KEY (day, kind));
CREATE TABLE IF NOT EXISTS e2e_work_files (week TEXT NOT NULL, file TEXT NOT NULL, commits INTEGER NOT NULL, PRIMARY KEY (week, file));
