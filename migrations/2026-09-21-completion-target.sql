-- Added through the idempotent migration runner.
ALTER TABLE campaigns ADD COLUMN completion_target INTEGER NOT NULL DEFAULT 0;
