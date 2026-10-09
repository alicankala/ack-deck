-- Separate program records, with existing optimistic versioning and tombstones.
CREATE TABLE IF NOT EXISTS study_programs (kind TEXT NOT NULL DEFAULT 'studyPrograms' CHECK(kind='studyPrograms'), id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT, deleted INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY(kind,id));
