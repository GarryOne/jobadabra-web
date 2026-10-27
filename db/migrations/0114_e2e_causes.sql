-- Every e2e run kind and a cause for every red (owner, 27 Oct 2026): a run's kind already exists; it gains the minutes its jobs waited for a runner and ran, and its PR;
-- a red gains its run kind, its failure line (the test step's own words, no personal data), the fixing commit, and whether a PR caught a bug with it (admin/e2e-intel.js).
ALTER TABLE e2e_runs ADD COLUMN queue_min REAL NOT NULL DEFAULT 0;
ALTER TABLE e2e_runs ADD COLUMN run_min REAL NOT NULL DEFAULT 0;
ALTER TABLE e2e_runs ADD COLUMN pr INTEGER;
ALTER TABLE e2e_fails ADD COLUMN kind TEXT NOT NULL DEFAULT 'beta';
ALTER TABLE e2e_fails ADD COLUMN line TEXT NOT NULL DEFAULT '';
ALTER TABLE e2e_fails ADD COLUMN fix TEXT NOT NULL DEFAULT '';
ALTER TABLE e2e_fails ADD COLUMN caught INTEGER NOT NULL DEFAULT 0;
