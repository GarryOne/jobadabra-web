-- Why an employer has no readable job feed (src/scout_core.py OUTCOMES): no_feed, refused or unreachable. Old rows and shares without the word
-- are no_feed. The contributions read serves refused and unreachable only once 3 installs agree (an opinion), no_feed after one (as before).
ALTER TABLE nofeed ADD COLUMN outcome TEXT;
