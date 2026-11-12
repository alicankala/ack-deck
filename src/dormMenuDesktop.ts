import { invoke, isTauri } from "@tauri-apps/api/core";
import { registerNativeDormFetcher } from "../shared/dormMenu";

let registered = false;

export function ensureDesktopDormFetcher(): void {
  if (registered) return;
  if (isTauri()) {
    registerNativeDormFetcher(() => invoke<string>("fetch_dorm_menu"));
    registered = true;
  }
}
