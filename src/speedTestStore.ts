export type SpeedMetrics = { downloadMbps: number | null; uploadMbps: number | null; latencyMs: number | null; jitterMs: number | null };
export type SpeedResult = SpeedMetrics & { downloadMbps: number; uploadMbps: number; latencyMs: number; testedAt: number };

const STORAGE_KEY = "ack-deck.speed-test.v1";
export const EMPTY_SPEED_METRICS: SpeedMetrics = { downloadMbps: null, uploadMbps: null, latencyMs: null, jitterMs: null };

export function isSpeedResult(value: unknown): value is SpeedResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<SpeedResult>;
  const valid = (entry: unknown, positive = false) => typeof entry === "number" && Number.isFinite(entry) && (positive ? entry > 0 : entry >= 0);
  return valid(result.downloadMbps, true) && valid(result.uploadMbps, true) && valid(result.latencyMs) &&
    (result.jitterMs === null || valid(result.jitterMs)) && valid(result.testedAt, true) && result.testedAt! <= 8.64e15;
}

export function loadSpeedResult(): SpeedResult | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === null) return null;
    const parsed: unknown = JSON.parse(saved);
    return isSpeedResult(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSpeedResult(result: SpeedResult): boolean {
  if (!isSpeedResult(result)) return false;
  try {
    // Replace only the previous speed result; other ACKDeck storage is untouched.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    return true;
  } catch {
    return false;
  }
}
