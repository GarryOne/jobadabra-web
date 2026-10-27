-- Benchmark Job Search: the relevant jobs "ours with every source" adds beyond each rival ({rival: jobs}, only on that run's rows; owner, 27 Oct 2026)
ALTER TABLE benchmark_search_runs ADD COLUMN beyond TEXT NOT NULL DEFAULT '{}';
