export type WeatherData = {
  city: string;
  temperature: number;
  code: number;
  desc: string;
  symbol: string;
};

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

export async function fetchMobileWeather(city: string, lat: number, lng: number): Promise<WeatherData | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=auto`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const current = data.current;
    if (!current) return null;
    const temp = Math.round(Number(current.temperature_2m) * 10) / 10;
    const code = Number(current.weather_code);
    return {
      city,
      temperature: temp,
      code,
      desc: weatherDescription(code),
      symbol: weatherSymbol(code),
    };
  } catch {
    return null;
  }
}
