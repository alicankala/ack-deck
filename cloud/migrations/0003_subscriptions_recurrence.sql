-- Additive only: existing records, pairings, tokens and delivery history remain.
CREATE TABLE subscriptions (kind TEXT NOT NULL DEFAULT 'subscriptions' CHECK(kind='subscriptions'), id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT, deleted INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY(kind,id));
ALTER TABLE reminders ADD COLUMN kind TEXT NOT NULL DEFAULT 'tasks';
ALTER TABLE reminders ADD COLUMN occurrence_at INTEGER;
