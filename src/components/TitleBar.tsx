import { useState, useEffect } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const inTauri = isTauri();

  useEffect(() => {
    if (!inTauri) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    try {
      const win = getCurrentWindow();
      win.isMaximized().then((max) => {
        if (!disposed) setIsMaximized(max);
      }).catch(() => {});
      win.onResized(() => {
        if (!disposed) {
          win.isMaximized().then((max) => {
            if (!disposed) setIsMaximized(max);
          }).catch(() => {});
        }
      }).then((u) => {
        if (disposed) {
          u();
        } else {
          unlisten = u;
        }
      }).catch(() => {});
    } catch {}
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [inTauri]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F5" || (e.ctrlKey && e.key.toLowerCase() === "r")) {
        e.preventDefault();
        setRefreshing(true);
        setTimeout(() => {
          window.location.reload();
        }, 180);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (refreshing) return;
    setRefreshing(true);
    setTimeout(() => {
      window.location.reload();
    }, 180);
  };

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
      />

      <div
        className="window-controls-cluster"
        aria-label="Pencere Kontrolleri"
      >
        <button
          type="button"
          className={`window-ctrl-btn btn-refresh ${refreshing ? "spinning" : ""}`}
          onClick={handleRefresh}
          title="Sayfayı Yenile (F5 / Ctrl+R)"
          aria-label="Yenile"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 8a6 6 0 1 1-6-6c1.68 0 3.29.67 4.5 1.83L14 5.3" />
            <path d="M14 2v3.5h-3.5" />
          </svg>
        </button>
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
