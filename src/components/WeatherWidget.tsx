import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  fetchWeather,
  loadWeatherCity,
  saveWeatherCity,
  weatherDescription,
  weatherSymbol,
  FOOTER_REFRESH_MS,
  type Weather,
} from "../footerInfo";
import { Icon } from "./Icon";

let weatherCache: { data: Weather; city: string; at: number } | undefined;

export function WeatherWidget() {
  const [city, setCity] = useState(loadWeatherCity);
  const [weather, setWeather] = useState<Weather | undefined>(
    weatherCache?.city === city ? weatherCache.data : undefined
  );
  const [loading, setLoading] = useState(!weather);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editingCity, setEditingCity] = useState(false);
  const [cityDraft, setCityDraft] = useState(city);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleCityChanged = () => {
      const nextCity = loadWeatherCity();
      setCity(nextCity);
      setCityDraft(nextCity);
    };
    window.addEventListener("ack-weather-city-changed", handleCityChanged);
    return () => window.removeEventListener("ack-weather-city-changed", handleCityChanged);
  }, []);

  useEffect(() => {
    let active = true;
    async function refresh() {
      if (weatherCache?.city === city && Date.now() - weatherCache.at < FOOTER_REFRESH_MS) {
        if (active) {
          setWeather(weatherCache.data);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      setError("");
      try {
        const data = await fetchWeather(city);
        if (active) {
          weatherCache = { data, city, at: Date.now() };
          setWeather(data);
          setError("");
        }
      } catch (err) {
        if (active) {
          setError(typeof err === "string" ? err : "Hava durumu alınamadı.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), FOOTER_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [city]);

  // Click outside to close popover
  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setEditingCity(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setEditingCity(false);
      }
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function submitCity(event: FormEvent) {
    event.preventDefault();
    const clean = cityDraft.trim();
    if (!clean) return;
    if (saveWeatherCity(clean)) {
      setCity(clean);
      setEditingCity(false);
    }
  }

  const currentTemp = weather ? Math.round(weather.temperature) : null;
  const apparentTemp = weather?.apparentTemperature !== undefined ? Math.round(weather.apparentTemperature) : currentTemp;
  const tempMax = weather?.tempMax !== undefined ? Math.round(weather.tempMax) : null;
  const tempMin = weather?.tempMin !== undefined ? Math.round(weather.tempMin) : null;
  const symbol = weather ? weatherSymbol(weather.code) : "🌡️";
  const desc = weather ? weatherDescription(weather.code) : error || (loading ? "Yükleniyor…" : "Alınamadı");

  return (
    <div className="dashboard-weather-wrapper" ref={containerRef}>
      <button
        type="button"
        className={`dashboard-weather-btn ${open ? "is-active" : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`Hava durumu: ${weather?.city ?? city}, ${currentTemp !== null ? `${currentTemp}°C` : ""}, ${desc}. Detayları gör`}
      >
        <span className="weather-btn-icon" aria-hidden="true">
          {symbol}
        </span>
        <span className="weather-btn-temp">
          {currentTemp !== null ? `${currentTemp}°C` : "—"}
        </span>
        <span className="weather-btn-sep" aria-hidden="true">•</span>
        <span className="weather-btn-city">{weather?.city ?? city}</span>
        <span className="weather-btn-desc">{desc}</span>
        <span className="weather-btn-chevron" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="dashboard-weather-popover surface" role="dialog" aria-label="Detaylı Hava Durumu">
          {/* Header Row */}
          <div className="weather-popover-header">
            <div className="weather-popover-main">
              <span className="weather-popover-large-icon" aria-hidden="true">
                {symbol}
              </span>
              <div>
                <div className="weather-popover-temp-row">
                  <strong className="weather-popover-temp">
                    {currentTemp !== null ? `${currentTemp}°C` : "—"}
                  </strong>
                  <span className="weather-popover-desc">{desc}</span>
                </div>
                {!editingCity ? (
                  <div className="weather-popover-city-row">
                    <span className="weather-popover-city-name">{weather?.city ?? city}</span>
                    <button
                      type="button"
                      className="weather-city-change-btn"
                      onClick={() => {
                        setEditingCity(true);
                        setCityDraft(weather?.city ?? city);
                      }}
                      title="Şehri değiştir"
                    >
                      <Icon name="folder" size={12} /> Şehir Değiştir
                    </button>
                  </div>
                ) : (
                  <form className="weather-city-form" onSubmit={submitCity}>
                    <input
                      type="text"
                      autoFocus
                      value={cityDraft}
                      onChange={(e) => setCityDraft(e.target.value)}
                      placeholder="Şehir adı (örn. İstanbul)"
                      maxLength={60}
                    />
                    <button type="submit" className="button button-primary" style={{ padding: "0.2rem 0.6rem", fontSize: "0.75rem" }}>
                      Kaydet
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      style={{ padding: "0.2rem 0.6rem", fontSize: "0.75rem" }}
                      onClick={() => setEditingCity(false)}
                    >
                      İptal
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>

          {error && <p className="tool-feedback error" style={{ margin: "0.5rem 0" }}>{error}</p>}

          {/* Key Metrics Grid */}
          <div className="weather-metrics-grid">
            <div className="weather-metric-box">
              <span className="weather-metric-label">Hissedilen</span>
              <strong className="weather-metric-val">
                {apparentTemp !== null ? `${apparentTemp}°C` : "—"}
              </strong>
            </div>
            <div className="weather-metric-box">
              <span className="weather-metric-label">Günün Değerleri</span>
              <strong className="weather-metric-val">
                {tempMax !== null && tempMin !== null ? `↑${tempMax}° / ↓${tempMin}°` : "—"}
              </strong>
            </div>
            <div className="weather-metric-box">
              <span className="weather-metric-label">Nem</span>
              <strong className="weather-metric-val">
                {weather?.humidity !== undefined ? `%${weather.humidity}` : "—"}
              </strong>
            </div>
            <div className="weather-metric-box">
              <span className="weather-metric-label">Rüzgar</span>
              <strong className="weather-metric-val">
                {weather?.windSpeed !== undefined ? `${Math.round(weather.windSpeed)} km/s` : "—"}
              </strong>
            </div>
          </div>

          {/* Hourly Forecast Strip */}
          {weather?.hourly && weather.hourly.length > 0 && (
            <div className="weather-hourly-section">
              <span className="weather-hourly-title">Günün Saatlik Akışı</span>
              <div className="weather-hourly-strip">
                {weather.hourly.slice(0, 8).map((hour, idx) => (
                  <div className="weather-hour-cell" key={idx}>
                    <span className="hour-time">{hour.time}</span>
                    <span className="hour-icon" aria-hidden="true">
                      {weatherSymbol(hour.code)}
                    </span>
                    <strong className="hour-temp">{Math.round(hour.temperature)}°</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer note */}
          <div className="weather-popover-footer">
            <small>Open-Meteo · Gerçek Zamanlı Tahmin</small>
            <button
              type="button"
              className="weather-close-btn"
              onClick={() => {
                setOpen(false);
                setEditingCity(false);
              }}
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
