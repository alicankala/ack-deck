import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import CloudflareSpeedTest from "@cloudflare/speedtest";

function compile(name, globals = {}) {
  const exports = {};
  const source = readFileSync(new URL("../src/" + name + ".ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, ...globals });
  return exports;
}

const store = compile("speedTestStore");
const { SpeedTestSession, SPEED_TEST_OPTIONS } = compile("speedTestSession", { require: () => store });

function setup(loadEngine, online = () => true) {
  const instances = [];
  const events = { progress: [], results: [], errors: [] };
  class FakeEngine {
    constructor(options) {
      this.options = options;
      this.playCalls = 0;
      this.pauseCalls = 0;
      this.results = {
        getDownloadBandwidth: () => 82_400_000,
        getUploadBandwidth: () => 18_700_000,
        getUnloadedLatency: () => 24,
        getUnloadedJitter: () => 4,
      };
      instances.push(this);
    }
    play() { this.playCalls++; }
    pause() { this.pauseCalls++; }
  }
  const session = new SpeedTestSession({
    onProgress: (...value) => events.progress.push(value),
    onFinish: (value) => events.results.push(value),
    onError: (value) => events.errors.push(value),
  }, loadEngine ? () => loadEngine(FakeEngine) : async () => FakeEngine, online);
  return { session, instances, events };
}

test("the real Cloudflare engine stays idle with ACKDeck's options", () => {
  const engine = new CloudflareSpeedTest(SPEED_TEST_OPTIONS);
  assert.equal(engine.isRunning, false);
  assert.equal(engine.isFinished, false);
  assert.equal(SPEED_TEST_OPTIONS.logAimApiUrl, null);
  assert.equal(SPEED_TEST_OPTIONS.logMeasurementApiUrl, null);
  assert.equal(SPEED_TEST_OPTIONS.measurements.some((step) => step.type === "packetLoss"), false);
  engine.pause();
});

test("the installed Cloudflare engine aborts its in-flight request when paused", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const requests = [];
  let engine;
  try {
    globalThis.window = { location: { origin: "http://localhost:1420" } };
    globalThis.fetch = (url, options) => new Promise((_resolve, reject) => {
      requests.push({ url, signal: options.signal });
      options.signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
    });
    engine = new CloudflareSpeedTest(SPEED_TEST_OPTIONS);
    assert.equal(requests.length, 0);
    engine.play();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].signal.aborted, false);
    engine.pause();
    assert.equal(requests[0].signal.aborted, true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(requests.length, 1);
    assert.equal(engine.isRunning, false);
  } finally {
    engine?.pause();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("creation makes no request; a click starts once and reports progress and final Mbps", async () => {
  const { session, instances, events } = setup();
  assert.equal(instances.length, 0);
  assert.equal(session.isRunning, false);
  await Promise.all([session.start(), session.start()]);
  assert.equal(instances.length, 1);
  const engine = instances[0];
  assert.equal(engine.playCalls, 1);
  engine.onPhaseChange({ measurementId: 3, measurement: { type: "download" } });
  engine.onResultsChange({ type: "download" });
  assert.equal(events.progress.length, 2);
  assert.equal(events.progress[0][1], 4);
  engine.onFinish(engine.results);
  assert.equal(events.results.length, 1);
  assert.equal(events.results[0].downloadMbps, 82.4);
  assert.equal(events.results[0].uploadMbps, 18.7);
  assert.equal(events.results[0].latencyMs, 24);
  assert.equal(events.results[0].jitterMs, 4);
  assert.equal(session.isRunning, false);
  assert.equal(engine.pauseCalls, 1);
  await session.start();
  assert.equal(instances.length, 2);
  session.dispose();
});

test("leaving a page pauses the engine, detaches callbacks and rejects late results", async () => {
  const { session, instances, events } = setup();
  await session.start();
  const engine = instances[0];
  const queuedFinish = engine.onFinish;
  const queuedProgress = engine.onResultsChange;
  session.dispose();
  assert.equal(engine.pauseCalls, 1);
  queuedFinish(engine.results);
  queuedProgress({ type: "download" });
  engine.onFinish(engine.results);
  engine.onError("raw technical error");
  assert.equal(events.results.length, 0);
  assert.equal(events.progress.length, 0);
  assert.equal(events.errors.length, 0);
  await session.start();
  assert.equal(instances.length, 1);
});

test("leaving while the package loads does not construct or start a late engine", async () => {
  let resolve;
  const { session, instances } = setup((Engine) => new Promise((done) => { resolve = () => done(Engine); }));
  const pending = session.start();
  session.dispose();
  resolve();
  await pending;
  assert.equal(instances.length, 0);
  assert.equal(session.isRunning, false);
});

test("offline and service errors are Turkish, stop the test and allow retry", async () => {
  const offline = setup(undefined, () => false);
  await offline.session.start();
  assert.equal(offline.instances.length, 0);
  assert.equal(offline.events.errors[0], "İnternet bağlantısı bulunamadı.");
  const { session, instances, events } = setup();
  await session.start();
  instances[0].onError("Connection failed to private diagnostic URL", 503);
  assert.equal(events.errors[0], "Hız testi servisine ulaşılamadı.");
  assert.equal(session.isRunning, false);
  await session.start();
  assert.equal(instances.length, 2);
  session.dispose();
});

test("incomplete/non-finite final measurements do not count as a successful result", async () => {
  const { session, instances, events } = setup();
  await session.start();
  instances[0].results.getUploadBandwidth = () => Infinity;
  instances[0].onFinish(instances[0].results);
  assert.equal(events.results.length, 0);
  assert.equal(events.errors[0], "Hız testi tamamlanamadı. Daha sonra tekrar deneyin.");
  assert.equal(session.isRunning, false);
});

test("only the last successful result persists; invalid results and quota errors preserve saved data", () => {
  const storage = new Map([["ack-deck.notes.v1", "existing-notes"]]);
  let writable = true;
  const window = { localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => { if (!writable) throw new Error("quota"); storage.set(key, value); },
  } };
  const first = compile("speedTestStore", { window });
  const result = { downloadMbps: 82.4, uploadMbps: 18.7, latencyMs: 24, jitterMs: 4, testedAt: 1700000000000 };
  assert.equal(first.saveSpeedResult(result), true);
  assert.equal(compile("speedTestStore", { window }).loadSpeedResult().downloadMbps, 82.4);
  assert.equal(first.saveSpeedResult({ ...result, uploadMbps: null }), false);
  assert.equal(first.loadSpeedResult().uploadMbps, 18.7);
  assert.equal(first.saveSpeedResult({ ...result, downloadMbps: 120 }), true);
  assert.equal(first.loadSpeedResult().downloadMbps, 120);
  writable = false;
  assert.equal(first.saveSpeedResult({ ...result, downloadMbps: 150 }), false);
  assert.equal(first.loadSpeedResult().downloadMbps, 120);
  assert.equal(storage.get("ack-deck.notes.v1"), "existing-notes");
  storage.set("ack-deck.speed-test.v1", "broken JSON");
  assert.equal(first.loadSpeedResult(), null);
  assert.equal(storage.get("ack-deck.speed-test.v1"), "broken JSON");
});
