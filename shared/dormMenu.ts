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
    const raw = localStorage.getItem(DORM_MENU_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [];
}

export function saveDormMenuCache(records: DormMenuRecord[]): void {
  try {
    localStorage.setItem(DORM_MENU_CACHE_KEY, JSON.stringify(records));
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new Event("ack-dorm-menu-updated"));
    }
  } catch {}
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

export async function fetchDormMenu(): Promise<DormMenuRecord[]> {
  // If in desktop Tauri environment, fetch through native Rust command
  if (typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__)) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<string>("fetch_dorm_menu");
      if (raw) {
        const json = JSON.parse(raw);
        const records = Array.isArray(json?.records)
          ? json.records
          : Array.isArray(json?.menu?.kayitlar)
          ? json.menu.kayitlar
          : null;
        if (records && Array.isArray(records) && records.length > 0) {
          saveDormMenuCache(records);
          return records;
        }
      }
    } catch {
      // Continue to fetch via HTTP fallback
    }
  }

  const urls = [
    "https://ack-deck-phone.ack-deck-cloud.workers.dev/api/dorm-menu",
    "/api/dorm-menu",
    "https://altinkalemkarabuk.com/icerik/icerik.json?t=" + Date.now(),
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const json = await res.json();
        const records = Array.isArray(json?.records)
          ? json.records
          : Array.isArray(json?.menu?.kayitlar)
          ? json.menu.kayitlar
          : null;
        if (records && Array.isArray(records) && records.length > 0) {
          saveDormMenuCache(records);
          return records;
        }
      }
    } catch {
      // Continue to next URL
    }
  }

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
