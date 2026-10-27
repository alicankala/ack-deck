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

  const handleStartDragging = (e: React.MouseEvent) => {
    if (!inTauri) return;
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.button === 0 && e.detail === 1) {
      void invoke("window_start_dragging").catch(() => {
        void getCurrentWindow().startDragging().catch(() => {});
      });
    } else if (e.button === 0 && e.detail === 2) {
      void handleToggleMaximize();
    }
  };

  if (!inTauri) return null;

  return (
    <div className="desktop-window-bar">
      <div
        className="window-drag-region"
        data-tauri-drag-region
        onMouseDown={handleStartDragging}
      />
      <div
        className="window-controls-cluster"
        aria-label="Pencere Kontrolleri"
        style={{ WebkitAppRegion: "no-drag", pointerEvents: "auto" } as React.CSSProperties}
      >
        <button
          type="button"
          className="window-ctrl-btn btn-min"
          onClick={handleMinimize}
          title="Simge Durumuna Küçült"
          aria-label="Küçült"
          style={{ WebkitAppRegion: "no-drag", pointerEvents: "auto" } as React.CSSProperties}
        >
          <span aria-hidden="true">—</span>
        </button>
        <button
          type="button"
          className="window-ctrl-btn btn-max"
          onClick={handleToggleMaximize}
          title={isMaximized ? "Önceki Boyut" : "Ekranı Kapla"}
          aria-label={isMaximized ? "Küçült" : "Kapla"}
          style={{ WebkitAppRegion: "no-drag", pointerEvents: "auto" } as React.CSSProperties}
        >
          <span aria-hidden="true">{isMaximized ? "❐" : "◻"}</span>
        </button>
        <button
          type="button"
          className="window-ctrl-btn btn-close"
          onClick={handleClose}
          title="Kapat"
          aria-label="Kapat"
          style={{ WebkitAppRegion: "no-drag", pointerEvents: "auto" } as React.CSSProperties}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  );
}
