import { useState, useEffect } from "react";
import { TURKEY_CITIES, type PrayerTimesConfig } from "../../shared/prayerTimes";
import { loadPrayerConfig, savePrayerConfig } from "../prayerStore";
import { loadWeatherCity, saveWeatherCity } from "../footerInfo";

export function CitySettings() {
  const [currentCity, setCurrentCity] = useState(() => {
    const prayer = loadPrayerConfig();
    return prayer.city || loadWeatherCity() || "Ankara";
  });

  const cities = Object.values(TURKEY_CITIES)
    .filter((v, i, a) => a.findIndex((t) => t.city === v.city) === i)
    .sort((a, b) => a.city.localeCompare(b.city, "tr"));

  useEffect(() => {
    const handlePrayerChange = () => {
      const cfg = loadPrayerConfig();
      if (cfg.city) setCurrentCity(cfg.city);
    };
    window.addEventListener("ack-prayer-config-changed", handlePrayerChange);
    return () => window.removeEventListener("ack-prayer-config-changed", handlePrayerChange);
  }, []);

  function handleCityChange(selectedCityName: string) {
    const found = (Object.values(TURKEY_CITIES) as { city: string; lat: number; lng: number }[]).find(
      (c) => c.city === selectedCityName
    );
    if (!found) return;

    setCurrentCity(found.city);

    // 1. Hava durumu şehrini güncelle
    saveWeatherCity(found.city);

    // 2. Namaz vakitleri konfigürasyonunu yeni koordinatlarla güncelle
    const currentPrayer = loadPrayerConfig();
    const nextPrayer: PrayerTimesConfig = {
      ...currentPrayer,
      city: found.city,
      latitude: found.lat,
      longitude: found.lng,
    };
    savePrayerConfig(nextPrayer);

    window.dispatchEvent(
      new CustomEvent("ack-settings-toast", {
        detail: `Konum ${found.city} olarak güncellendi.`,
      })
    );
  }

  return (
    <section className="settings-card surface local-settings" aria-labelledby="city-settings-title">
      <div className="settings-card-heading">
        <div>
          <h2 id="city-settings-title">Şehir ve Konum</h2>
          <p className="task-hint">
            Hava durumu ve namaz vakitleri için geçerli olan şehir. Seçtiğin il tüm uygulama ile otomatik eşitlenir.
          </p>
        </div>
      </div>
      <div className="archive-form-grid" style={{ marginTop: "0.75rem" }}>
        <label className="archive-field">
          Bulunduğun İl
          <select
            value={currentCity}
            onChange={(e) => handleCityChange(e.target.value)}
            style={{ fontSize: "14px", padding: "8px 12px", borderRadius: "6px" }}
          >
            {cities.map((c) => (
              <option key={c.city} value={c.city}>
                {c.city}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
