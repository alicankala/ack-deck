import { recordChanges } from "./activityStore";
import { validReference } from "../shared/productivity";
export type Project = { id: string; name: string; description: string; folderPath: string; nextStep?: string; workspaceId?: string | null; inboxIds?: string[]; shortcutIds?: string[]; fileIds?: string[] };
export function isProject(v: unknown): v is Project { if (!v || typeof v !== "object") return false; const p = v as Project; return typeof p.id === "string" && !!p.id && [p.name, p.description, p.folderPath].every(v => typeof v === "string") && (p.nextStep === undefined || typeof p.nextStep === "string" && p.nextStep.length <= 500) && (p.workspaceId == null || validReference(p.workspaceId)) && [p.inboxIds, p.shortcutIds, p.fileIds].every(v => v === undefined || Array.isArray(v) && v.length <= 200 && v.every(validReference) && new Set(v).size === v.length); }

const STORAGE_KEY = "ack-deck.projects.v1";
export type ProjectLoad = { entries: Project[]; preserved: unknown[]; locked: boolean; warning: string | null };

export function loadProjectSnapshot(): ProjectLoad {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === null) return { entries: [], preserved: [], locked: false, warning: null };
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) throw new Error("invalid projects");
    const entries: Project[] = []; const preserved: unknown[] = []; const ids = new Set<string>();
    for (const item of parsed) {
      if (isProject(item) && !ids.has(item.id)) { entries.push(item); ids.add(item.id); }
      else preserved.push(item);
    }
    return { entries, preserved, locked: false, warning: preserved.length ? "Bazı projeler okunamadı. Diğer kayıtlar korunuyor." : null };
  } catch { /* Bozuk veya erişilemeyen depolama uygulamayı durdurmaz. */ }
  return { entries: [], preserved: [], locked: true, warning: "Projeler okunamadı. Mevcut kayıtlar korunuyor." };
}
export function loadProjects(): Project[] { return loadProjectSnapshot().entries; }

export function saveProjects(projects: Project[], loaded: ProjectLoad = loadProjectSnapshot()): boolean {
  if (loaded.locked || !projects.every(isProject) || new Set(projects.map(p => p.id)).size !== projects.length) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...projects, ...loaded.preserved]));
    recordChanges("projects", loaded.entries, projects);
    if (typeof Event !== "undefined") window.dispatchEvent?.(new Event("ack-data-changed"));
    return true;
  } catch {
    return false;
  }
}
