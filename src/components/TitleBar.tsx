import { useState, useEffect } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const inTauri = isTauri();

  useEffect(() => {
    if (!inTauri) return;
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      win.isMaximized().then(setIsMaximized).catch(() => {});
      win.onResized(() => {
        win.isMaximized().then(setIsMaximized).catch(() => {});
      }).then((u) => { unlisten = u; }).catch(() => {});
    }).catch(() => {});
    return () => {
      if (unlisten) unlisten();
    };
  }, [inTauri]);

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!inTauri) return;
    try {
      await invoke("window_minimize");
    } catch {}
  };

  const handleToggleMaximize = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!inTauri) return;
    try {
      const max = await invoke<boolean>("window_toggle_maximize");
      setIsMaximized(max);
    } catch {}
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!inTauri) return;
    try {
      await invoke("window_close");
    } catch {}
  };

  const handleStartDragging = (e: React.MouseEvent) => {
    if (!inTauri) return;
    if (e.button === 0 && !(e.target as HTMLElement).closest("button")) {
      void invoke("window_start_dragging");
    }
  };

  if (!inTauri) return null;

  return (
    <div
      className="desktop-window-bar"
      onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).closest("button")) {
          void handleToggleMaximize();
        }
      }}
    >
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
