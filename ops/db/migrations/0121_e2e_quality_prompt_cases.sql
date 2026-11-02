-- The night's prompt-case replay beside the quality numbers (admin/e2e-quality.js cleanPrompt): JSON of counts only (status, total, right, flipped, noise, newWrong, unconfirmed, calls); NULL on nights before it or without one.
ALTER TABLE e2e_quality ADD COLUMN prompt_cases TEXT;
