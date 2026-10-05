import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getDesktopStatus, type DesktopStatus } from "./desktopClient";
export function useDesktop(navigate: (target: string) => void) {
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let active = true; const cleanups: (() => void)[] = [];
    async function init() {
      const subscriptions = [
        listen<boolean>("ack-visibility", (event) => { if (active) setVisible(event.payload); }),
        listen<string>("ack-navigate", (event) => { if (active) { navigate(event.payload); void invoke("desktop_ready").catch(() => {}); } }),
      ];
      await Promise.all(subscriptions.map(async (promise) => { try { const cleanup = await promise; if (active) cleanups.push(cleanup); else cleanup(); } catch { /* Browser preview has no native backend. */ } }));
      try {
        const next = await getDesktopStatus();
        if (active) { setStatus(next); setVisible(next.visible); }
        const pending = await invoke<string | null>("desktop_ready");
        if (active && pending) navigate(pending);
      } catch { if (active) setVisible(true); }
    }
    void init();
    return () => { active = false; cleanups.forEach((cleanup) => cleanup()); };
  }, [navigate]);
  return { status, setStatus, visible };
}
