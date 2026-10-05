import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { executePaletteRequest, type PaletteRequest } from "./paletteActions";
import type { NavigationTarget } from "./navigation";
export function usePaletteBridge(navigate: (target: NavigationTarget) => void) {
  useEffect(() => {
    let active = true, cleanup: (() => void) | undefined, queue = Promise.resolve();
    void listen<PaletteRequest>("ack-palette-request", event => {
      if (!active) return;
      queue = queue.then(async () => {
        if (!active) return;
        try { const result = await executePaletteRequest(event.payload, navigate, true); await invoke("palette_result", { id: event.payload.id, result, error: null }); }
        catch { await invoke("palette_result", { id: event.payload.id, result: null, error: "İşlem tamamlanamadı." }).catch(() => {}); }
      }).catch(() => {});
    }).then(unlisten => { if (active) cleanup = unlisten; else unlisten(); }).catch(() => {});
    return () => { active = false; cleanup?.(); };
  }, [navigate]);
}
