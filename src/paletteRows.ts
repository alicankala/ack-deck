import { parseSmartCapture } from "../shared/smartCapture";
import { paletteCommands } from "./commandPalette";
import { searchLocal, SEARCH_LABELS } from "./localSearch";
import { resolveRecents } from "./recentStore";
import { loadUsage, rankMatch, usageFor, type UsageSource } from "./usageStore";
import { loadProjectSnapshot } from "./projectStore";
import { loadWorkspaces, loadShortcuts } from "./workHubStore";
import { loadNotes } from "./notesStore";
import { loadArchive } from "./archiveStore";
import type { PaletteRequest } from "./paletteActions";
import type { NavigationTarget } from "./navigation";
export type PaletteRow = { id: string; title: string; detail: string; kind: string; group: string; request?: Omit<PaletteRequest, "id">; capture?: "task" | "note"; source?: UsageSource; recordId?: string; score: number };
function recordRow(source: UsageSource | "tasks", id: string, title: string, detail: string, target: NavigationTarget): PaletteRow {
  const nativeSource: UsageSource | undefined = source === "tasks" ? undefined : source === "files" ? "shortcuts" : source;
  return { id: source + ":" + id, title, detail, kind: SEARCH_LABELS[source], group: "Kayıtlar", source: source === "tasks" ? undefined : nativeSource, recordId: id, score: 0, request: source === "workspaces" ? { kind: "workspace", value: id } : nativeSource === "shortcuts" ? { kind: "shortcut", value: id } : source === "projects" ? { kind: "project", value: id, mode: "folder" } : { kind: "navigate", value: JSON.stringify(target) } };
}
export function paletteRows(query: string): { rows: PaletteRow[]; warnings: string[] } {
  const records = searchLocal(query), commands = paletteCommands(query).map((command): PaletteRow => ({ id: "command:" + command.id, title: command.label, kind: "Komut", detail: "ACKDeck", group: "Komutlar", score: rankMatch(query, command.label, "", { pinned: false, lastUsedAt: 0, useCount: 0 }), ...(command.id === "new-task" ? { capture: "task" as const } : command.id === "new-note" ? { capture: "note" as const } : { request: command.projectId ? { kind: "project" as const, value: command.projectId, mode: command.mode } : { kind: "navigate" as const, value: JSON.stringify(command.target) } }) }));
  if (query.trim()) {
    const rows = records.results.map(r => ({ ...recordRow(r.source, r.id, r.title, r.detail, { page: r.page, id: r.id }), score: rankMatch(query, r.title, r.detail, usageFor(r.source === "files" ? "shortcuts" : r.source, r.id)) }));
    const capture = parseSmartCapture(query, loadProjectSnapshot().entries);
    const smart:PaletteRow[] = capture ? [{id:"smart-capture",title:"Taslağı gözden geçir",detail:capture.kind==="task"?`${capture.text} · ${capture.dueDate??"Tarihsiz"} ${capture.dueTime??""}`:capture.title,kind:"Akıllı yakalama",group:"Hızlı ekle",score:100000,request:{kind:"ai",value:query.trim()}}] : [];
    const ranked = [...smart, ...rows, ...commands].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "tr")).slice(0, 29);
    if (!ranked.length || ranked[0].score < 1000) ranked.push({ id: "ask-ai", title: "ACK AI\'a sor", detail: query.trim(), kind: "Yapay Zeka", group: "ACK AI", score: 0, request: { kind: "ai", value: query.trim() } });
    return { rows: ranked, warnings: records.warnings };
  }
  const sources = { projects: loadProjectSnapshot().entries, workspaces: loadWorkspaces().entries, shortcuts: loadShortcuts().entries, notes: loadNotes().notes, archive: loadArchive().entries };
  const pinned: PaletteRow[] = [];
  for (const usage of loadUsage().entries.filter(v => v.pinned)) {
    const source = usage.source === "files" ? "shortcuts" : usage.source;
    const record = sources[source].find(v => v.id === usage.id); if (!record) continue;
    const title = "name" in record ? record.name : record.title;
    pinned.push({ ...recordRow(source, record.id, title, "Sabitlenen kayıt", { page: source === "shortcuts" ? "files" : source, id: record.id }), group: "Sabitlenenler", score: rankMatch("", title, "", usage) });
  }
  const recent = resolveRecents(8).filter(v => !pinned.some(p => p.recordId === v.id && p.source === (v.source === "files" ? "shortcuts" : v.source))).map(v => ({ ...recordRow(v.source, v.id, v.title, v.label, v.target), group: "Son Kullanılanlar", score: 0 }));
  return { rows: [...pinned.sort((a, b) => b.score - a.score).slice(0, 5), ...recent.slice(0, 5), ...commands.filter(v => ["command:new-task", "command:new-note", "command:ai", "command:workspaces", "command:projects", "command:files"].includes(v.id))], warnings: loadUsage().locked ? ["Kullanım bilgileri okunamadı. Kayıtlar korunuyor."] : [] };
}
