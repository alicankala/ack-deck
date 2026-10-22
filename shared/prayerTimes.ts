import { Coordinates, CalculationMethod, PrayerTimes, Madhab } from "adhan";

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
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map(v => [v.type, v.value]));
  return `${p.hour}:${p.minute}`;
}

export function calculatePrayerTimes(
  lat: number,
  lng: number,
  date: Date = new Date(),
  cityName = "Ankara"
): PrayerDayInfo {
  const coords = new Coordinates(lat, lng);
  const params = CalculationMethod.Turkey();
  params.madhab = Madhab.Hanafi;
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

  const dateStr = date.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", weekday: "long" });

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

export type TrackedPrayerName = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
export type PrayerStatus = "prayed" | "missed";
export type DailyNoteItem = { id: string; text: string; done: boolean };

export type PrayerLogDay = {
  id: string; // YYYY-MM-DD
  date: string; // YYYY-MM-DD
  prayers: Partial<Record<TrackedPrayerName, PrayerStatus>>;
  notes: DailyNoteItem[];
  updatedAt: number;
};

export const TRACKED_PRAYERS: { name: TrackedPrayerName; label: string }[] = [
  { name: "fajr", label: "Sabah" },
  { name: "dhuhr", label: "Öğle" },
  { name: "asr", label: "İkindi" },
  { name: "maghrib", label: "Akşam" },
  { name: "isha", label: "Yatsı" },
];

export function validPrayerLog(value: unknown): value is PrayerLogDay {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v);
  if (keys.length !== 5 || !["id", "date", "prayers", "notes", "updatedAt"].every(k => k in v)) return false;
  if (typeof v.id !== "string" || typeof v.date !== "string" || v.id !== v.date) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return false;
  const parsed = new Date(v.date + "T12:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== v.date) return false;
  if (typeof v.updatedAt !== "number" || !Number.isSafeInteger(v.updatedAt) || v.updatedAt < 0) return false;
  if (!v.prayers || typeof v.prayers !== "object" || Array.isArray(v.prayers)) return false;
  const p = v.prayers as Record<string, unknown>;
  const validPrayerKeys = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
  if (!Object.entries(p).every(([k, status]) => validPrayerKeys.includes(k) && (status === "prayed" || status === "missed"))) return false;
  if (!Array.isArray(v.notes) || v.notes.length > 30) return false;
  if (new Set(v.notes.map((n: any) => n?.id)).size !== v.notes.length) return false;
  return v.notes.every((n: unknown) => {
    if (!n || typeof n !== "object" || Array.isArray(n)) return false;
    const item = n as Record<string, unknown>;
    return (
      Object.keys(item).length === 3 &&
      typeof item.id === "string" &&
      /^[a-zA-Z0-9_.-]{1,128}$/.test(item.id) &&
      typeof item.text === "string" &&
      item.text.trim().length > 0 &&
      item.text.length <= 240 &&
      !/AIza[\w-]{30,}/.test(item.text) &&
      typeof item.done === "boolean"
    );
  });
}

export function createEmptyPrayerLog(dateStr: string): PrayerLogDay {
  return {
    id: dateStr,
    date: dateStr,
    prayers: {},
    notes: [],
    updatedAt: Date.now(),
  };
}

export function calculatePrayerStats(logs: PrayerLogDay[], todayDate: string) {
  const map = new Map(logs.map(l => [l.date, l]));
  let totalPrayed = 0;
  let totalMissed = 0;
  let fullDays = 0;

  for (const log of logs) {
    let dayPrayed = 0;
    for (const tp of TRACKED_PRAYERS) {
      const s = log.prayers[tp.name];
      if (s === "prayed") {
        totalPrayed++;
        dayPrayed++;
      } else if (s === "missed") {
        totalMissed++;
      }
    }
    if (dayPrayed === 5) fullDays++;
  }

  // Last 7 days summary
  const last7Days: { date: string; label: string; prayedCount: number; missedCount: number }[] = [];
  const base = new Date(todayDate + "T12:00:00");
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const log = map.get(key);
    let prayedCount = 0;
    let missedCount = 0;
    if (log) {
      for (const tp of TRACKED_PRAYERS) {
        if (log.prayers[tp.name] === "prayed") prayedCount++;
        else if (log.prayers[tp.name] === "missed") missedCount++;
      }
    }
    const label = i === 0 ? "Bugün" : d.toLocaleDateString("tr-TR", { weekday: "short" });
    last7Days.push({ date: key, label, prayedCount, missedCount });
  }

  return {
    totalPrayed,
    totalMissed,
    fullDays,
    last7Days,
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

export const TURKEY_CITIES: Record<string, { city: string; lat: number; lng: number }> = {
  adana: { city: "Adana", lat: 37.0, lng: 35.3213 },
  adiyaman: { city: "Adıyaman", lat: 37.7648, lng: 38.2786 },
  afyonkarahisar: { city: "Afyonkarahisar", lat: 38.7507, lng: 30.5567 },
  afyon: { city: "Afyonkarahisar", lat: 38.7507, lng: 30.5567 },
  agri: { city: "Ağrı", lat: 39.7191, lng: 43.0503 },
  aksaray: { city: "Aksaray", lat: 38.3687, lng: 34.037 },
  amasya: { city: "Amasya", lat: 40.6499, lng: 35.8353 },
  ankara: { city: "Ankara", lat: 39.91987, lng: 32.85427 },
  antalya: { city: "Antalya", lat: 36.8969, lng: 30.7133 },
  ardahan: { city: "Ardahan", lat: 41.1105, lng: 42.7022 },
  artvin: { city: "Artvin", lat: 41.1828, lng: 41.8183 },
  aydin: { city: "Aydın", lat: 37.856, lng: 27.8416 },
  balikesir: { city: "Balıkesir", lat: 39.6484, lng: 27.8826 },
  bartin: { city: "Bartın", lat: 41.6344, lng: 32.3375 },
  batman: { city: "Batman", lat: 37.8812, lng: 41.1351 },
  bayburt: { city: "Bayburt", lat: 40.2552, lng: 40.2249 },
  bilecik: { city: "Bilecik", lat: 40.1451, lng: 29.9799 },
  bingol: { city: "Bingöl", lat: 38.8853, lng: 40.4983 },
  bitlis: { city: "Bitlis", lat: 38.4006, lng: 42.1095 },
  bolu: { city: "Bolu", lat: 40.7392, lng: 31.6089 },
  burdur: { city: "Burdur", lat: 37.7203, lng: 30.2908 },
  bursa: { city: "Bursa", lat: 40.1885, lng: 29.061 },
  canakkale: { city: "Çanakkale", lat: 40.1553, lng: 26.4142 },
  cankiri: { city: "Çankırı", lat: 40.6013, lng: 33.6134 },
  corum: { city: "Çorum", lat: 40.5506, lng: 34.9556 },
  denizli: { city: "Denizli", lat: 37.7765, lng: 29.0864 },
  diyarbakir: { city: "Diyarbakır", lat: 37.9144, lng: 40.2306 },
  duzce: { city: "Düzce", lat: 40.8438, lng: 31.1565 },
  edirne: { city: "Edirne", lat: 41.6771, lng: 26.5557 },
  elazig: { city: "Elazığ", lat: 38.681, lng: 39.2264 },
  erzincan: { city: "Erzincan", lat: 39.75, lng: 39.5 },
  erzurum: { city: "Erzurum", lat: 39.9, lng: 41.27 },
  eskisehir: { city: "Eskişehir", lat: 39.7767, lng: 30.5206 },
  gaziantep: { city: "Gaziantep", lat: 37.0662, lng: 37.3833 },
  antep: { city: "Gaziantep", lat: 37.0662, lng: 37.3833 },
  giresun: { city: "Giresun", lat: 40.9128, lng: 38.3895 },
  gumushane: { city: "Gümüşhane", lat: 40.4603, lng: 39.4814 },
  hakkari: { city: "Hakkâri", lat: 37.5833, lng: 43.7333 },
  hatay: { city: "Hatay", lat: 36.2021, lng: 36.1606 },
  antakya: { city: "Hatay", lat: 36.2021, lng: 36.1606 },
  igdir: { city: "Iğdır", lat: 39.9167, lng: 44.0333 },
  isparta: { city: "Isparta", lat: 37.7648, lng: 30.5566 },
  istanbul: { city: "İstanbul", lat: 41.0082, lng: 28.9784 },
  izmir: { city: "İzmir", lat: 38.4237, lng: 27.1428 },
  kahramanmaras: { city: "Kahramanmaraş", lat: 37.5858, lng: 36.9371 },
  maras: { city: "Kahramanmaraş", lat: 37.5858, lng: 36.9371 },
  karabuk: { city: "Karabük", lat: 41.20488, lng: 32.62768 },
  safranbolu: { city: "Safranbolu", lat: 41.2508, lng: 32.6942 },
  karaman: { city: "Karaman", lat: 37.1759, lng: 33.2287 },
  kars: { city: "Kars", lat: 40.6013, lng: 43.0975 },
  kastamonu: { city: "Kastamonu", lat: 41.3887, lng: 33.7827 },
  kayseri: { city: "Kayseri", lat: 38.7312, lng: 35.4787 },
  kilis: { city: "Kilis", lat: 36.7184, lng: 37.1212 },
  kirikkale: { city: "Kırıkkale", lat: 39.8468, lng: 33.5153 },
  kirklareli: { city: "Kırklareli", lat: 41.7333, lng: 27.2167 },
  kirsehir: { city: "Kırşehir", lat: 39.1425, lng: 34.1709 },
  kocaeli: { city: "Kocaeli", lat: 40.8533, lng: 29.8815 },
  izmit: { city: "Kocaeli", lat: 40.8533, lng: 29.8815 },
  konya: { city: "Konya", lat: 37.8667, lng: 32.4833 },
  kutahya: { city: "Kütahya", lat: 39.4167, lng: 29.9833 },
  malatya: { city: "Malatya", lat: 38.3552, lng: 38.3095 },
  manisa: { city: "Manisa", lat: 38.6191, lng: 27.4289 },
  mardin: { city: "Mardin", lat: 37.3212, lng: 40.7245 },
  mersin: { city: "Mersin", lat: 36.8, lng: 34.6333 },
  icel: { city: "Mersin", lat: 36.8, lng: 34.6333 },
  mugla: { city: "Muğla", lat: 37.2153, lng: 28.3636 },
  mus: { city: "Muş", lat: 38.9462, lng: 41.7539 },
  nevsehir: { city: "Nevşehir", lat: 38.6244, lng: 34.7144 },
  nigde: { city: "Niğde", lat: 37.9667, lng: 34.6833 },
  ordu: { city: "Ordu", lat: 40.9839, lng: 37.8764 },
  osmaniye: { city: "Osmaniye", lat: 37.0742, lng: 36.2478 },
  rize: { city: "Rize", lat: 41.0201, lng: 40.5234 },
  sakarya: { city: "Sakarya", lat: 40.7569, lng: 30.3783 },
  adapazari: { city: "Sakarya", lat: 40.7569, lng: 30.3783 },
  samsun: { city: "Samsun", lat: 41.2867, lng: 36.33 },
  sanliurfa: { city: "Şanlıurfa", lat: 37.1591, lng: 38.7969 },
  urfa: { city: "Şanlıurfa", lat: 37.1591, lng: 38.7969 },
  siirt: { city: "Siirt", lat: 37.9333, lng: 41.95 },
  sinop: { city: "Sinop", lat: 42.0231, lng: 35.1531 },
  sirnak: { city: "Şırnak", lat: 37.5164, lng: 42.4611 },
  sivas: { city: "Sivas", lat: 39.7477, lng: 37.0179 },
  tekirdag: { city: "Tekirdağ", lat: 40.9833, lng: 27.5167 },
  tokat: { city: "Tokat", lat: 40.3167, lng: 36.55 },
  trabzon: { city: "Trabzon", lat: 41.0015, lng: 39.7178 },
  tunceli: { city: "Tunceli", lat: 39.1079, lng: 39.5401 },
  usak: { city: "Uşak", lat: 38.6823, lng: 29.4082 },
  van: { city: "Van", lat: 38.4891, lng: 43.4089 },
  yalova: { city: "Yalova", lat: 40.65, lng: 29.2667 },
  yozgat: { city: "Yozgat", lat: 39.8181, lng: 34.8147 },
  zonguldak: { city: "Zonguldak", lat: 41.4564, lng: 31.7987 },
};

export function lookupTurkeyCity(cityName: string): { city: string; lat: number; lng: number } | null {
  const key = cityName
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/û/g, "u")
    .replace(/[^a-z]/g, "");
  return TURKEY_CITIES[key] ?? null;
}

export async function geocodeCityWeb(cityName: string): Promise<{ city: string; lat: number; lng: number } | null> {
  const query = cityName.trim();
  if (!query) return null;
  const builtin = lookupTurkeyCity(query);
  if (builtin) return builtin;
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
