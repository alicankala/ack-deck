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
  } catch {}
}

export function findMenuForDate(records: DormMenuRecord[], targetDate: string): DailyMenu | null {
  const match = records.find((r) => r.tarih === targetDate && r.yayinda !== false);
  if (!match) return null;
  const todayKey = turkeyDateKey();
  return {
    date: match.tarih,
    dinnerDishes: parseDishes(match.aksam),
    breakfastDishes: parseDishes(match.kahvalti),
    rawDinner: match.aksam || "",
    rawBreakfast: match.kahvalti || "",
    isToday: match.tarih === todayKey,
  };
}

export async function fetchDormMenu(): Promise<DormMenuRecord[]> {
  const urls = [
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
