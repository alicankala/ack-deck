import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { availableMonitors, currentMonitor, getCurrentWindow, monitorFromPoint } from "@tauri-apps/api/window";
import { displayScaleFor, monitorKey, readDisplayPreferences, saveMonitorScale, type DisplayPreferences, type DisplayScale } from "./displayScaleStore";
import { observeMonitor } from "./monitorObserver";

type DisplayState = { key: string | null; label: string; scale: DisplayScale; change: (scale: DisplayScale | null) => boolean };
const DisplayContext = createContext<DisplayState>({ key: null, label: "Ekran bilgisi alınamadı", scale: 100, change: () => false });
export function useDisplayScale() { return useContext(DisplayContext); }
export function DisplayScaleProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<DisplayPreferences>(() => { try { return readDisplayPreferences(); } catch { return { defaultScale: 100, monitors: {} }; } });
  const [display, setDisplay] = useState({ key: null as string | null, label: "Ekran bilgisi alınıyor…" });
  const scale = displayScaleFor(preferences, display.key);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--ui-scale", String(scale / 100));
    root.dataset.uiScale = String(scale);
    return () => { root.style.removeProperty("--ui-scale"); delete root.dataset.uiScale; };
  }, [scale]);
  useEffect(() => {
    let win: ReturnType<typeof getCurrentWindow>;
    try { win = getCurrentWindow(); }
    catch { setDisplay({ key: null, label: "Ekran bilgisi alınamadı" }); return; }
    let active = true;
    let lastKey: string | null = null;
    const stop = observeMonitor({
      read: async () => {
        try {
          const [position, size] = await Promise.all([win.outerPosition(), win.outerSize()]);
          return await monitorFromPoint(position.x + size.width / 2, position.y + size.height / 2) ?? await currentMonitor();
        } catch { return currentMonitor(); }
      },
      subscribe: changed => [win.onMoved(changed), win.onResized(changed), win.onScaleChanged(changed)],
    }, monitor => {
      if (!monitor) { lastKey = null; setDisplay(old => old.key === null && old.label === "Ekran bilgisi alınamadı" ? old : { key: null, label: "Ekran bilgisi alınamadı" }); return; }
      const key = monitorKey(monitor);
      if (lastKey === key) return;
      lastKey = key;
      setDisplay(old => old.key === key ? old : { key, label: "Geçerli ekran" });
      void availableMonitors().then(monitors => {
        if (!active) return;
        const index = monitors.findIndex(item => monitorKey(item) === key);
        const label = index >= 0 ? `Ekran ${index + 1}` : "Geçerli ekran";
        setDisplay(old => old.key === key && old.label !== label ? { key, label } : old);
      }).catch(() => {});
    });
    return () => { active = false; stop(); };
  }, []);
  function change(value: DisplayScale | null) {
    if (!display.key) return false;
    try { setPreferences(saveMonitorScale(display.key, value)); return true; } catch { return false; }
  }
  return <DisplayContext.Provider value={{ ...display, scale, change }}>{children}</DisplayContext.Provider>;
}
