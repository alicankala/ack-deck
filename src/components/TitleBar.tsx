import { useState, useEffect } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const inTauri = isTauri();

  useEffect(() => {
    if (!inTauri) return;
    // Window state change listener if available
  }, [inTauri]);

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

  return (
    <header className="desktop-titlebar" data-tauri-drag-region>
      <div className="titlebar-brand" data-tauri-drag-region>
        <span className="titlebar-logo-icon" aria-hidden="true">⚡</span>
        <strong className="titlebar-title">ACKDeck</strong>
        <span className="titlebar-version-badge">v1.6.9</span>
      </div>

      <div className="titlebar-drag-spacer" data-tauri-drag-region />

      {inTauri && (
        <div className="titlebar-controls" aria-label="Pencere Kontrolleri">
          <button
            type="button"
            className="titlebar-btn btn-minimize"
            onClick={handleMinimize}
            title="Simge Durumuna Küçült"
            aria-label="Küçült"
          >
            <span aria-hidden="true">—</span>
          </button>
          <button
            type="button"
            className="titlebar-btn btn-maximize"
            onClick={handleToggleMaximize}
            title={isMaximized ? "Önceki Boyut" : "Ekranı Kapla"}
            aria-label={isMaximized ? "Küçült" : "Kapla"}
          >
            <span aria-hidden="true">{isMaximized ? "❐" : "◻"}</span>
          </button>
          <button
            type="button"
            className="titlebar-btn btn-close"
            onClick={handleClose}
            title="Kapat"
            aria-label="Kapat"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      )}
    </header>
  );
}
