-- v4: multiple cases and bases; content condition stored in sessions.condition (baseline|missing_info|off_focus|overreach).
-- SQLite ADD COLUMN is not idempotent; tools/migrate.mjs checks PRAGMA table_info before applying.
ALTER TABLE sessions ADD COLUMN base_id TEXT;
ALTER TABLE sessions ADD COLUMN version_hash TEXT;
ALTER TABLE invitations ADD COLUMN campaign_hash TEXT;
ALTER TABLE sessions ADD COLUMN plan_json TEXT;
ALTER TABLE sessions ADD COLUMN sequence INTEGER;
