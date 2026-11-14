export type DormMenuRecord = {
  id: string;
  tarih: string; // YYYY-MM-DD
  kahvalti: string;
  aksam: string;
  dosya?: string;
  dosyaAd?: string;
  yayinda: boolean;
};

export type DailyMenu = {
  date: string;
  dinnerDishes: string[];
  breakfastDishes: string[];
  rawDinner: string;
  rawBreakfast: string;
  isToday: boolean;
  isFallback?: boolean;
};

export const DORM_MENU_CACHE_KEY = "ack-deck.dorm-menu.v1";
export const DORM_MENU_NOTIFIED_KEY = "ack-deck.dorm-menu.last-notified";
export const DORM_MENU_LAST_FETCH_KEY = "ack-deck.dorm-menu.last-fetched-at";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type DormFetch = (
  input: string,
  init?: { cache?: string; headers?: Record<string, string> },
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

type DormBrowserTarget = {
  localStorage?: StorageLike;
  dispatchEvent?: (event: unknown) => unknown;
  window?: DormBrowserTarget;
  Event?: new (type: string) => unknown;
  fetch?: DormFetch;
};

let nativeDormFetcher: (() => Promise<string | null>) | null = null;

export function registerNativeDormFetcher(fetcher: (() => Promise<string | null>) | null): void {
  nativeDormFetcher = fetcher;
}

function getBrowserTarget(): DormBrowserTarget {
  const g = globalThis as unknown as DormBrowserTarget;
  return g.window ?? g;
}

function getStorage(): StorageLike | null {
  try {
    const target = getBrowserTarget();
    if (target.localStorage) return target.localStorage;
    const g = globalThis as unknown as DormBrowserTarget;
    if (g.localStorage) return g.localStorage;
  } catch {}
  return null;
}

function extractDormMenuRecords(payload: unknown): DormMenuRecord[] | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.records)) {
    return obj.records as DormMenuRecord[];
  }
  if (obj.menu && typeof obj.menu === "object" && !Array.isArray(obj.menu)) {
    const menu = obj.menu as Record<string, unknown>;
    if (Array.isArray(menu.kayitlar)) {
      return menu.kayitlar as DormMenuRecord[];
    }
  }
  return null;
}

export function parseDishes(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//") && !line.startsWith("#"));
}

export function turkeyDateKey(d = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (y && m && day) return `${y}-${m}-${day}`;
  } catch {}
  return d.toISOString().slice(0, 10);
}

export function loadDormMenuCache(): DormMenuRecord[] {
  try {
    const storage = getStorage();
    const raw = storage?.getItem(DORM_MENU_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [];
}

export function getLastDormMenuFetchTime(): number {
  try {
    const storage = getStorage();
    const raw = storage?.getItem(DORM_MENU_LAST_FETCH_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

export function saveDormMenuCache(records: DormMenuRecord[]): void {
  try {
    const storage = getStorage();
    storage?.setItem(DORM_MENU_CACHE_KEY, JSON.stringify(records));
    storage?.setItem(DORM_MENU_LAST_FETCH_KEY, String(Date.now()));
    const target = getBrowserTarget();
    const globals = globalThis as unknown as DormBrowserTarget;
    const EventCtor = target.Event ?? globals.Event;
    if (EventCtor && typeof target.dispatchEvent === "function") {
      target.dispatchEvent(new EventCtor("ack-dorm-menu-updated"));
    }
  } catch {}
}

export function isDormMenuFresh(todayKey = turkeyDateKey(), now = new Date()): boolean {
  const records = loadDormMenuCache();
  const current = findMenuForDate(records, todayKey);
  // 1. If today's menu is already present (not a fallback from previous days) and has dinner dishes:
  if (current && !current.isFallback && current.isToday && current.dinnerDishes.length > 0) {
    return true; // Today's menu is already present and complete!
  }
  // 2. Today's menu is missing/fallback: check last fetch time.
  const lastFetch = getLastDormMenuFetchTime();
  if (lastFetch <= 0) return false;

  const nowMs = now.getTime();
  const todayPublishMs = Date.parse(`${todayKey}T12:30:00+03:00`);
  if (!Number.isNaN(todayPublishMs) && nowMs >= todayPublishMs) {
    // Past 12:30 Istanbul time: any fetch from before 12:30 today is stale
    if (lastFetch < todayPublishMs) return false;
    // After 12:30, use a shorter 15-minute cooldown while today's menu is still missing
    return nowMs - lastFetch < 15 * 60 * 1000;
  }

  // Before 12:30 (or future date), keep 2.5-hour cooldown to avoid hammering
  return nowMs - lastFetch < 2.5 * 3600 * 1000;
}

export function findMenuForDate(records: DormMenuRecord[], targetDate: string): DailyMenu | null {
  if (!records || records.length === 0) return null;
  const cleanTarget = targetDate.trim();
  let match = records.find(
    (r) =>
      r.yayinda !== false &&
      (r.tarih?.trim() === cleanTarget || r.tarih?.startsWith(cleanTarget))
  );
  let isFallback = false;
  if (!match) {
    const valid = records
      .filter((r) => r.yayinda !== false && (r.aksam?.trim() || r.kahvalti?.trim()))
      .sort((a, b) => (b.tarih || "").localeCompare(a.tarih || ""));
    if (valid.length > 0) {
      match = valid[0];
      isFallback = true;
    }
  }
  if (!match) return null;
  const todayKey = turkeyDateKey();
  return {
    date: match.tarih,
    dinnerDishes: parseDishes(match.aksam),
    breakfastDishes: parseDishes(match.kahvalti),
    rawDinner: match.aksam || "",
    rawBreakfast: match.kahvalti || "",
    isToday: match.tarih?.trim() === todayKey,
    isFallback,
  };
}

export async function fetchDormMenu(force = false): Promise<DormMenuRecord[]> {
  const todayKey = turkeyDateKey();
  if (!force && isDormMenuFresh(todayKey)) {
    return loadDormMenuCache();
  }

  // If a native Tauri fetcher is registered on desktop, try it first
  if (nativeDormFetcher) {
    try {
      const raw = await nativeDormFetcher();
      if (raw) {
        const json: unknown = JSON.parse(raw);
        const records = extractDormMenuRecords(json);
        if (records && records.length > 0) {
          saveDormMenuCache(records);
          return records;
        }
      }
    } catch {
      // Continue to Worker HTTP fallback
    }
  }

  const suffix = force ? "?force=1" : "";
  const urls = [
    `/api/dorm-menu${suffix}`,
    `https://ack-deck-phone.ack-deck-cloud.workers.dev/api/dorm-menu${suffix}`,
  ];

  const target = getBrowserTarget();
  const globals = globalThis as unknown as DormBrowserTarget;
  const fetchOwner = typeof target.fetch === "function" ? target : globals;
  if (typeof fetchOwner.fetch === "function") {
    for (const url of urls) {
      try {
        const res = await fetchOwner.fetch(url, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (res.ok) {
          const json: unknown = await res.json();
          const records = extractDormMenuRecords(json);
          if (records && records.length > 0) {
            saveDormMenuCache(records);
            return records;
          }
        }
      } catch {
        // Continue to next URL
      }
    }
  }

  // Record fetch attempt timestamp even on failure so client doesn't hammer on rapid page switches
  try {
    const storage = getStorage();
    storage?.setItem(DORM_MENU_LAST_FETCH_KEY, String(Date.now()));
  } catch {}

  return loadDormMenuCache();
}

export function shouldNotifyMealNow(now = new Date()): boolean {
  try {
    const timeParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Istanbul",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const hour = Number(timeParts.find((p) => p.type === "hour")?.value ?? 0);
    const minute = Number(timeParts.find((p) => p.type === "minute")?.value ?? 0);
    // Fixed notification time: 12:30
    return hour > 12 || (hour === 12 && minute >= 30);
  } catch {
    const h = now.getHours();
    const m = now.getMinutes();
    return h > 12 || (h === 12 && m >= 30);
  }
}
