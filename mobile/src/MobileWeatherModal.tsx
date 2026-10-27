import { useState, type FormEvent } from "react";
import type { WeatherData } from "../../shared/weather";
import { weatherSymbol } from "../../shared/weather";

export function MobileWeatherModal({
  weather,
  onClose,
  onChangeCity,
}: {
  weather: WeatherData;
  onClose: () => void;
  onChangeCity: (newCity: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [cityDraft, setCityDraft] = useState(weather.city);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const currentTemp = Math.round(weather.temperature);
  const apparent = weather.apparentTemperature !== undefined ? Math.round(weather.apparentTemperature) : currentTemp;
  const tempMax = weather.tempMax !== undefined ? Math.round(weather.tempMax) : null;
  const tempMin = weather.tempMin !== undefined ? Math.round(weather.tempMin) : null;

  async function handleCitySubmit(e: FormEvent) {
    e.preventDefault();
    const clean = cityDraft.trim();
    if (!clean) return;
    setBusy(true);
    setError("");
    try {
      await onChangeCity(clean);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Şehir güncellenemedi.");
    } finally {
      setBusy(false);
    }
  }

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
              {!editing ? (
                <div className="mobile-weather-city-row">
                  <span className="mobile-weather-city-name">{weather.city}</span>
                  <button
                    type="button"
                    className="mobile-weather-change-btn"
                    onClick={() => {
                      setEditing(true);
                      setCityDraft(weather.city);
                    }}
                  >
                    ✏️ Şehir Değiştir
                  </button>
                </div>
              ) : (
                <form className="mobile-weather-city-form" onSubmit={handleCitySubmit}>
                  <input
                    type="text"
                    value={cityDraft}
                    onChange={(e) => setCityDraft(e.target.value)}
                    placeholder="Şehir adı (örn. Karabük)"
                    maxLength={50}
                    autoFocus
                  />
                  <div className="city-form-btns">
                    <button type="submit" disabled={busy} className="mobile-button-primary">
                      {busy ? "…" : "Kaydet"}
                    </button>
                    <button type="button" disabled={busy} onClick={() => setEditing(false)} className="mobile-button-secondary">
                      İptal
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
          <button type="button" className="mobile-modal-close" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>

        {error && <p className="mobile-weather-error">{error}</p>}

        {/* 4 Metric Boxes */}
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
            <strong className="metric-val">{weather.humidity !== undefined ? `%${weather.humidity}` : "—"}</strong>
          </div>
          <div className="mobile-weather-card">
            <span className="metric-label">Rüzgar</span>
            <strong className="metric-val">
              {weather.windSpeed !== undefined ? `${Math.round(weather.windSpeed)} km/s` : "—"}
            </strong>
          </div>
        </div>

        {/* Hourly Forecast */}
        {weather.hourly && weather.hourly.length > 0 && (
          <div className="mobile-weather-hourly-wrap">
            <span className="mobile-weather-hourly-title">Günün Saatlik Akışı</span>
            <div className="mobile-weather-hourly-strip">
              {weather.hourly.slice(0, 10).map((hour, idx) => (
                <div key={idx} className="mobile-weather-hour-box">
                  <span className="hour-time">{hour.time}</span>
                  <span className="hour-symbol">{weatherSymbol(hour.code)}</span>
                  <strong className="hour-temp">{hour.temperature}°</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mobile-weather-footer">
          <small>Open-Meteo · Gerçek Zamanlı Tahmin</small>
          <button type="button" className="mobile-button-secondary" onClick={onClose}>
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
}
