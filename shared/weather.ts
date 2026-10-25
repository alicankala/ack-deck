export type WeatherData = {
  city: string;
  temperature: number;
  code: number;
  desc: string;
  symbol: string;
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
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=auto`
      );
      if (res.ok) {
        const data = await res.json();
        const current = data.current;
        if (current) {
          const temp = Math.round(Number(current.temperature_2m) * 10) / 10;
          const code = Number(current.weather_code);
          const w: WeatherData = {
            city,
            temperature: temp,
            code,
            desc: weatherDescription(code),
            symbol: weatherSymbol(code),
          };
          saveWeatherCache(w);
          return w;
        }
      }
    } catch {}
  }

  return loadWeatherCache();
}
