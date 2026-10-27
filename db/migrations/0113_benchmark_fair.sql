-- The fair round (admin/benchmark-fair.js, owner 27 Oct 2026): which round a benchmark run belongs to ('old' = before the fair round; 'fixed'; 'week-YYYY-Www'),
-- its repeat, and the fields it never reached (a question another tool filled right on that form). Old rows keep 'old'.
ALTER TABLE benchmark_runs ADD COLUMN round TEXT NOT NULL DEFAULT 'old';
ALTER TABLE benchmark_runs ADD COLUMN rep INTEGER NOT NULL DEFAULT 1;
ALTER TABLE benchmark_runs ADD COLUMN unreached INTEGER NOT NULL DEFAULT 0;
