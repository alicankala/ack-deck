import type CloudflareSpeedTest from "@cloudflare/speedtest";
import type { ConfigOptions, Results } from "@cloudflare/speedtest";
import { isSpeedResult, type SpeedMetrics, type SpeedResult } from "./speedTestStore";

// Cloudflare's documented ramp-up sequence, excluding the TURN/packet-loss phase.
export const SPEED_TEST_OPTIONS: ConfigOptions = {
  autoStart: false,
  logAimApiUrl: null,
  logMeasurementApiUrl: null,
  measureDownloadLoadedLatency: false,
  measureUploadLoadedLatency: false,
  bandwidthAbortRequestDuration: 30_000,
  measurements: [
    { type: "latency", numPackets: 2 },
    { type: "download", bytes: 1e5, count: 1, bypassMinDuration: true },
    { type: "latency", numPackets: 20 },
    { type: "download", bytes: 1e5, count: 9 },
    { type: "download", bytes: 1e6, count: 8 },
    { type: "upload", bytes: 1e5, count: 8 },
    { type: "upload", bytes: 1e6, count: 6 },
    { type: "download", bytes: 1e7, count: 6 },
    { type: "upload", bytes: 1e7, count: 4 },
    { type: "download", bytes: 2.5e7, count: 4 },
    { type: "upload", bytes: 2.5e7, count: 4 },
    { type: "download", bytes: 1e8, count: 3 },
    { type: "upload", bytes: 5e7, count: 3 },
    { type: "download", bytes: 2.5e8, count: 2 },
  ],
};

type Engine = Pick<CloudflareSpeedTest, "results" | "onFinish" | "onError" | "onPhaseChange" | "onResultsChange" | "onRunningChange" | "onResultsLogged" | "play" | "pause">;
type EngineConstructor = new (options: ConfigOptions) => Engine;
type SessionCallbacks = {
  onProgress: (metrics: SpeedMetrics, phase: number, kind: string) => void;
  onFinish: (result: SpeedResult) => void;
  onError: (message: string) => void;
};
const GENERAL_ERROR = "Hız testi tamamlanamadı. Daha sonra tekrar deneyin.";
const finiteMetric = (value: number | null | undefined) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export function readSpeedMetrics(results: Results): SpeedMetrics {
  const download = finiteMetric(results.getDownloadBandwidth());
  const upload = finiteMetric(results.getUploadBandwidth());
  return {
    downloadMbps: download === null ? null : download / 1e6,
    uploadMbps: upload === null ? null : upload / 1e6,
    latencyMs: finiteMetric(results.getUnloadedLatency()),
    jitterMs: finiteMetric(results.getUnloadedJitter()),
  };
}

export class SpeedTestSession {
  private engine: Engine | null = null;
  private active = false;
  private disposed = false;
  private generation = 0;

  constructor(
    private callbacks: SessionCallbacks,
    private loadEngine: () => Promise<EngineConstructor> = async () => (await import("@cloudflare/speedtest")).default,
    private isOnline: () => boolean = () => navigator.onLine,
  ) {}

  get isRunning() { return this.active; }

  async start(): Promise<void> {
    if (this.active || this.disposed) return;
    if (!this.isOnline()) { this.callbacks.onError("İnternet bağlantısı bulunamadı."); return; }
    this.active = true;
    const generation = ++this.generation;
    let phase = 0;
    let kind = "preparing";
    try {
      // Import and construct the browser engine only after the user's click.
      const EngineClass = await this.loadEngine();
      if (!this.active || this.disposed || generation !== this.generation) return;
      const engine = new EngineClass(SPEED_TEST_OPTIONS);
      this.engine = engine;
      const current = () => this.active && !this.disposed && generation === this.generation;
      engine.onPhaseChange = ({ measurementId, measurement }) => {
        if (!current()) return;
        phase = measurementId + 1;
        kind = measurement.type;
        this.callbacks.onProgress(readSpeedMetrics(engine.results), phase, kind);
      };
      engine.onResultsChange = () => {
        if (current()) this.callbacks.onProgress(readSpeedMetrics(engine.results), phase, kind);
      };
      engine.onFinish = (results) => {
        if (!current()) return;
        const result = { ...readSpeedMetrics(results), testedAt: Date.now() };
        this.release();
        if (isSpeedResult(result)) this.callbacks.onFinish(result);
        else this.callbacks.onError(GENERAL_ERROR);
      };
      engine.onError = (message, status) => {
        if (!current()) return;
        this.release();
        this.callbacks.onError(!this.isOnline() ? "İnternet bağlantısı bulunamadı." :
          status !== undefined || /connection|fetch|request/i.test(message) ? "Hız testi servisine ulaşılamadı." : GENERAL_ERROR);
      };
      engine.play();
    } catch {
      if (this.active && !this.disposed && generation === this.generation) {
        this.release();
        this.callbacks.onError(!this.isOnline() ? "İnternet bağlantısı bulunamadı." : GENERAL_ERROR);
      }
    }
  }

  cancel() { this.release(); }
  dispose() { this.disposed = true; this.release(); }

  private release() {
    this.active = false;
    this.generation++;
    const engine = this.engine;
    this.engine = null;
    if (!engine) return;
    // Detach callbacks before pause, which can itself emit a running-state event.
    engine.onFinish = () => {};
    engine.onError = () => {};
    engine.onPhaseChange = () => {};
    engine.onResultsChange = () => {};
    engine.onRunningChange = () => {};
    engine.onResultsLogged = () => {};
    try { engine.pause(); } catch { /* Already stopped; no callback can update the page. */ }
  }
}
