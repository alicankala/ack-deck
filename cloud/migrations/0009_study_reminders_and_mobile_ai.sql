-- Study reminder preferences and Mobile ACK AI encrypted key + desktop relay queries
ALTER TABLE desktop_state ADD COLUMN study_reminders TEXT;
CREATE TABLE IF NOT EXISTS ai_secrets (id INTEGER PRIMARY KEY CHECK(id=1), iv TEXT NOT NULL, cipher TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ai_queries (id TEXT PRIMARY KEY, device_id TEXT NOT NULL, prompt TEXT NOT NULL, history TEXT NOT NULL DEFAULT '[]', model TEXT NOT NULL DEFAULT 'fast', state TEXT NOT NULL DEFAULT 'pending', reply TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
