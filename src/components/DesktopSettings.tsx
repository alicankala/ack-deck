import { useState } from "react";
import { getDesktopStatus, saveDesktopPreferences, type DesktopStatus } from "../desktopClient";

export function DesktopSettings({ status, onChange }: { status: DesktopStatus | null; onChange: (status: DesktopStatus) => void }) {
  const [busy, setBusy] = useState(false);

  function notify(msg: string) {
    window.dispatchEvent(new CustomEvent("ack-settings-toast", { detail: msg }));
  }

  async function change(closeToTray: boolean, autoStart: boolean, startInTray: boolean) {
    setBusy(true);
    try {
      await saveDesktopPreferences({ closeToTray, startInTray }, autoStart);
      onChange(await getDesktopStatus());
      notify("Windows tercihleri kaydedildi.");
    } catch (error) {
      const msg = typeof error === "string" && error.startsWith("Otomatik başlatma kurulu") ? error : "Windows tercihleri kaydedilemedi.";
      notify(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card surface local-settings" aria-labelledby="desktop-settings-title">
      <div className="settings-card-heading">
        <h2 id="desktop-settings-title">Windows Davranışı</h2>
      </div>
      {!status ? (
        <p role="status" className="task-hint">Windows tercihleri alınamadı.</p>
      ) : (
        <div className="toggle-settings" style={{ marginTop: "0.5rem" }}>
          <label>
            <input
              type="checkbox"
              checked={status.preferences.closeToTray}
              disabled={busy}
              onChange={(event) => void change(event.target.checked, status.autoStart, status.preferences.startInTray)}
            />
            Pencereyi kapatınca sistem tepsisine küçült
          </label>
          <label>
            <input
              type="checkbox"
              checked={status.autoStart}
              disabled={busy}
              onChange={(event) => void change(status.preferences.closeToTray, event.target.checked, status.preferences.startInTray)}
            />
            Windows açıldığında ACKDeck'i başlat
          </label>
          <label>
            <input
              type="checkbox"
              checked={status.preferences.startInTray}
              disabled={busy || !status.autoStart}
              onChange={(event) => void change(status.preferences.closeToTray, status.autoStart, event.target.checked)}
            />
            Başlangıçta sistem tepsisinde başlat
          </label>
        </div>
      )}
    </section>
  );
}
