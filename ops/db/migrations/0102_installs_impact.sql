-- What real installs add to the central list, day by day (/admin/installs; owner, 20 Oct 2026). Counts only.
-- jobs_total: open jobs in the whole list; from_pool_jobs: open jobs at the employers an install shared; pool_cells: those employers per
-- kind × European country, JSON {"<kind>|<country>": [employers, jobs]} like cells.
ALTER TABLE index_daily ADD COLUMN jobs_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE index_daily ADD COLUMN from_pool_jobs INTEGER NOT NULL DEFAULT 0;
ALTER TABLE index_daily ADD COLUMN pool_cells TEXT NOT NULL DEFAULT '';
