-- The search robot's draw (owner, 26 Oct 2026; jobs/persona-search/draw_wide.py): a draw now names its role (made up by the AI for a role kind), the kind of place
-- (city, country, region, remote) and the place's words, the path (first search, field change then a 2nd search, the same search again), the engine (api, free),
-- its measured AI dollars and the funnel of the measured search (fixed counts as JSON: employers, boards, web searches, jobs listed). No CV text, no job titles.
ALTER TABLE search_lab_draws ADD COLUMN role TEXT;
ALTER TABLE search_lab_draws ADD COLUMN place_kind TEXT;
ALTER TABLE search_lab_draws ADD COLUMN place TEXT;
ALTER TABLE search_lab_draws ADD COLUMN path TEXT;
ALTER TABLE search_lab_draws ADD COLUMN engine TEXT;
ALTER TABLE search_lab_draws ADD COLUMN ai_usd REAL;
ALTER TABLE search_lab_draws ADD COLUMN funnel TEXT;
