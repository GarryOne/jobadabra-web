-- Every scheduled CI job on one page (src/schedules.js): one snapshot row, written by the collector (schedules-snapshot.yml, PUT /schedules/data), read by the page.
CREATE TABLE IF NOT EXISTS schedules_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), at TEXT NOT NULL, body TEXT NOT NULL);
