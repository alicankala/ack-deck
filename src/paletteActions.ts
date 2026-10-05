import { invoke } from "@tauri-apps/api/core";
import { launchProject, launchShortcut, launchWorkspace } from "./hubLaunch";
import { quickCapture } from "./quickCapture";
import { updateUsage, usageFor, type UsageSource } from "./usageStore";
import type { NavigationTarget } from "./navigation";
export type PaletteRequest = { id: string; kind: "ai" | "task" | "note" | "workspace" | "shortcut" | "project" | "navigate" | "pin"; value: string; mode?: string | null };
export const HUB_PAGES = ["home", "ai", "tasks", "projects", "workspaces", "files", "notes", "archive", "tools", "qr", "ip", "speed", "pc", "settings", "inbox", "subscriptions"] as const;
export function navigationFromJson(value: string): NavigationTarget {
  const target = JSON.parse(value) as NavigationTarget;
  if (!target || typeof target !== "object" || !HUB_PAGES.includes(target.page) || Object.keys(target).some(v => !["page", "id", "intent"].includes(v)) || (target.id !== undefined && (typeof target.id !== "string" || target.id.length > 512)) || (target.intent !== undefined && !["new-task", "new-note", "new-archive", "start-speed"].includes(target.intent))) throw new Error("Sayfa bilgisi geçersiz.");
  // Palette navigation cannot authorize a network measurement implicitly.
  if (target.intent === "start-speed") throw new Error("Hız testi kendi sayfasındaki düğmeyle başlatılır.");
  return target;
}
export async function executePaletteRequest(request: PaletteRequest, navigate: (target: NavigationTarget) => void, showMain = false): Promise<string> {
  if (window.localStorage.getItem("ack-deck.restore-journal.v1") !== null) throw new Error("Geri yükleme sırasında işlem yapılamaz.");
  if (!request || !request.id || typeof request.value !== "string") throw new Error("Palet işlemi geçersiz.");
  switch (request.kind) {
    case "ai": { if (!request.value.trim() || request.value.length > 200) throw new Error("Soru geçersiz."); window.dispatchEvent(new CustomEvent("ack-ai-question", { detail: request.value.trim() })); if (showMain) await invoke("show_main_window"); return "ACK AI açıldı."; }
    case "task": case "note": return quickCapture(request.kind, request.value, request.id);
    case "workspace": { const result = await launchWorkspace(request.value); return result.errors.length ? result.errors.join(" ") : result.opened ? "Çalışma alanı açıldı." : "Çalışma alanında açılacak öğe yok."; }
    case "shortcut": await launchShortcut(request.value); return "Kısayol açıldı.";
    case "project": if (request.mode !== "folder" && request.mode !== "vscode") throw new Error("Proje işlemi geçersiz."); await launchProject(request.value, request.mode); return "Proje açıldı.";
    case "navigate": { const target = navigationFromJson(request.value); navigate(target); if (showMain) await invoke("show_main_window"); return "Sayfa açıldı."; }
    case "pin": { if (!["projects", "notes", "archive", "files", "workspaces", "shortcuts"].includes(request.mode ?? "")) throw new Error("Sabitleme türü geçersiz."); if (!updateUsage(request.mode as UsageSource, request.value, !usageFor(request.mode!, request.value).pinned)) throw new Error("Sabitleme kaydedilemedi."); return "Sabitleme güncellendi."; }
    default: throw new Error("Palet işlemi desteklenmiyor.");
  }
}
