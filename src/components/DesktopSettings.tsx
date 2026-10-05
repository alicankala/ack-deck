import { useState } from "react";
import { getDesktopStatus, saveDesktopPreferences, type DesktopStatus } from "../desktopClient";
export function DesktopSettings({ status, onChange }: { status: DesktopStatus | null; onChange: (status: DesktopStatus) => void }) {
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState("");
  async function change(closeToTray: boolean, autoStart: boolean, startInTray: boolean) {
    setBusy(true); setFeedback("");
    try { await saveDesktopPreferences({ closeToTray, startInTray }, autoStart); onChange(await getDesktopStatus()); setFeedback("Windows tercihleri kaydedildi."); }
    catch (error) { setFeedback(typeof error === "string" && error.startsWith("Otomatik başlatma kurulu") ? error : "Windows tercihleri değiştirilemedi. Mevcut ayarlar korunuyor."); }
    finally { setBusy(false); }
  }
  return <section className="settings-card surface local-settings" aria-labelledby="desktop-settings-title"><h2 id="desktop-settings-title">Windows davranışı</h2>
    {!status ? <p role="status">Windows tercihleri alınamadı.</p> : <div className="toggle-settings">
      <label><input type="checkbox" checked={status.preferences.closeToTray} disabled={busy} onChange={(event) => void change(event.target.checked, status.autoStart, status.preferences.startInTray)} />Pencereyi kapatınca sistem tepsisine küçült</label>
      <label><input type="checkbox" checked={status.autoStart} disabled={busy} onChange={(event) => void change(status.preferences.closeToTray, event.target.checked, status.preferences.startInTray)} />Windows açıldığında ACKDeck'i başlat</label>
      <label><input type="checkbox" checked={status.preferences.startInTray} disabled={busy || !status.autoStart} onChange={(event) => void change(status.preferences.closeToTray, status.autoStart, event.target.checked)} />Başlangıçta sistem tepsisinde başlat</label>
      <p>Tepsi menüsündeki Çıkış uygulamayı tamamen kapatır. Otomatik başlangıç kurulu production sürümünde kullanılabilir.</p>
    </div>}{feedback && <p className="feedback" role="status">{feedback}</p>}
  </section>;
}
