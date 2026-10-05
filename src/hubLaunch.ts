import { invoke } from "@tauri-apps/api/core";
import { openRegisteredProject as launchProject } from "./commandPalette";
import { loadWorkspaces, saveWorkspaces, loadShortcuts, saveShortcuts } from "./workHubStore";
import { recordRecent } from "./recentStore";
import { loadFiles } from "./fileStore";
export { launchProject };
export async function launchShortcut(id: string, native = invoke): Promise<void> {
  const loaded = loadShortcuts(), item = loaded.entries.find(v => v.id === id);
  if (loaded.locked || !item) throw new Error("Kayıtlı kısayol bulunamadı.");
  if (item.legacy) { const files = loadFiles(), original = files.entries.find(v => v.id === id); if (files.error || !original || original.path !== item.target || original.kind !== item.type) throw new Error("Eski dosya kısayolunun referansı doğrulanamadı."); }
  if (item.legacy && item.type === "file" && /\.(?:exe|bat|cmd|ps1|vbs|js|lnk|url|hta|com|msi)$/i.test(item.target)) throw new Error("Bu eski kayıt çalıştırılabilir dosya içeriyor. Uygulamayı native seçiciden uygulama kısayolu olarak yeniden ekleyin.");
  if (item.legacy) await native("access_file_entry", { path: item.target, kind: item.type, action: "open" });
  else await native("open_saved_target", { id: item.savedId });
  const current = loadShortcuts(); if (!current.locked) saveShortcuts(current.entries.map(v => v.id === id ? { ...v, lastUsedAt: Date.now(), useCount: v.useCount + 1 } : v));
  recordRecent("shortcuts", id);
}
export async function revealShortcut(id: string, native = invoke): Promise<void> {
  const loaded = loadShortcuts(), item = loaded.entries.find(v => v.id === id);
  if (loaded.locked || !item || !["file", "folder"].includes(item.type)) throw new Error("Kayıtlı dosya veya klasör bulunamadı.");
  if (item.legacy) await native("access_file_entry", { path: item.target, kind: item.type, action: "reveal" });
  else await native("reveal_saved_target", { id: item.savedId });
}
export async function launchWorkspace(id: string, native = invoke, beforeItem?: () => void): Promise<{ opened: number; errors: string[] }> {
  const loaded = loadWorkspaces(), workspace = loaded.entries.find(v => v.id === id);
  if (loaded.locked || !workspace) throw new Error("Kayıtlı çalışma alanı bulunamadı.");
  const errors: string[] = []; let opened = 0;
  for (const item of workspace.items) { try { beforeItem?.(); if (item.type === "project") await launchProject(item.projectId, item.mode, native); else await native("open_saved_target", { id: item.saved.id }); opened++; } catch { errors.push(item.name + " açılamadı."); } }
  const current = loadWorkspaces(); if (!current.locked) saveWorkspaces(current.entries.map(v => v.id === id ? { ...v, lastUsedAt: Date.now(), useCount: v.useCount + 1 } : v));
  recordRecent("workspaces", id); return { opened, errors };
}
