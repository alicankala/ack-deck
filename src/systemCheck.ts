import { invoke } from "@tauri-apps/api/core";
import { getGeminiKeyStatus } from "./geminiClient";
export type Health = { backendReady: boolean; fileOpsReady: boolean; internetConnected: boolean };
export type CheckRow = { label: string; status: "Hazır" | "Ayarlanmamış" | "Sorun" };
export function storageAvailable(storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = window.localStorage): boolean {
  const key = "ack-deck.storage-probe." + crypto.randomUUID();
  try { storage.setItem(key, "ok"); const valid = storage.getItem(key) === "ok"; storage.removeItem(key); return valid && storage.getItem(key) === null; }
  catch { try { storage.removeItem(key); } catch {} return false; }
}
export async function runSystemCheck(): Promise<CheckRow[]> {
  const [key, health, palette] = await Promise.allSettled([getGeminiKeyStatus(), invoke<Health>("system_health"), invoke<boolean>("palette_status")]);
  const ready = (value: boolean | undefined): CheckRow["status"] => value ? "Hazır" : "Sorun";
  return [
    { label: "Gemini API anahtarı", status: key.status === "fulfilled" ? key.value ? "Hazır" : "Ayarlanmamış" : "Sorun" },
    { label: "Credential Manager erişimi", status: key.status === "fulfilled" ? "Hazır" : "Sorun" },
    { label: "Windows ağ bağlantısı", status: ready(health.status === "fulfilled" && health.value.internetConnected) },
    { label: "Yerel depolama", status: ready(storageAvailable()) },
    { label: "Native Tauri backend", status: ready(health.status === "fulfilled" && health.value.backendReady) },
    { label: "Dosya / proje altyapısı", status: ready(health.status === "fulfilled" && health.value.fileOpsReady) },
    { label: "Global Hızlı Erişim · Ctrl+Alt+Space", status: ready(palette.status === "fulfilled" && palette.value === true) },
  ];
}
