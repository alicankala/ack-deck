import { useEffect, useRef, useState } from "react";
import { SpeedTestSession, SPEED_TEST_OPTIONS } from "../speedTestSession";
import { EMPTY_SPEED_METRICS, loadSpeedResult, saveSpeedResult, type SpeedMetrics } from "../speedTestStore";
import { Icon, type IconName } from "./Icon";

const metrics: { label: string; key: keyof SpeedMetrics; unit: string; icon: IconName }[] = [
  { label: "Download", key: "downloadMbps", unit: "Mbps", icon: "arrowRight" },
  { label: "Upload", key: "uploadMbps", unit: "Mbps", icon: "arrowRight" },
  { label: "Gecikme / Ping", key: "latencyMs", unit: "ms", icon: "wifi" },
  { label: "Jitter", key: "jitterMs", unit: "ms", icon: "layers" },
];
const dateFormatter = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
const valueFormatter = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });
type TestState = "idle" | "running" | "complete" | "cancelled" | "error";

export function SpeedTest({ authorizedStart = false }: { authorizedStart?: boolean }) {
  const startedByConfirmation = useRef(false);
  const [lastResult, setLastResult] = useState(loadSpeedResult);
  const [live, setLive] = useState<SpeedMetrics>(EMPTY_SPEED_METRICS);
  const [state, setState] = useState<TestState>("idle");
  const [phase, setPhase] = useState({ index: 0, kind: "preparing" });
  const [feedback, setFeedback] = useState("");
  const session = useRef<SpeedTestSession | null>(null);
  const running = state === "running";
  const shown = running ? live : lastResult;
  const phaseCount = SPEED_TEST_OPTIONS.measurements!.length;
  const phaseLabel = phase.kind === "download" ? "Download ölçülüyor..." : phase.kind === "upload" ? "Upload ölçülüyor..." : phase.kind === "latency" ? "Gecikme ölçülüyor..." : "Test hazırlanıyor...";

  useEffect(() => () => {
    session.current?.dispose();
    session.current = null;
  }, []);
  useEffect(() => { if (authorizedStart && !startedByConfirmation.current) { const timer = window.setTimeout(() => { startedByConfirmation.current = true; start(); }, 0); return () => window.clearTimeout(timer); } }, [authorizedStart]);

  function start() {
    if (session.current?.isRunning) return;
    session.current?.dispose();
    setState("running");
    setFeedback("");
    setLive(EMPTY_SPEED_METRICS);
    setPhase({ index: 0, kind: "preparing" });
    const next = new SpeedTestSession({
      onProgress: (values, index, kind) => { setLive(values); setPhase({ index, kind }); },
      onFinish: (result) => {
        setLastResult(result);
        setState("complete");
        if (!saveSpeedResult(result)) setFeedback("Test tamamlandı ancak sonuç yerel olarak kaydedilemedi.");
      },
      onError: (message) => { setState("error"); setFeedback(message); },
    });
    session.current = next;
    void next.start();
  }

  function cancel() {
    session.current?.dispose();
    session.current = null;
    setState("cancelled");
    setFeedback("");
  }

  return <div className="speed-page">
    <header className="feature-heading"><h1>Hız Testi</h1><p>İnternet bağlantının indirme, yükleme ve gecikme değerlerini ölç.</p></header>
    <section className="speed-control surface" aria-label="Hız testi kontrolü">
      <div className="speed-start-row"><button className="button button-primary speed-start" type="button" onClick={start} disabled={running}><Icon name="speed" size={22} />{running ? "Test Devam Ediyor" : "Hız Testini Başlat"}</button>{running && <button className="button button-secondary" type="button" onClick={cancel}>Testi Durdur</button>}</div>
      <p className="speed-traffic-note">Hız testi internet trafiği kullanır. Mobil/kotalı bağlantılarda veri tüketebilir.</p>
      <p className="speed-provider-note">Ölçüm Cloudflare altyapısı üzerinden yapılır.</p>
      <div className="speed-state" role="status">{running ? phaseLabel : state === "complete" ? "Test tamamlandı. Sonuçlar aşağıda gösteriliyor." : state === "cancelled" ? "Test durduruldu. Son başarılı sonuç korunuyor." : state === "error" ? "Test tamamlanamadı. Son başarılı sonuç korunuyor." : lastResult ? "Son başarılı test sonucu gösteriliyor." : "Ölçüm başlatılmayı bekliyor."}</div>
      {running && <div className="speed-progress"><progress aria-label="Tamamlanan ölçüm aşamaları" max={phaseCount} value={Math.max(0, phase.index - 1)} /><span>{phase.index ? "Aşama " + phase.index + " / " + phaseCount : "Hazırlanıyor"} · Ara değerler kesin sonuç değildir.</span></div>}
    </section>
    {feedback && <div className="tool-feedback error" role="alert">{feedback}</div>}
    <section className="speed-results" aria-label={running ? "Devam eden ölçümün ara değerleri" : "Son başarılı hız testi sonucu"} aria-busy={running}>
      {metrics.map((metric) => <article className="speed-metric surface" key={metric.key}><span className="speed-metric-icon"><Icon name={metric.icon} size={21} /></span><h2>{metric.label}</h2><div className="speed-metric-value">{shown?.[metric.key] === null || shown?.[metric.key] === undefined ? "--" : valueFormatter.format(shown[metric.key]!)}<small>{metric.unit}</small></div><p>{running ? "Ölçülüyor..." : shown ? "Son başarılı sonuç" : "Henüz ölçülmedi"}</p></article>)}
    </section>
    <p className="speed-last-time">Son başarılı test: {lastResult ? <time dateTime={new Date(lastResult.testedAt).toISOString()}>{dateFormatter.format(lastResult.testedAt)}</time> : "Henüz yapılmadı"}</p>
  </div>;
}
