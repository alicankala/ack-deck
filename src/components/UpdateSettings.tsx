import { useSyncExternalStore } from "react";
import { checkUpdates, installUpdate, subscribeUpdates, updateSnapshot } from "../updateClient";

export function UpdateSettings({ version }: { version?: string }) {
  const status = useSyncExternalStore(subscribeUpdates, updateSnapshot);
  const busy = status.phase === "checking" || status.phase === "installing";
  const message = status.phase === "checking" ? "Yeni sürüm denetleniyor. Bulunursa otomatik indirilir." : status.phase === "installing" ? "Yedek alınıyor ve güncelleme hazırlanıyor." : status.phase === "ready" ? `Sürüm ${status.version} indirildi ve kurulmaya hazır.` : status.message || "Henüz güncelleme denetimi yapılmadı.";
  return <section className="settings-card surface" aria-labelledby="update-settings-title"><div className="settings-card-heading"><div><h2 id="update-settings-title">Uygulama güncellemeleri</h2><p>Kurulu sürüm: {version || "—"}</p></div></div><p className="settings-explanation">ACKDeck açılışta GitHub üzerinden yeni sürümü denetler ve indirir. Kurulumdan önce kayıtlarının yedeği alınır.</p><p className="feedback" role="status">{message}</p><div className="settings-actions"><button type="button" className="button button-secondary" disabled={busy || status.phase === "ready"} onClick={() => void checkUpdates()}>Güncellemeleri Kontrol Et</button>{status.phase === "ready" && <button type="button" className="button button-primary" onClick={() => void installUpdate()}>Şimdi Yeniden Başlat</button>}</div></section>;
}
