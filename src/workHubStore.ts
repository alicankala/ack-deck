import { captureDeleted } from "./trashStore";
import { invoke } from "@tauri-apps/api/core";
import { loadFiles } from "./fileStore";
export type SavedTarget = { id: string; kind: "file" | "folder" | "url" | "application"; target: string; name: string };
export type WorkspaceItem = { id: string; name: string; type: "project"; projectId: string; mode: "folder" | "vscode" } | { id: string; name: string; type: "target"; saved: SavedTarget };
export type Workspace = { id: string; name: string; description: string; icon: string; createdAt: number; lastUsedAt: number; useCount: number; pinned: boolean; items: WorkspaceItem[] };
export type Shortcut = { id: string; name: string; description: string; type: SavedTarget["kind"]; target: string; savedId?: string; legacy?: boolean; pinned: boolean; lastUsedAt: number; useCount: number };
export const WORKSPACE_KEY = "ack-deck.workspaces.v1", SHORTCUT_KEY = "ack-deck.shortcuts.v1";
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 4096): v is string => typeof v === "string" && v.length <= max;
const number = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 8.64e15;
const fields = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(key => allowed.includes(key));
export function validWebUrl(value: string): boolean { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !!url.hostname && !url.username && !url.password && value.length <= 4096; } catch { return false; } }
export const isSavedTarget = (v: unknown): v is SavedTarget => object(v) && fields(v, ["id", "kind", "target", "name"]) && text(v.id, 512) && !!v.id && ["file", "folder", "url", "application"].includes(String(v.kind)) && text(v.target) && !!v.target && text(v.name) && (v.kind !== "url" || validWebUrl(v.target));
export const isWorkspaceItem = (v: unknown): v is WorkspaceItem => object(v) && fields(v, v.type === "project" ? ["id", "name", "type", "projectId", "mode"] : ["id", "name", "type", "saved"]) && text(v.id, 512) && !!v.id && text(v.name, 160) && !!v.name.trim() && (v.type === "project" ? text(v.projectId, 512) && !!v.projectId && ["folder", "vscode"].includes(String(v.mode)) : v.type === "target" && isSavedTarget(v.saved));
const usageFields = (v: Record<string, unknown>) => typeof v.pinned === "boolean" && number(v.lastUsedAt) && number(v.useCount);
export const isWorkspace = (v: unknown): v is Workspace => object(v) && fields(v, ["id", "name", "description", "icon", "createdAt", "lastUsedAt", "useCount", "pinned", "items"]) && text(v.id, 512) && !!v.id && text(v.name, 160) && !!v.name.trim() && text(v.description, 2000) && text(v.icon, 16) && number(v.createdAt) && usageFields(v) && Array.isArray(v.items) && v.items.length <= 30 && v.items.every(isWorkspaceItem) && new Set(v.items.map(i => i.id)).size === v.items.length;
export const isShortcut = (v: unknown): v is Shortcut => object(v) && fields(v, ["id", "name", "description", "type", "target", "savedId", "legacy", "pinned", "lastUsedAt", "useCount"]) && text(v.id, 512) && !!v.id && text(v.name, 160) && !!v.name.trim() && text(v.description, 2000) && ["file", "folder", "url", "application"].includes(String(v.type)) && text(v.target) && !!v.target && usageFields(v) && (v.type !== "url" || validWebUrl(v.target)) && (v.legacy === true ? ["file", "folder"].includes(String(v.type)) && v.savedId === undefined : text(v.savedId, 512) && !!v.savedId);
export type HubSnapshot<T> = { entries: T[]; locked: boolean; error: string | null };
function read<T extends { id: string }>(key: string, valid: (v: unknown) => v is T): HubSnapshot<T> { try { const raw = window.localStorage.getItem(key); if (raw === null) return { entries: [], locked: false, error: null }; const value: unknown = JSON.parse(raw); if (!Array.isArray(value) || !value.every(valid) || new Set(value.map(v => v.id)).size !== value.length) throw new Error(); return { entries: value, locked: false, error: null }; } catch { return { entries: [], locked: true, error: "Kayıtlar okunamadı. Mevcut veriler korunuyor; kaydetme kapatıldı." }; } }
function write<T extends { id: string }>(key: string, entries: T[], valid: (v: unknown) => v is T): boolean { if (read(key, valid).locked || !entries.every(valid) || new Set(entries.map(v => v.id)).size !== entries.length) return false; try { if (key === WORKSPACE_KEY && !captureDeleted("workspaces", read(WORKSPACE_KEY, isWorkspace).entries, entries)) return false; window.localStorage.setItem(key, JSON.stringify(entries)); changed(); return true; } catch { return false; } }
export function changed() { if (typeof Event !== "undefined") window.dispatchEvent?.(new Event("ack-data-changed")); }
export const loadWorkspaces = () => read(WORKSPACE_KEY, isWorkspace);
export const saveWorkspaces = (entries: Workspace[]) => write(WORKSPACE_KEY, entries, isWorkspace);
export type ShortcutData = { entries: Shortcut[]; hiddenLegacyIds: string[] };
export function isShortcutData(value: unknown): value is ShortcutData | Shortcut[] {
  if (Array.isArray(value)) return value.every(isShortcut) && new Set(value.map(v => v.id)).size === value.length;
  return object(value) && Object.keys(value).every(v => ["entries", "hiddenLegacyIds"].includes(v)) && Array.isArray(value.entries) && value.entries.every(isShortcut) && new Set(value.entries.map(v => v.id)).size === value.entries.length && Array.isArray(value.hiddenLegacyIds) && value.hiddenLegacyIds.every(v => text(v, 512) && !!v);
}
function readShortcutData(): ShortcutData | null {
  try { const raw = window.localStorage.getItem(SHORTCUT_KEY), value: unknown = raw ? JSON.parse(raw) : []; if (!isShortcutData(value)) return null; return Array.isArray(value) ? { entries: value, hiddenLegacyIds: [] } : value; } catch { return null; }
}
export function loadShortcuts(): HubSnapshot<Shortcut> {
  const state = readShortcutData(); if (!state) return { entries: [], locked: true, error: "Kısayollar okunamadı. Mevcut veriler korunuyor." };
  const loaded: HubSnapshot<Shortcut> = { entries: state.entries, locked: false, error: null };
  // Merge legacy references without deleting or rewriting the original Files key.
  const old = loadFiles(); if (old.error) return { ...loaded, locked: true, error: old.error };
  const oldRemoved = readRemoved(); if (oldRemoved === null) return { ...loaded, locked: true, error: "Eski kısayol tercihleri okunamadı. Veriler korunuyor." };
  const removed = [...state.hiddenLegacyIds, ...oldRemoved];
  const legacy = old.entries.filter(file => !loaded.entries.some(v => v.id === file.id) && !removed.includes(file.id)).map(file => ({ id: file.id, name: file.name, description: "", type: file.kind, target: file.path, legacy: true as const, pinned: false, lastUsedAt: 0, useCount: 0 }));
  return { ...loaded, entries: [...loaded.entries, ...legacy] };
}
const REMOVED_KEY = "ack-deck.shortcuts-legacy-hidden.v1";
function readRemoved(): string[] | null { try { const raw = window.localStorage.getItem(REMOVED_KEY); const v: unknown = raw ? JSON.parse(raw) : []; return Array.isArray(v) && v.every(i => typeof i === "string") ? v : null; } catch { return null; } }
function writeShortcutData(entries: Shortcut[], hiddenLegacyIds: string[]): boolean {
  if (loadShortcuts().locked || !isShortcutData({ entries, hiddenLegacyIds })) return false;
  try { if (!captureDeleted("shortcuts", loadShortcuts().entries, entries)) return false; window.localStorage.setItem(SHORTCUT_KEY, JSON.stringify({ entries, hiddenLegacyIds })); changed(); return true; } catch { return false; }
}
export function saveShortcuts(entries: Shortcut[]): boolean { const state = readShortcutData(); if (!state) return false; return writeShortcutData(entries, state.hiddenLegacyIds); }
export function removeShortcut(id: string): boolean {
  const loaded = loadShortcuts(); if (loaded.locked) return false;
  const state = readShortcutData(); if (!state) return false;
  // One atomic localStorage write covers records and legacy exclusions; failed saves change neither.
  return writeShortcutData(loaded.entries.filter(v => v.id !== id), [...new Set([...state.hiddenLegacyIds, id])]);
}
export const pickTarget = (kind: SavedTarget["kind"]) => invoke<SavedTarget | null>("choose_launch_target", { kind });
export async function saveUrl(url: string) { if (!validWebUrl(url)) throw new Error("Geçerli bir http veya https adresi girin."); return invoke<SavedTarget>("save_url_target", { url }); }
