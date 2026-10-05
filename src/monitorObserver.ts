import type { DisplayMonitor } from "./displayScaleStore";
type Unlisten = () => void;
export type MonitorSource = {
  read: () => Promise<DisplayMonitor | null>;
  subscribe: (changed: () => void) => Promise<Unlisten>[];
};
/** One debounced event-driven observer, with late-listener and stale-response cleanup. */
export function observeMonitor(source: MonitorSource, changed: (monitor: DisplayMonitor | null) => void, delay = 200): Unlisten {
  let active = true, revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unlisteners: Unlisten[] = [];
  async function read() {
    const request = ++revision;
    try { const monitor = await source.read(); if (active && request === revision) changed(monitor); }
    catch { if (active && request === revision) changed(null); }
  }
  function schedule() {
    ++revision;
    clearTimeout(timer);
    timer = setTimeout(() => { timer = undefined; void read(); }, delay);
  }
  for (const subscription of source.subscribe(schedule)) void subscription.then(unlisten => { if (active) unlisteners.push(unlisten); else unlisten(); }).catch(() => {});
  void read();
  return () => { active = false; ++revision; clearTimeout(timer); unlisteners.forEach(unlisten => unlisten()); };
}
