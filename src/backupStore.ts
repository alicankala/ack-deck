import { validStudyProgram } from "../shared/studyPrograms";
import { hasCredentials } from "../shared/privacy";
import { validActivity,ACTIVITY_LIMIT } from "./activityStore";
import { validTemplate } from "./templateStore";
import { isProject } from "./projectStore";
import { validLinks } from "../shared/productivity";
import { validSubscription } from "../shared/subscriptions";
import { validNoteAttachments } from "./notesStore";
import { isRecentItem } from "./recentStore";
import { beginConversationRestore, recoverConversationRestore, flushConversationWrites, loadConversations, isConversation } from "./conversationStore";
import { invoke } from "@tauri-apps/api/core";
import { isTask } from "./taskStore";
import { isArchiveEntry } from "./archiveStore";
import { isFileEntry } from "./fileStore";
import { isSpeedResult } from "./speedTestStore";
import { DEFAULT_PREFERENCES } from "./preferences";
import type { DesktopPreferences } from "./desktopClient";
import { isWorkspace, isShortcutData } from "./workHubStore";
import { isUsage } from "./usageStore";
export type BackupDesktop = DesktopPreferences & { autoStart: boolean };
export const BACKUP_KEYS = { tasks: "ack-deck.tasks.v1", projects: "ack-deck.projects.v1", notes: "ack-deck.notes.v1", files: "ack-deck.files.v1", speedTest: "ack-deck.speed-test.v1", archive: "ack-deck.archive.v1", preferences: "ack-deck.preferences.v1", aiModel: "ack-deck.ai-model.v1" } as const;
export const HUB_BACKUP_KEYS = { studyPrograms: "ack-deck.study-programs.v1", activity: "ack-deck.activity.v1", templates: "ack-deck.templates.v1", subscriptions: "ack-deck.subscriptions.v1", workspaces: "ack-deck.workspaces.v1", shortcuts: "ack-deck.shortcuts.v1", usage: "ack-deck.usage.v1", hiddenLegacy: "ack-deck.shortcuts-legacy-hidden.v1", recent: "ack-deck.recent-items.v1" } as const;
const JOURNAL_KEY = "ack-deck.restore-journal.v1";
export type Backup = { formatVersion: 1 | 2; appVersion: string; createdAt: string; data: Record<keyof typeof BACKUP_KEYS, unknown> & Partial<Record<keyof typeof HUB_BACKUP_KEYS, unknown>> & { desktop: BackupDesktop; conversations?: import("./conversationStore").Conversation[]; paletteShortcut?: string } };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const fields = (value: unknown, allowed: string[]) => object(value) && Object.keys(value).every((key) => allowed.includes(key));
const dateNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 8.64e15;
function array(value: unknown, validator: (value: unknown) => boolean): boolean { return Array.isArray(value) && value.length <= 100000 && value.every(validator) && new Set(value.map((item) => item.id)).size === value.length; }
function validDesktop(value: unknown): value is BackupDesktop { return fields(value, ["closeToTray", "startInTray", "autoStart"]) && object(value) && [value.closeToTray, value.startInTray, value.autoStart].every((entry) => typeof entry === "boolean"); }
function validData(data: unknown): boolean {
  if (!fields(data, [...Object.keys(BACKUP_KEYS), ...Object.keys(HUB_BACKUP_KEYS), "desktop", "conversations", "paletteShortcut"]) || !object(data) || ![...Object.keys(BACKUP_KEYS), "desktop"].every(key => key in data)) return false;
  if (data.conversations !== undefined && !array(data.conversations, isConversation) || data.paletteShortcut !== undefined && (typeof data.paletteShortcut !== "string" || data.paletteShortcut.length > 80 || !/^(?=.*(?:Ctrl|Control|Alt)\+)[a-z0-9+]+$/i.test(data.paletteShortcut)) || data.recent !== undefined && (!Array.isArray(data.recent) || data.recent.length > 20 || !data.recent.every(isRecentItem))) return false;
  if(data.activity!==undefined&&(!array(data.activity,validActivity)||(data.activity as unknown[]).length>ACTIVITY_LIMIT)||data.templates!==undefined&&(!array(data.templates,validTemplate)||(data.templates as unknown[]).length>100))return false;
  if(data.studyPrograms!==undefined&&(!array(data.studyPrograms,validStudyProgram)||(data.studyPrograms as unknown[]).length>100))return false;
  if(data.subscriptions!==undefined&&!array(data.subscriptions,validSubscription))return false;
  if (data.workspaces !== undefined && !array(data.workspaces, isWorkspace) || data.shortcuts !== undefined && !isShortcutData(data.shortcuts) || data.usage !== undefined && (!Array.isArray(data.usage) || data.usage.length > 500 || !data.usage.every(isUsage)) || data.hiddenLegacy !== undefined && (!Array.isArray(data.hiddenLegacy) || !data.hiddenLegacy.every(v => typeof v === "string" && v.length <= 512))) return false;
  return array(data.tasks, (item) => isTask(item) && fields(item, ["id", "text", "completed", "dueDate", "dueTime", "priority", "reminder", "remindedFor", "recurrence", "dueAt", "occurrenceAt", "lastCompletedAt", "snoozedUntil", "timezone", "checklist", "projectId", "workspaceId", "sourceInboxId", "reminderLeadMinutes"])) &&
    array(data.projects, (item) => isProject(item) && fields(item, ["id", "name", "description", "folderPath", "nextStep", "workspaceId", "inboxIds", "shortcutIds", "fileIds"]) && object(item) && typeof item.id === "string" && !!item.id && [item.name, item.description, item.folderPath].every((value) => typeof value === "string")) &&
    array(data.notes, (item) => fields(item, ["id", "title", "content", "updatedAt", "attachments", "projectId", "workspaceId", "sourceInboxId"]) && object(item) && typeof item.id === "string" && !!item.id && typeof item.title === "string" && typeof item.content === "string" && validLinks(item) && dateNumber(item.updatedAt) && (item.attachments === undefined || validNoteAttachments(item.attachments))) &&
    array(data.files, (item) => isFileEntry(item) && fields(item, ["id", "name", "path", "fileName", "kind", "extension", "sizeBytes", "modifiedAt"])) &&
    array(data.archive, (item) => isArchiveEntry(item) && fields(item, ["id", "title", "category", "description", "date", "tags", "file", "createdAt", "updatedAt", "attachments", "sourceInboxId"]) && object(item) && (item.file === null || fields(item.file, ["path", "fileName"]))) &&
    (data.speedTest === null || (isSpeedResult(data.speedTest) && fields(data.speedTest, ["downloadMbps", "uploadMbps", "latencyMs", "jitterMs", "testedAt"]))) &&
    fields(data.preferences, ["startPage", "pcRefreshMs"]) && object(data.preferences) && ["home", "ai", "projects", "tools", "archive"].includes(data.preferences.startPage as string) && [2500, 5000, 10000].includes(data.preferences.pcRefreshMs as number) &&
    ["fast", "powerful"].includes(data.aiModel as string) && validDesktop(data.desktop);
}
export function parseBackup(text: string): Backup {
  if (typeof text !== "string" || text.length > 10 * 1024 * 1024 || (text.includes("AIza") || hasCredentials(text))) throw new Error("Yedek çok büyük veya gizli anahtar içeriyor.");
  let value: unknown; try { value = JSON.parse(text); } catch { throw new Error("Yedek dosyası geçerli JSON değil."); }
  if (!fields(value, ["formatVersion", "appVersion", "createdAt", "data"]) || !object(value) || ![1, 2].includes(value.formatVersion as number) || typeof value.appVersion !== "string" || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt)) || !validData(value.data)) throw new Error("Yedek biçimi veya kayıtları geçersiz. Mevcut veriler değiştirilmedi.");
  return value as Backup;
}
export function createBackup(desktop: BackupDesktop, appVersion: string, storage: Store = window.localStorage): Backup {
  const data: Record<string, unknown> = { desktop };
  for (const [name, key] of Object.entries(BACKUP_KEYS)) {
    const raw = storage.getItem(key) ?? (name === "tasks" ? storage.getItem("kontrol-merkezi.tasks.v1") : null);
    if (name === "aiModel") data[name] = raw ?? "fast";
    else data[name] = raw === null ? (name === "preferences" ? DEFAULT_PREFERENCES : name === "speedTest" ? null : []) : JSON.parse(raw);
  }
  for (const [name, key] of Object.entries(HUB_BACKUP_KEYS)) { const raw = storage.getItem(key); if (raw !== null) data[name] = JSON.parse(raw); }
  return parseBackup(JSON.stringify({ formatVersion: 1, appVersion, createdAt: new Date().toISOString(), data }));
}
function signalRestored(outcome: "success" | "rollback") { if (typeof Event !== "undefined") { window.dispatchEvent?.(new Event("ack-data-changed")); window.dispatchEvent?.(typeof CustomEvent !== "undefined" ? new CustomEvent("ack-data-restored", { detail: outcome }) : new Event("ack-data-restored")); } }
function signalRestoreActive(active: boolean) { if (typeof CustomEvent !== "undefined") window.dispatchEvent?.(new CustomEvent("ack-restore-active", { detail: active })); }
type Journal = { formatVersion: 1; snapshot: Record<string, string | null>; desktop: BackupDesktop; conversations?: boolean; paletteShortcut?: string; paletteRegistered?: boolean };
function parseJournal(raw: string): Journal {
  const value = JSON.parse(raw), keys = Object.values(BACKUP_KEYS), allowed: string[] = [...keys, ...Object.values(HUB_BACKUP_KEYS)];
  if (!fields(value, ["formatVersion", "snapshot", "desktop", "conversations", "paletteShortcut", "paletteRegistered"]) || value.formatVersion !== 1 || !object(value.snapshot) || !keys.every((key) => key in value.snapshot) || !Object.entries(value.snapshot).every(([key, v]) => allowed.includes(key) && (v === null || typeof v === "string")) || !validDesktop(value.desktop) || (value.paletteRegistered !== undefined && typeof value.paletteRegistered !== "boolean") || (value.conversations !== undefined && typeof value.conversations !== "boolean") || (value.paletteShortcut !== undefined && (typeof value.paletteShortcut !== "string" || value.paletteShortcut.length > 80))) throw new Error("Geri yükleme kurtarma kaydı okunamadı.");
  return value;
}
async function rollback(journal: Journal, storage: Store, native: typeof invoke) {
  if (journal.conversations) await recoverConversationRestore(true);
  if (journal.paletteShortcut !== undefined) await native(journal.paletteRegistered === false ? "restore_unregistered_palette_shortcut" : "set_palette_shortcut", { value: journal.paletteShortcut });
  await native("save_desktop_preferences", { preferences: { closeToTray: journal.desktop.closeToTray, startInTray: journal.desktop.startInTray }, autoStart: journal.desktop.autoStart });
  for (const key of Object.keys(journal.snapshot)) storage.removeItem(key);
  for (const [key, value] of Object.entries(journal.snapshot)) if (value !== null) storage.setItem(key, value);
  storage.removeItem(JOURNAL_KEY);
  signalRestored("rollback");
}
export async function recoverPendingRestore(storage: Store = window.localStorage, native: typeof invoke = invoke): Promise<void> {
  const raw = storage.getItem(JOURNAL_KEY); if (raw !== null) await rollback(parseJournal(raw), storage, native);
  else if (typeof indexedDB !== "undefined") await recoverConversationRestore(false);
}
export async function restoreBackup(input: Backup, confirmed: boolean, previousDesktop: BackupDesktop, storage: Store = window.localStorage, native: typeof invoke = invoke): Promise<void> {
  if (confirmed !== true) throw new Error("Geri yükleme için açık onay gerekli.");
  const backup = parseBackup(JSON.stringify(input));
  if (!validDesktop(previousDesktop) || storage.getItem(JOURNAL_KEY) !== null) throw new Error("Önce bekleyen geri yükleme kurtarılmalı.");
  if (backup.data.conversations) await recoverConversationRestore(false);
  const restoredKeys = [...Object.values(BACKUP_KEYS), ...Object.entries(HUB_BACKUP_KEYS).filter(([name]) => name in backup.data).map(([, key]) => key)];
  const paletteState = backup.data.paletteShortcut !== undefined ? await native<{ shortcut: string; registered: boolean }>("get_palette_shortcut_state") : undefined;
  if (paletteState && (typeof paletteState.shortcut !== "string" || typeof paletteState.registered !== "boolean")) throw new Error("Kısayol kurtarma bilgisi alınamadı. Mevcut veriler değişmedi.");
  const journal: Journal = { formatVersion: 1, snapshot: Object.fromEntries(restoredKeys.map((key) => [key, storage.getItem(key)])), desktop: previousDesktop, ...(backup.data.conversations ? { conversations: true } : {}), ...(backup.data.paletteShortcut !== undefined ? { paletteShortcut: paletteState!.shortcut, paletteRegistered: paletteState!.registered } : {}) };
  try { storage.setItem(JOURNAL_KEY, JSON.stringify(journal)); } catch { throw new Error("Güvenli geri yükleme snapshot'ı oluşturulamadı. Mevcut veriler değişmedi."); }
  signalRestoreActive(true);
  let safeToUnlock = false;
  try {
    if (backup.data.conversations) await beginConversationRestore(backup.data.conversations);
    if (backup.data.paletteShortcut !== undefined) await native("set_palette_shortcut", { value: backup.data.paletteShortcut });
    await native("sync_task_reminders", { reminders: [] });
    await native("save_desktop_preferences", { preferences: { closeToTray: backup.data.desktop.closeToTray, startInTray: backup.data.desktop.startInTray }, autoStart: backup.data.desktop.autoStart });
    for (const [name, key] of Object.entries(BACKUP_KEYS)) storage.setItem(key, name === "aiModel" ? backup.data.aiModel as string : JSON.stringify(backup.data[name as keyof typeof BACKUP_KEYS]));
    for (const [name, key] of Object.entries(HUB_BACKUP_KEYS)) if (name in backup.data) storage.setItem(key, JSON.stringify(backup.data[name as keyof typeof HUB_BACKUP_KEYS]));
    storage.removeItem(JOURNAL_KEY); safeToUnlock = true;
    if (backup.data.conversations) await recoverConversationRestore(false).catch(() => {});
    signalRestored("success");
  } catch {
    try { await rollback(journal, storage, native); safeToUnlock = true; } catch { throw new Error("Geri yükleme kurtarılamadı. Kurtarma kaydı korunuyor; uygulamayı yeniden açın."); }
    throw new Error("Geri yükleme tamamlanamadı. Önceki veriler geri getirildi.");
  } finally { if (safeToUnlock) signalRestoreActive(false); else if (typeof Event !== "undefined") window.dispatchEvent?.(new Event("ack-restore-blocked")); }
}

export async function createFullBackup(desktop: BackupDesktop, appVersion: string): Promise<Backup> { await flushConversationWrites(); const backup = createBackup(desktop, appVersion); backup.formatVersion = 2; backup.data.conversations = await loadConversations(); backup.data.paletteShortcut = await invoke<string>("get_palette_shortcut"); return parseBackup(JSON.stringify(backup)); }
