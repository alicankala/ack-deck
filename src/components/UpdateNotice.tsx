import { useEffect, useSyncExternalStore } from "react";
import { installUpdate, startUpdates, subscribeUpdates, updateSnapshot } from "../updateClient";

export function UpdateNotice({ blocked, hidden = false }: { blocked: boolean; hidden?: boolean }) {
  const status = useSyncExternalStore(subscribeUpdates, updateSnapshot);
  useEffect(startUpdates, []);
  if (hidden || status.phase === "idle" || status.phase === "checking" || status.phase === "error") return null;
  return <section className="update-notice surface" aria-label="ACKDeck güncellemesi" aria-live="polite">
    <span>{status.phase === "installing" ? "Güncelleme öncesi yedek alınıyor ve kurulum hazırlanıyor…" : `ACKDeck ${status.version} indirildi. Yeniden başlatarak kurabilirsiniz.`}</span>
    {status.phase === "ready" && <button type="button" className="button button-primary" disabled={blocked} onClick={() => void installUpdate()}>Şimdi Yeniden Başlat</button>}
    {status.phase === "ready" && status.message && <p role="alert">{status.message}</p>}
  </section>;
}
