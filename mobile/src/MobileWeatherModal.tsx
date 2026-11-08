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

        {/* 4 Metric Boxes (Hissedilen, Günün Değerleri, Nem, Rüzgar) */}
        <div className="mobile-weather-grid">
          <div className="mobile-weather-card">
            <span className="metric-label">Hissedilen</span>
            <strong className="metric-val">{apparent}°C</strong>
          </div>
          <div className="mobile-weather-card">
            <span className="metric-label">Günün Değerleri</span>
            <strong className="metric-val">
              {tempMax !== null && tempMin !== null ? `↑${tempMax}° / ↓${tempMin}°` : "—"}
            </strong>
          </div>
          <div className="mobile-weather-card">
            <span className="metric-label">Nem</span>
            <strong className="metric-val">{weather.humidity !== undefined ? `%${Math.round(weather.humidity)}` : "—"}</strong>
          </div>
          <div className="mobile-weather-card">
            <span className="metric-label">Rüzgar</span>
            <strong className="metric-val">{weather.windSpeed !== undefined ? `${Math.round(weather.windSpeed)} km/s` : "—"}</strong>
          </div>
        </div>

        {/* 24-Hour Forecast Scroll */}
        {weather.hourly && weather.hourly.length > 0 && (
          <div className="mobile-weather-hourly-wrap">
            <span className="mobile-weather-hourly-title">Günün Saatlik Akışı</span>
            <div className="mobile-weather-hourly-strip">
              {weather.hourly.map((h, i) => (
                <div key={i} className="mobile-weather-hour-box">
                  <span className="hour-time">{h.time}</span>
                  <span className="hour-symbol" aria-hidden="true">{weatherSymbol(h.code)}</span>
                  <strong className="hour-temp">{Math.round(h.temperature)}°</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mobile-weather-footer">
          <small>Open-Meteo · Gerçek Zamanlı Tahmin</small>
        </div>
      </div>
    </div>
  );
}
