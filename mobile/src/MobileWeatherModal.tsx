import type { WeatherData } from "../../shared/weather";
import { weatherSymbol } from "../../shared/weather";

export function MobileWeatherModal({
  weather,
  onClose,
}: {
  weather: WeatherData;
  onClose: () => void;
}) {
  const currentTemp = Math.round(weather.temperature);
  const apparent = weather.apparentTemperature !== undefined ? Math.round(weather.apparentTemperature) : currentTemp;
  const tempMax = weather.tempMax !== undefined ? Math.round(weather.tempMax) : null;
  const tempMin = weather.tempMin !== undefined ? Math.round(weather.tempMin) : null;

  return (
    <div className="mobile-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Detaylı Hava Durumu">
      <div className="mobile-weather-modal surface" onClick={(e) => e.stopPropagation()}>
        {/* Header Row */}
        <div className="mobile-weather-top">
          <div className="mobile-weather-lead">
            <span className="mobile-weather-large-icon" aria-hidden="true">
              {weather.symbol}
            </span>
            <div>
              <div className="mobile-weather-temp-row">
                <span className="mobile-weather-temp">{currentTemp}°C</span>
                <span className="mobile-weather-desc">{weather.desc}</span>
              </div>
              <div className="mobile-weather-city-row">
                <span className="mobile-weather-city-name">{weather.city}</span>
              </div>
            </div>
          </div>
          <button type="button" className="mobile-modal-close" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>

        {/* 4 Metric Boxes */}
        <div className="mobile-weather-grid">
          <div className="mobile-weather-card">
            <span className="metric-label">Hissedilen</span>
            <span className="metric-value">{apparent}°C</span>
          </div>
          <div className="mobile-weather-card">
            <span className="metric-label">En Yüksek / En Düşük</span>
            <span className="metric-value">
              {tempMax !== null && tempMin !== null ? `${tempMax}° / ${tempMin}°` : "—"}
            </span>
          </div>
          <div className="mobile-weather-card">
            <span className="metric-label">Rüzgar Hızı</span>
            <span className="metric-value">{weather.windSpeed !== undefined ? `${Math.round(weather.windSpeed)} km/s` : "—"}</span>
          </div>
          <div className="mobile-weather-card">
            <span className="metric-label">Nem</span>
            <span className="metric-value">{weather.humidity !== undefined ? `%${Math.round(weather.humidity)}` : "—"}</span>
          </div>
        </div>

        {/* 24-Hour Forecast Scroll */}
        {weather.hourly && weather.hourly.length > 0 && (
          <div className="mobile-weather-forecast-section">
            <h4 className="forecast-title">24 Saatlik Tahmin</h4>
            <div className="mobile-weather-hourly-scroll">
              {weather.hourly.map((h, i) => (
                <div key={i} className="hourly-forecast-col">
                  <span className="hourly-time">{h.time}</span>
                  <span className="hourly-icon" aria-hidden="true">{weatherSymbol(h.code)}</span>
                  <span className="hourly-temp">{Math.round(h.temperature)}°</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
