-- A What's new entry written without the AI (it could not draft): plain = 1 until a run that can reach the AI writes it again (admin/changelog-store.js redraft).
ALTER TABLE changelog_entries ADD COLUMN plain INTEGER NOT NULL DEFAULT 0;
