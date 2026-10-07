import { invoke } from "@tauri-apps/api/core";
import { loadProjectSnapshot } from "./projectStore";
import { normalizeSearch } from "./localSearch";
import type { NavigationTarget } from "./navigation";
import { recordRecent } from "./recentStore";
export type PaletteCommand = { id: string; label: string; target?: NavigationTarget; projectId?: string; mode?: "folder" | "vscode" };
const commands: PaletteCommand[] = [
  { id: "calendar", label: "Haftalık Plan", target: { page: "calendar" } },
  { id: "subscriptions", label: "Abonelikler", target: { page: "subscriptions" } },
  { id: "home", label: "Ana Sayfa", target: { page: "home" } }, { id: "ai", label: "ACK AI", target: { page: "ai" } },
  { id: "new-task", label: "Yeni Görev", target: { page: "tasks", intent: "new-task" } }, { id: "tasks", label: "Görevler", target: { page: "tasks" } },
  { id: "new-note", label: "Yeni Not", target: { page: "notes", intent: "new-note" } }, { id: "new-archive", label: "Yeni Arşiv Kaydı", target: { page: "archive", intent: "new-archive" } },
  { id: "projects", label: "Projeler", target: { page: "projects" } }, { id: "files", label: "Kısayollar", target: { page: "files" } },
  { id: "workspaces", label: "Çalışma Alanları", target: { page: "workspaces" } },
  { id: "qr", label: "QR Oluştur", target: { page: "qr" } }, { id: "ip", label: "IP Bilgisi", target: { page: "ip" } },
  { id: "speed", label: "Hız Testi", target: { page: "speed" } }, { id: "notes", label: "Notlar", target: { page: "notes" } },
  { id: "archive", label: "Arşiv", target: { page: "archive" } }, { id: "settings", label: "Ayarlar", target: { page: "settings" } },
  { id: "pc", label: "PC Durumu", target: { page: "pc" } },
];
export function paletteCommands(query: string): PaletteCommand[] {
  const projects = loadProjectSnapshot();
  const dynamic = projects.locked ? [] : projects.entries.filter((project) => !!project.folderPath).flatMap((project): PaletteCommand[] => [
    { id: "project-folder-" + project.id, label: project.name + " · Explorer'da Aç", projectId: project.id, mode: "folder" },
    { id: "project-code-" + project.id, label: project.name + " · VS Code'da Aç", projectId: project.id, mode: "vscode" },
  ]);
  const terms = normalizeSearch(query.trim()).split(/\s+/).filter(Boolean);
  return [...commands, ...dynamic].filter((command) => terms.every((term) => normalizeSearch(command.label).includes(term))).slice(0, 40);
}
export function moveSelection(current: number, delta: number, count: number): number { return count ? ((current + delta) % count + count) % count : 0; }
export async function openRegisteredProject(projectId: string, mode: "folder" | "vscode", native = invoke): Promise<void> {
  if (typeof projectId !== "string" || (mode !== "folder" && mode !== "vscode")) throw new Error("Proje işlemi geçersiz.");
  const loaded = loadProjectSnapshot(), project = loaded.entries.find((item) => item.id === projectId);
  if (loaded.locked || !project?.folderPath) throw new Error("Kayıtlı proje klasörü bulunamadı.");
  try { await native(mode === "vscode" ? "open_project_in_vscode" : "open_project_folder", { path: project.folderPath }); recordRecent("projects", projectId, mode); }
  catch { throw new Error("Proje açılamadı. Klasörü veya VS Code kurulumunu kontrol edin."); }
}
