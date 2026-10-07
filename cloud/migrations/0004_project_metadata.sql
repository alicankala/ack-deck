-- Additive versioned project metadata; native paths never leave the desktop.
CREATE TABLE IF NOT EXISTS projects (kind TEXT NOT NULL DEFAULT 'projects' CHECK(kind='projects'), id TEXT NOT NULL, version INTEGER NOT NULL, data TEXT, deleted INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY(kind,id));
