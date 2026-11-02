-- What each source gave the install that read it, for one shared ranking per role kind × country (api/source-ranking.js; spec
-- docs/superpowers/specs/2026-10-18-search-learns-sources.md item B, owner 26 Oct 2026): jobs LOCATED in the install's places, those with a fit
-- of 70+, and the seconds the read took, for employer feeds (contributions) as boards already do (sitefacts, migration 0094); a board's row also
-- keeps the install's role kinds. Counts and fixed ids only.
ALTER TABLE contributions ADD COLUMN local INTEGER;
ALTER TABLE contributions ADD COLUMN fit70 INTEGER;
ALTER TABLE contributions ADD COLUMN seconds REAL;
ALTER TABLE sitefacts ADD COLUMN seconds REAL;
ALTER TABLE sitefacts ADD COLUMN roles TEXT;
