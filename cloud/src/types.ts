export interface Env { DB: D1Database; ATTACHMENTS: KVNamespace; ASSETS: Fetcher; OWNER_SECRET: string; VAPID_PUBLIC_KEY: string; VAPID_PRIVATE_KEY: string; VAPID_SUBJECT: string }
export type Actor = { id: string; owner: boolean };
export type RecordRow = { kind: "tasks" | "notes" | "subscriptions"; id: string; version: number; data: string | null; deleted: number; updated_at: number };
export const recordView = (row: RecordRow) => ({ kind: row.kind, id: row.id, version: row.version, data: row.data ? JSON.parse(row.data) : null, deleted: !!row.deleted, updatedAt: row.updated_at });
