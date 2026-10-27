import { useState, useEffect } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const inTauri = isTauri();

  useEffect(() => {
    if (!inTauri) return;
    let unlisten: (() => void) | undefined;
    try {
      const win = getCurrentWindow();
      win.isMaximized().then(setIsMaximized).catch(() => {});
      win.onResized(() => {
        win.isMaximized().then(setIsMaximized).catch(() => {});
      }).then((u) => { unlisten = u; }).catch(() => {});
    } catch {}
    return () => {
      if (unlisten) unlisten();
    };
  }, [inTauri]);

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!inTauri) return;
    try {
      await invoke("window_minimize");
    } catch {
      try {
        await getCurrentWindow().minimize();
      } catch {}
    }
  };

  const handleToggleMaximize = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!inTauri) return;
    try {
      const max = await invoke<boolean>("window_toggle_maximize");
      setIsMaximized(max);
    } catch {
      try {
        const win = getCurrentWindow();
        await win.toggleMaximize();
        setIsMaximized(await win.isMaximized());
      } catch {}
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!inTauri) return;
    try {
      await invoke("window_close");
    } catch {
      try {
        await getCurrentWindow().close();
      } catch {}
    }
  };

  if (!inTauri) return null;

  return (
    <header className="desktop-window-bar" aria-label="Pencere Çubuğu">
      <div
        className="window-drag-region"
        data-tauri-drag-region="deep"
        title="Pencereyi taşımak için basılı tutup sürükleyin"
      >
        <div className="window-drag-pill" aria-hidden="true">
          <svg className="window-drag-dots" width="12" height="6" viewBox="0 0 12 6" fill="currentColor">
            <circle cx="2" cy="1.5" r="1.1" />
            <circle cx="6" cy="1.5" r="1.1" />
            <circle cx="10" cy="1.5" r="1.1" />
            <circle cx="2" cy="4.5" r="1.1" />
            <circle cx="6" cy="4.5" r="1.1" />
            <circle cx="10" cy="4.5" r="1.1" />
          </svg>
          <span className="window-drag-bar" />
        </div>
      </div>

      <div
        className="window-controls-cluster"
        aria-label="Pencere Kontrolleri"
      >
        <button
          type="button"
          className="window-ctrl-btn btn-min"
          onClick={handleMinimize}
          title="Simge Durumuna Küçült"
          aria-label="Küçült"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
            <line x1="1.5" y1="5.5" x2="9.5" y2="5.5" />
          </svg>
        </button>
        <button
          type="button"
          className="window-ctrl-btn btn-max"
          onClick={handleToggleMaximize}
          title={isMaximized ? "Önceki Boyut" : "Ekranı Kapla"}
          aria-label={isMaximized ? "Önceki Boyut" : "Ekranı Kapla"}
        >
          {isMaximized ? (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true">
              <rect x="1.5" y="3.2" width="6.3" height="6.3" rx="0.8" />
              <path d="M3.5 3.2V2.2C3.5 1.8 3.8 1.5 4.2 1.5H8.8C9.2 1.5 9.5 1.8 9.5 2.2V6.8C9.5 7.2 9.2 7.5 8.8 7.5H7.8" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" aria-hidden="true">
              <rect x="1.5" y="1.5" width="8" height="8" rx="1" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="window-ctrl-btn btn-close"
          onClick={handleClose}
          title="Kapat"
          aria-label="Kapat"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <line x1="2" y1="2" x2="10" y2="10" />
            <line x1="10" y1="2" x2="2" y2="10" />
          </svg>
        </button>
      </div>
    </header>
  );
}
