import { loadTasks, type Task } from "./taskStore";
import { loadProjectSnapshot, type Project } from "./projectStore";
import { loadNotes, type Note } from "./notesStore";
import { type FileEntry } from "./fileStore";
import { loadArchive, type ArchiveEntry } from "./archiveStore";
import type { Page } from "./components/Sidebar";
import { loadWorkspaces, loadShortcuts, type Workspace, type Shortcut } from "./workHubStore";
import { rankMatch, usageFor } from "./usageStore";
export type SearchSource = "tasks" | "projects" | "notes" | "files" | "archive" | "workspaces" | "shortcuts";
export type SearchResult = { source: SearchSource; id: string; title: string; detail: string; page: Page; record: Task | Project | Note | FileEntry | ArchiveEntry | Workspace | Shortcut };
export const SEARCH_LABELS: Record<SearchSource, string> = { tasks: "Görev", projects: "Proje", notes: "Not", files: "Kısayol", archive: "Arşiv", workspaces: "Çalışma Alanı", shortcuts: "Kısayol" };
export const normalizeSearch = (value: string) => value.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/ı/g, "i");
export function searchLocal(query: string, sources: SearchSource[] = ["tasks", "projects", "notes", "files", "archive", "workspaces", "shortcuts"], limit = 40): { results: SearchResult[]; warnings: string[] } {
  const terms = normalizeSearch(query.trim().slice(0, 200)).split(/\s+/).filter(Boolean);
  if (!terms.length) return { results: [], warnings: [] };
  const results: SearchResult[] = [], warnings: string[] = [];
  function add(source: SearchSource, page: Page, records: SearchResult["record"][], fields: (record: SearchResult["record"]) => [string, string]) {
    for (const record of records) {
      const [title, detail] = fields(record), text = normalizeSearch(title + " " + detail);
      if (terms.every((term) => text.includes(term))) results.push({ source, page, id: record.id, title, detail: detail.slice(0, 240), record });
    }
  }
  for (const source of [...new Set(sources)]) {
    try {
      switch (source) {
        case "workspaces": { const value = loadWorkspaces(); if (value.locked) throw new Error(); add(source, "workspaces", value.entries, record => { const item = record as Workspace; return [item.name, item.description + " " + item.items.map(v => v.name).join(" ")]; }); break; }
        case "shortcuts": { const value = loadShortcuts(); if (value.locked) throw new Error(); add(source, "files", value.entries.filter(v => !v.legacy || !sources.includes("files")), record => { const item = record as Shortcut; return [item.name, item.description + " " + item.target]; }); break; }
        case "tasks": { const value = loadTasks(); if (value.locked) throw new Error(); add(source, "tasks", value.entries, (record) => { const task = record as Task; return [task.text, [task.dueDate, task.dueTime, task.priority === "important" ? "Önemli" : "Normal"].filter(Boolean).join(" · ")]; }); break; }
        case "projects": { const value = loadProjectSnapshot(); if (value.locked) throw new Error(); add(source, "projects", value.entries, (record) => { const item = record as Project; return [item.name, item.description + " " + item.folderPath]; }); break; }
        case "notes": { const value = loadNotes(); if (value.error) throw new Error(); add(source, "notes", value.notes, (record) => { const item = record as Note; return [item.title, item.content]; }); break; }
        case "files": { const value = loadShortcuts(); if (value.locked) throw new Error(); add(source, "files", value.entries.filter(v => v.legacy), (record) => { const item = record as Shortcut; return [item.name, item.description + " " + item.target]; }); break; }
        case "archive": { const value = loadArchive(); if (value.locked) throw new Error(); add(source, "archive", value.entries, (record) => { const item = record as ArchiveEntry; return [item.title, item.description + " " + item.tags.join(" ") + " " + item.category + " " + (item.file?.path ?? "")]; }); break; }
      }
    } catch { warnings.push(SEARCH_LABELS[source] + " kayıtları şu anda okunamadı."); }
  }
  return { results: results.sort((a, b) => rankMatch(query, b.title, b.detail, usageFor(b.source, b.id)) - rankMatch(query, a.title, a.detail, usageFor(a.source, a.id)) || a.title.localeCompare(b.title, "tr") || a.id.localeCompare(b.id)).slice(0, Math.max(1, Math.min(100, limit))), warnings };
}
