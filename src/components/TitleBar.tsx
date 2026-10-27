import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const inTauri = isTauri();

  const handleMinimize = async () => {
    if (!inTauri) return;
    try {
      await invoke("window_minimize");
    } catch {}
  };

  const handleToggleMaximize = async () => {
    if (!inTauri) return;
    try {
      const max = await invoke<boolean>("window_toggle_maximize");
      setIsMaximized(max);
    } catch {}
  };

  const handleClose = async () => {
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
      data-tauri-drag-region
      onMouseDown={handleStartDragging}
      onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).closest("button")) {
          void handleToggleMaximize();
        }
      }}
    >
      <div className="window-drag-region" data-tauri-drag-region onMouseDown={handleStartDragging} />
      <div className="window-controls-cluster" aria-label="Pencere Kontrolleri">
        <button
          type="button"
          className="window-ctrl-btn btn-min"
          onClick={handleMinimize}
          title="Simge Durumuna Küçült"
          aria-label="Küçült"
        >
          <span aria-hidden="true">—</span>
        </button>
        <button
          type="button"
          className="window-ctrl-btn btn-max"
          onClick={handleToggleMaximize}
          title={isMaximized ? "Önceki Boyut" : "Ekranı Kapla"}
          aria-label={isMaximized ? "Küçült" : "Kapla"}
        >
          <span aria-hidden="true">{isMaximized ? "❐" : "◻"}</span>
        </button>
        <button
          type="button"
          className="window-ctrl-btn btn-close"
          onClick={handleClose}
          title="Kapat"
          aria-label="Kapat"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  );
}
