-- Daily prayer logs (prayed/missed status + daily prayer/spiritual notes)
CREATE TABLE IF NOT EXISTS prayer_logs (kind TEXT NOT NULL DEFAULT 'prayerLogs' CHECK(kind='prayerLogs'), id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT, deleted INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY(kind,id));
