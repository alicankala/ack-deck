import { useState } from "react";
import { runSystemCheck, type CheckRow } from "../systemCheck";
export function AboutSettings({ version }: { version?: string }) {
  const [busy, setBusy] = useState(false), [rows, setRows] = useState<CheckRow[]>([]), [error, setError] = useState("");
  async function check() { setBusy(true); setError(""); try { setRows(await runSystemCheck()); } catch { setError("Sistem kontrolü tamamlanamadı."); } finally { setBusy(false); } }
  return <section className="settings-card surface local-settings" aria-labelledby="about-title">
    <div style={{ borderRadius: "12px", overflow: "hidden", marginBottom: "1rem", border: "1px solid var(--border, rgba(255,255,255,0.1))" }}>
      <img src="/ackdeck_banner.jpg" alt="ACKDeck Command Banner" style={{ width: "100%", height: "auto", display: "block" }} />
    </div>
    <h2 id="about-title">Hakkında</h2>
    <p className="task-hint"><img src="/ackdeck_app_icon.jpg" alt="ACKDeck Icon" width="40" height="40" style={{ borderRadius: "8px", verticalAlign: "middle", marginRight: "8px" }} /> <strong>ACKDeck</strong> · Sürüm {version ?? "Alınamadı"} · Windows masaüstü uygulaması</p>
    <p className="task-hint">Kayıtların ve sohbetlerin bu bilgisayarda saklanır. Gemini anahtarın Windows tarafından güvenli biçimde korunur. Telefon eşitlemesi yalnızca etkinleştirdiğinde çalışır.</p>
    <button className="button button-secondary" type="button" disabled={busy} onClick={check}>{busy ? "Kontrol ediliyor..." : "Sistem Kontrolü"}</button>
    <p className="task-hint">İnternet servisi veya Gemini mesajı gönderilmez. Ağ durumu Windows'tan alınır; dosya/proje altyapısı kontrolü gerçek bir dosya açmaz.</p>
    <dl className="system-check-list">{rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd className={row.status === "Sorun" ? "problem" : ""}>{row.status}</dd></div>)}</dl>
    {error && <p className="feedback error" role="alert">{error}</p>}
  </section>;
}
