import { Coordinates, CalculationMethod, PrayerTimes } from "adhan";

export type PrayerTimesConfig = {
  city: string;
  latitude: number;
  longitude: number;
  notifyAtTime: boolean;
  notifyBeforeMinutes: number; // 0 for off, or 5, 10, 15, 20, 30, 45
};

export type PrayerName = "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha";

export type PrayerItem = {
  name: PrayerName;
  label: string;
  time: string; // "HH:MM"
  timestamp: number; // ms
};

export type KerahatStatus = {
  inKerahat: boolean;
  kind?: "sunrise" | "ishtiwa" | "isfar";
  label?: string;
  description?: string;
  remainingMs?: number;
};

export type PrayerDayInfo = {
  city: string;
  dateStr: string;
  items: PrayerItem[];
  currentPrayer: PrayerItem | null;
  nextPrayer: PrayerItem | null;
  timeToNextMs: number;
  kerahat: KerahatStatus;
};

export const PRAYER_NAMES_TR: Record<PrayerName, string> = {
  fajr: "İmsak",
  sunrise: "Güneş",
  dhuhr: "Öğle",
  asr: "İkindi",
  maghrib: "Akşam",
  isha: "Yatsı",
};

export const KERAHAT_DURATION_MINUTES = 45;

export const DEFAULT_PRAYER_CONFIG: PrayerTimesConfig = {
  city: "Ankara",
  latitude: 39.91987,
  longitude: 32.85427,
  notifyAtTime: true,
  notifyBeforeMinutes: 15,
};

function formatHHMM(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function calculatePrayerTimes(
  lat: number,
  lng: number,
  date: Date = new Date(),
  cityName = "Ankara"
): PrayerDayInfo {
  const coords = new Coordinates(lat, lng);
  const params = CalculationMethod.Turkey();
  const pt = new PrayerTimes(coords, date, params);

  const items: PrayerItem[] = [
    { name: "fajr", label: PRAYER_NAMES_TR.fajr, time: formatHHMM(pt.fajr), timestamp: pt.fajr.getTime() },
    { name: "sunrise", label: PRAYER_NAMES_TR.sunrise, time: formatHHMM(pt.sunrise), timestamp: pt.sunrise.getTime() },
    { name: "dhuhr", label: PRAYER_NAMES_TR.dhuhr, time: formatHHMM(pt.dhuhr), timestamp: pt.dhuhr.getTime() },
    { name: "asr", label: PRAYER_NAMES_TR.asr, time: formatHHMM(pt.asr), timestamp: pt.asr.getTime() },
    { name: "maghrib", label: PRAYER_NAMES_TR.maghrib, time: formatHHMM(pt.maghrib), timestamp: pt.maghrib.getTime() },
    { name: "isha", label: PRAYER_NAMES_TR.isha, time: formatHHMM(pt.isha), timestamp: pt.isha.getTime() },
  ];

  const nowMs = date.getTime();

  // Find next prayer today or next day's fajr
  let nextPrayer: PrayerItem | null = null;
  let currentPrayer: PrayerItem | null = null;

  for (let i = 0; i < items.length; i++) {
    if (items[i].timestamp > nowMs) {
      nextPrayer = items[i];
      currentPrayer = i > 0 ? items[i - 1] : null;
      break;
    }
  }

  if (!nextPrayer) {
    // Past isha, next prayer is tomorrow's fajr
    currentPrayer = items[items.length - 1];
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowPt = new PrayerTimes(coords, tomorrow, params);
    nextPrayer = {
      name: "fajr",
      label: PRAYER_NAMES_TR.fajr,
      time: formatHHMM(tomorrowPt.fajr),
      timestamp: tomorrowPt.fajr.getTime(),
    };
  }

  const timeToNextMs = Math.max(0, nextPrayer.timestamp - nowMs);

  // Kerahat Calculations:
  // 1. Sunrise kerahat: [sunrise, sunrise + 45 min]
  // 2. Ishtiwa (Zeval) kerahat: [dhuhr - 45 min, dhuhr]
  // 3. Isfar kerahat: [maghrib - 45 min, maghrib]
  const kerahatMs = KERAHAT_DURATION_MINUTES * 60 * 1000;
  let kerahat: KerahatStatus = { inKerahat: false };

  const sunriseStart = pt.sunrise.getTime();
  const sunriseEnd = sunriseStart + kerahatMs;

  const dhuhrEnd = pt.dhuhr.getTime();
  const dhuhrStart = dhuhrEnd - kerahatMs;

  const maghribEnd = pt.maghrib.getTime();
  const maghribStart = maghribEnd - kerahatMs;

  if (nowMs >= sunriseStart && nowMs < sunriseEnd) {
    kerahat = {
      inKerahat: true,
      kind: "sunrise",
      label: "Güneş Doğuş Kerahati",
      description: "Güneş doğduktan sonraki mekruh vakit",
      remainingMs: sunriseEnd - nowMs,
    };
  } else if (nowMs >= dhuhrStart && nowMs < dhuhrEnd) {
    kerahat = {
      inKerahat: true,
      kind: "ishtiwa",
      label: "İstiva (Zeval) Kerahati",
      description: "Öğle ezanından önceki mekruh vakit",
      remainingMs: dhuhrEnd - nowMs,
    };
  } else if (nowMs >= maghribStart && nowMs < maghribEnd) {
    kerahat = {
      inKerahat: true,
      kind: "isfar",
      label: "İsfar (Batış) Kerahati",
      description: "Akşam ezanından önceki mekruh vakit",
      remainingMs: maghribEnd - nowMs,
    };
  }

  const dateStr = date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });

  return {
    city: cityName,
    dateStr,
    items,
    currentPrayer,
    nextPrayer,
    timeToNextMs,
    kerahat,
  };
}

export function formatRemainingTime(ms: number): string {
  const totalMinutes = Math.floor(ms / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours} sa ${minutes} dk`;
  }
  return `${minutes} dk`;
}

export const PRAYER_STORAGE_KEY = "ack-deck.prayer-config.v1";

export function loadPrayerConfig(): PrayerTimesConfig {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(PRAYER_STORAGE_KEY) : null;
    if (!raw) return { ...DEFAULT_PRAYER_CONFIG };
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.city === "string" &&
      typeof parsed.latitude === "number" &&
      typeof parsed.longitude === "number"
    ) {
      return {
        city: parsed.city.trim() || DEFAULT_PRAYER_CONFIG.city,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        notifyAtTime: parsed.notifyAtTime ?? DEFAULT_PRAYER_CONFIG.notifyAtTime,
        notifyBeforeMinutes: typeof parsed.notifyBeforeMinutes === "number" ? parsed.notifyBeforeMinutes : DEFAULT_PRAYER_CONFIG.notifyBeforeMinutes,
      };
    }
    return { ...DEFAULT_PRAYER_CONFIG };
  } catch {
    return { ...DEFAULT_PRAYER_CONFIG };
  }
}

export function savePrayerConfig(config: PrayerTimesConfig): boolean {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PRAYER_STORAGE_KEY, JSON.stringify(config));
      window.dispatchEvent(new Event("ack-prayer-config-changed"));
    }
    return true;
  } catch {
    return false;
  }
}

export async function geocodeCityWeb(cityName: string): Promise<{ city: string; lat: number; lng: number } | null> {
  const query = cityName.trim();
  if (!query) return null;
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=tr`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.results?.[0];
    if (result && typeof result.latitude === "number" && typeof result.longitude === "number") {
      return {
        city: result.name || query,
        lat: result.latitude,
        lng: result.longitude,
      };
    }
    return null;
  } catch {
    return null;
  }
}
