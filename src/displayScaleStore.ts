export const DISPLAY_SCALE_KEY = "ack-deck.display-scale.v1";
export const DISPLAY_SCALES = [90, 100, 105, 110, 115, 125] as const;
export type DisplayScale = typeof DISPLAY_SCALES[number];
export type DisplayPreferences = { defaultScale: DisplayScale; monitors: Record<string, DisplayScale> };
export type DisplayMonitor = { name: string | null; position: { x: number; y: number }; size: { width: number; height: number }; scaleFactor: number };
export function isDisplayScale(value: unknown): value is DisplayScale { return DISPLAY_SCALES.includes(value as DisplayScale); }
export function monitorKey(monitor: DisplayMonitor): string {
  // Device names survive DPI/resolution changes. Geometry is a fallback, never a layout input.
  const name = monitor.name?.trim().normalize("NFC");
  return name ? `name:${name}` : `geometry:${monitor.position.x},${monitor.position.y}:${monitor.size.width}x${monitor.size.height}`;
}
export function readDisplayPreferences(): DisplayPreferences {
  const raw = window.localStorage.getItem(DISPLAY_SCALE_KEY);
  if (raw === null) return { defaultScale: 100, monitors: {} };
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid display preferences");
  const data = value as Record<string, unknown>;
  if (!isDisplayScale(data.defaultScale) || !data.monitors || typeof data.monitors !== "object" || Array.isArray(data.monitors)) throw new Error("invalid display preferences");
  const monitors: Record<string, DisplayScale> = Object.create(null) as Record<string, DisplayScale>;
  for (const [key, scale] of Object.entries(data.monitors)) {
    if (!key.startsWith("name:") && !key.startsWith("geometry:")) throw new Error("invalid monitor key");
    if (!isDisplayScale(scale)) throw new Error("invalid display scale");
    monitors[key] = scale;
  }
  return { defaultScale: data.defaultScale, monitors };
}
export function displayScaleFor(preferences: DisplayPreferences, key: string | null): DisplayScale { return key ? preferences.monitors[key] ?? preferences.defaultScale : preferences.defaultScale; }
export function saveMonitorScale(key: string, scale: DisplayScale | null): DisplayPreferences {
  if ((!key.startsWith("name:") && !key.startsWith("geometry:")) || (scale !== null && !isDisplayScale(scale))) throw new Error("invalid display scale");
  // Re-read before editing so another preference is never overwritten with an old snapshot.
  const preferences = readDisplayPreferences();
  if (scale === null) delete preferences.monitors[key]; else preferences.monitors[key] = scale;
  window.localStorage.setItem(DISPLAY_SCALE_KEY, JSON.stringify(preferences));
  return preferences;
}
