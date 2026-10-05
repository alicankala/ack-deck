import { invoke } from "@tauri-apps/api/core";
const KEY = "ack-deck.weather-city.v1";
export const FOOTER_REFRESH_MS = 30 * 60 * 1000;
export type Weather = { city: string; temperature: number; code: number };
export type Rates = { date: string; rates: { code: string; buying: number; selling: number }[] };
export function loadWeatherCity(): string {
  try { const raw = window.localStorage.getItem(KEY); if (raw === null) return "Ankara"; const value = JSON.parse(raw); return validCity(value) ? value.trim() : "Ankara"; } catch { return "Ankara"; }
}
function validCity(value: unknown): value is string { return typeof value === "string" && !!value.trim() && [...value.trim()].length <= 80 && !/[\u0000-\u001f\u007f]/.test(value); }
export function saveWeatherCity(city: string): boolean {
  if (!validCity(city)) return false;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw !== null && !validCity(JSON.parse(raw))) return false;
    window.localStorage.setItem(KEY, JSON.stringify(city.trim()));
    window.dispatchEvent(new Event("ack-weather-city-changed")); return true;
  } catch { return false; }
}
export const fetchWeather = (city: string) => invoke<Weather>("footer_weather", { city });
export const fetchRates = () => invoke<Rates>("footer_rates");
export function weatherDescription(code: number): string {
  if (code === 0) return "Açık";
  if (code === 1) return "Az bulutlu";
  if (code === 2) return "Parçalı bulutlu";
  if (code === 3) return "Bulutlu";
  if ([45, 48].includes(code)) return "Sisli";
  if (code >= 51 && code <= 57) return "Çiseleme";
  if (code >= 61 && code <= 67) return "Yağmurlu";
  if (code >= 71 && code <= 77) return "Karlı";
  if (code >= 80 && code <= 82) return "Sağanak";
  if ([85, 86].includes(code)) return "Kar sağanağı";
  if ([95, 96, 99].includes(code)) return "Gök gürültülü";
  return "Durum alınamadı";
}
