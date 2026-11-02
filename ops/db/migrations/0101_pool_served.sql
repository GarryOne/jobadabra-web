-- Steps installs skipped because the pool already had the answer (a place another install placed, ...): counts only, a fixed word per kind
-- (src/pool_served.py; owner, 20 Oct 2026: "steps skipped thanks to other installs", day by day on /admin/scouting).
-- pool_served_total: each install's latest running total per kind (hashed install), to turn a new total into the day's increase.
CREATE TABLE IF NOT EXISTS pool_served_total (
  install TEXT NOT NULL,
  kind TEXT NOT NULL,
  total INTEGER NOT NULL,
  PRIMARY KEY (install, kind)
);
-- pool_served_day: steps skipped per day and kind across all installs.
CREATE TABLE IF NOT EXISTS pool_served_day (
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (day, kind)
);
