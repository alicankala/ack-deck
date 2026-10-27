export type WeatherData = {
  city: string;
  temperature: number;
  code: number;
  desc: string;
  symbol: string;
  apparentTemperature?: number;
  humidity?: number;
  windSpeed?: number;
  tempMax?: number;
  tempMin?: number;
  hourly?: { time: string; temperature: number; code: number }[];
};

export const WEATHER_CACHE_KEY = "ack-deck.mobile-weather-cache.v1";

export function loadWeatherCache(): WeatherData | null {
  try {
    const raw = localStorage.getItem(WEATHER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.city === "string" && typeof parsed.temperature === "number") {
      return parsed;
    }
  } catch {}
  return null;
}

export function saveWeatherCache(data: WeatherData): void {
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(data));
  } catch {}
}

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

export function weatherSymbol(code: number): string {
  if (code === 0) return "☀️";
  if (code === 1) return "🌤️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if (code >= 61 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "🌨️";
  if (code >= 80 && code <= 82) return "🌧️";
  if ([85, 86].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌡️";
}

export async function fetchMobileWeather(city: string, lat?: number, lng?: number): Promise<WeatherData | null> {
  // 1. Try local worker endpoint first (same-origin, 100% bypasses any CORS/CSP)
  try {
    const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
    if (res.ok) {
      const data = await res.json() as WeatherData;
      if (data && typeof data.temperature === "number") {
        saveWeatherCache(data);
        return data;
      }
    }
  } catch {}

  // 2. Direct Open-Meteo fallback
  if (typeof lat === "number" && typeof lng === "number") {
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&hourly=temperature_2m,weather_code&forecast_hours=24&timezone=auto`
      );
      if (res.ok) {
        const data = await res.json() as any;
        const current = data.current;
        if (current) {
          const temp = Math.round(Number(current.temperature_2m) * 10) / 10;
          const code = Number(current.weather_code);
          const apparentTemperature = current.apparent_temperature !== undefined ? Math.round(Number(current.apparent_temperature) * 10) / 10 : temp;
          const humidity = current.relative_humidity_2m !== undefined ? Math.round(Number(current.relative_humidity_2m)) : undefined;
          const windSpeed = current.wind_speed_10m !== undefined ? Math.round(Number(current.wind_speed_10m)) : undefined;
          const tempMax = Array.isArray(data.daily?.temperature_2m_max) ? Math.round(Number(data.daily.temperature_2m_max[0])) : undefined;
          const tempMin = Array.isArray(data.daily?.temperature_2m_min) ? Math.round(Number(data.daily.temperature_2m_min[0])) : undefined;
          const hourly = Array.isArray(data.hourly?.time) ? data.hourly.time.slice(0, 12).map((t: string, idx: number) => ({
            time: t.slice(11, 16),
            temperature: Math.round(Number(data.hourly.temperature_2m[idx])),
            code: Number(data.hourly.weather_code[idx])
          })) : [];
          const w: WeatherData = {
            city,
            temperature: temp,
            code,
            desc: weatherDescription(code),
            symbol: weatherSymbol(code),
            apparentTemperature,
            humidity,
            windSpeed,
            tempMax,
            tempMin,
            hourly,
          };
          saveWeatherCache(w);
          return w;
        }
      }
    } catch {}
  }

  return loadWeatherCache();
}
