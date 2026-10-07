import { useEffect, useSyncExternalStore } from "react";
import { checkUpdates, installUpdate, startUpdates, subscribeUpdates, updateSnapshot } from "../updateClient";

export function UpdateNotice({ blocked }: { blocked: boolean }) {
  const status = useSyncExternalStore(subscribeUpdates, updateSnapshot);
  useEffect(startUpdates, []);
  if (status.phase === "idle") return null;
  return <section className="update-notice surface" aria-label="ACKDeck güncellemesi" aria-live="polite">
    <span>{status.phase === "checking" ? "GitHub güncellemeleri denetleniyor; yeni sürüm varsa otomatik indiriliyor…" : status.phase === "installing" ? "Güncelleme öncesi yedek alınıyor ve kurulum hazırlanıyor…" : status.phase === "ready" ? `ACKDeck ${status.version} indirildi. Yeniden başlatarak kurabilirsiniz.` : status.message}</span>
    {status.phase === "ready" && <button type="button" className="button button-primary" disabled={blocked} onClick={() => void installUpdate()}>Şimdi Yeniden Başlat</button>}
    {status.phase === "error" && <button type="button" className="button button-secondary" disabled={blocked} onClick={() => void checkUpdates()}>Tekrar Dene</button>}
    {status.phase === "ready" && status.message && <p role="alert">{status.message}</p>}
  </section>;
}
