import { invoke, isTauri } from "@tauri-apps/api/core";
import { createFullBackup } from "./backupStore";
import { getDesktopStatus } from "./desktopClient";

type Status = { phase: "idle" | "checking" | "ready" | "installing" | "error"; version?: string; message?: string };
let status: Status = { phase: "idle" };
let started = false;
const listeners = new Set<() => void>();
export const updateSnapshot = () => status;
export function subscribeUpdates(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function publish(value: Status) { status = value; listeners.forEach(listener => listener()); }
export async function checkUpdates() {
  if (!isTauri()) { publish({ phase: "idle", message: "Güncelleme kontrolü kurulu Windows uygulamasında kullanılabilir." }); return; }
  if (status.phase === "checking" || status.phase === "installing" || status.phase === "ready") return;
  publish({ phase: "checking" });
  try {
    const version = await invoke<string | null>("check_update");
    publish(version ? { phase: "ready", version } : { phase: "idle", message: "Yeni güncelleme bulunamadı." });
  } catch { publish({ phase: "error", message: "GitHub güncellemesi denetlenemedi veya indirilemedi." }); }
}
export function startUpdates() { if (!started) { started = true; void checkUpdates(); } }
export async function installUpdate() {
  if (status.phase !== "ready" || window.localStorage.getItem("ack-deck.restore-journal.v1")) return;
  const version = status.version;
  publish({ phase: "installing", version });
  window.dispatchEvent(new CustomEvent("ack-restore-active", { detail: true }));
  try {
    const desktop = await getDesktopStatus();
    const backup = await createFullBackup({ ...desktop.preferences, autoStart: desktop.autoStart }, desktop.version);
    await invoke("install_update", { content: JSON.stringify(backup, null, 2) });
  } catch {
    publish({ phase: "ready", version, message: "Yedekleme veya kurulum tamamlanamadı. Güncelleme kurulmadı; tekrar deneyebilirsiniz." });
  } finally { window.dispatchEvent(new CustomEvent("ack-restore-active", { detail: false })); }
}
