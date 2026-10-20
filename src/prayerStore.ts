import { invoke } from "@tauri-apps/api/core";
import {
  type PrayerTimesConfig,
  type PrayerDayInfo,
  type PrayerLogDay,
  DEFAULT_PRAYER_CONFIG,
  calculatePrayerTimes,
  lookupTurkeyCity,
  validPrayerLog,
} from "../shared/prayerTimes";

const STORAGE_KEY = "ack-deck.prayer-config.v1";
export const PRAYER_LOGS_KEY = "ack-deck.prayer-logs.v1";

export function loadPrayerLogs(): { entries: PrayerLogDay[]; preserved: unknown[]; locked: boolean; warning: string | null } {
  try {
    const raw = window.localStorage.getItem(PRAYER_LOGS_KEY);
    if (raw === null) return { entries: [], preserved: [], locked: false, warning: null };
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) throw Error();
    const entries: PrayerLogDay[] = [], preserved: unknown[] = [], ids = new Set<string>();
    for (const row of value) if (validPrayerLog(row) && !ids.has(row.id)) { entries.push(row); ids.add(row.id); } else preserved.push(row);
    return { entries, preserved, locked: false, warning: preserved.length ? "Bazı namaz takip kayıtları okunamadı; kayıtlar korunuyor." : null };
  } catch {
    return { entries: [], preserved: [], locked: true, warning: "Namaz takip kayıtları okunamadı; mevcut kayıtlar korunuyor." };
  }
}

export function savePrayerLogs(entries: PrayerLogDay[], loaded = loadPrayerLogs()): boolean {
  if (loaded.locked || entries.length > 50000 || !entries.every(validPrayerLog) || new Set(entries.map(p => p.id)).size !== entries.length) return false;
  try {
    window.localStorage.setItem(PRAYER_LOGS_KEY, JSON.stringify([...entries, ...loaded.preserved]));
    window.dispatchEvent(new Event("ack-data-changed"));
    window.dispatchEvent(new Event("ack-prayer-logs-changed"));
    return true;
  } catch {
    return false;
  }
}

export function loadPrayerConfig(): PrayerTimesConfig {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new Event("ack-prayer-config-changed"));
    void invoke("phone_request", { operation: "heartbeat", body: { prayerConfig: config } }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export async function geocodeCity(cityName: string): Promise<{ city: string; lat: number; lng: number } | null> {
  const query = cityName.trim();
  if (!query) return null;
  const builtin = lookupTurkeyCity(query);
  if (builtin) return builtin;
  // Try native Tauri backend first (bypasses browser CSP restrictions)
  try {
    const res = await invoke<{ city: string; latitude: number; longitude: number }>("geocode_city", { city: query });
    if (res && typeof res.latitude === "number" && typeof res.longitude === "number") {
      return {
        city: res.city || query,
        lat: res.latitude,
        lng: res.longitude,
      };
    }
  } catch {
    // Fallback for Web/Browser environment if not in Tauri
  }

  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=tr`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.results?.[0];
    if (!result) return null;
    return {
      city: result.name || query,
      lat: result.latitude,
      lng: result.longitude,
    };
  } catch {
    return null;
  }
}

export function getTodayPrayerInfo(config: PrayerTimesConfig, date: Date = new Date()): PrayerDayInfo {
  return calculatePrayerTimes(config.latitude, config.longitude, date, config.city);
}

export type PrayerReminderPayload = {
  id: string;
  text: string;
  dueAt: number;
};

/**
 * Returns pending reminders for prayer times based on config.
 * Id format: "prayer:<prayerName>:<timestamp>" or "prayer-lead:<minutes>:<prayerName>:<timestamp>"
 */
export function pendingPrayerReminders(
  config: PrayerTimesConfig,
  now: Date = new Date()
): PrayerReminderPayload[] {
  if (!config.notifyAtTime && config.notifyBeforeMinutes <= 0) {
    return [];
  }

  const results: PrayerReminderPayload[] = [];
  const nowMs = now.getTime();

  // Check today and tomorrow
  for (const offset of [0, 1]) {
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + offset);
    const dayInfo = calculatePrayerTimes(config.latitude, config.longitude, targetDate, config.city);

    for (const item of dayInfo.items) {
      // 1. Exact prayer time notification
      if (config.notifyAtTime && item.timestamp > nowMs) {
        results.push({
          id: `prayer:${item.name}:${item.timestamp}`,
          text: `${item.label} vakti girdi (${item.time}).`,
          dueAt: item.timestamp,
        });
      }

      // 2. Early notification (e.g. 15 min before)
      if (config.notifyBeforeMinutes > 0) {
        const leadMs = config.notifyBeforeMinutes * 60 * 1000;
        const leadDueAt = item.timestamp - leadMs;
        if (leadDueAt > nowMs) {
          results.push({
            id: `prayer-lead:${config.notifyBeforeMinutes}:${item.name}:${item.timestamp}`,
            text: `${item.label} vaktine ${config.notifyBeforeMinutes} dakika kaldı (${item.time}).`,
            dueAt: leadDueAt,
          });
        }
      }
    }
  }

  return results;
}
