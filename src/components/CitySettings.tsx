import { useState, useEffect } from "react";
import { TURKEY_CITIES, type PrayerTimesConfig } from "../../shared/prayerTimes";
import { loadPrayerConfig, savePrayerConfig } from "../prayerStore";
import { loadWeatherCity, saveWeatherCity } from "../footerInfo";

export function CitySettings() {
  const [prayerConfig, setPrayerConfig] = useState<PrayerTimesConfig>(() => {
    const prayer = loadPrayerConfig();
    return {
      ...prayer,
      city: prayer.city || loadWeatherCity() || "Ankara",
    };
  });
  const currentCity = prayerConfig.city;

  const cities = Object.values(TURKEY_CITIES)
    .filter((v, i, a) => a.findIndex((t) => t.city === v.city) === i)
    .sort((a, b) => a.city.localeCompare(b.city, "tr"));

  useEffect(() => {
    const handlePrayerChange = () => {
      const cfg = loadPrayerConfig();
      setPrayerConfig(cfg);
    };
    window.addEventListener("ack-prayer-config-changed", handlePrayerChange);
    return () => window.removeEventListener("ack-prayer-config-changed", handlePrayerChange);
  }, []);

  function updatePrayerSettings(nextPrayer: PrayerTimesConfig, toastText: string) {
    setPrayerConfig(nextPrayer);
    savePrayerConfig(nextPrayer);
    window.dispatchEvent(
      new CustomEvent("ack-settings-toast", {
        detail: toastText,
      })
    );
  }

  function handleCityChange(selectedCityName: string) {
    const found = (Object.values(TURKEY_CITIES) as { city: string; lat: number; lng: number }[]).find(
      (c) => c.city === selectedCityName
    );
    if (!found) return;

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
    updatePrayerSettings(nextPrayer, `Konum ${found.city} olarak güncellendi.`);
  }

  function handleNotifyAtTimeChange(enabled: boolean) {
    const nextPrayer: PrayerTimesConfig = { ...prayerConfig, notifyAtTime: enabled };
    updatePrayerSettings(
      nextPrayer,
      enabled ? "Vakit girdiğinde bildirim gönderilecek." : "Vakit giriş bildirimleri kapatıldı."
    );
  }

  function handleBeforeMinutesChange(minutes: number) {
    const nextPrayer: PrayerTimesConfig = { ...prayerConfig, notifyBeforeMinutes: minutes };
    updatePrayerSettings(
      nextPrayer,
      minutes > 0 ? `Vaktin ${minutes} dakika öncesinde hatırlatılacak.` : "Vakit öncesi hatırlatma kapatıldı."
    );
  }

  return (
    <section className="settings-card surface local-settings" aria-labelledby="city-settings-title">
      <div className="settings-card-heading">
        <div>
          <h2 id="city-settings-title">Şehir, Konum ve Namaz Vakti Hatırlatmaları</h2>
          <p className="task-hint">
            Hava durumu ve namaz vakitleri için geçerli şehir ile vakit bildirim zamanlaması.
          </p>
        </div>
      </div>
      <div className="archive-form-grid">
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

        <label className="archive-field">
          Vakit Öncesi Hatırlatma
          <select
            value={prayerConfig.notifyBeforeMinutes}
            onChange={(e) => handleBeforeMinutesChange(Number(e.target.value))}
            style={{ fontSize: "14px", padding: "8px 12px", borderRadius: "6px" }}
          >
            <option value={0}>Kapalı</option>
            <option value={5}>5 dakika önce</option>
            <option value={10}>10 dakika önce</option>
            <option value={15}>15 dakika önce</option>
            <option value={20}>20 dakika önce</option>
            <option value={30}>30 dakika önce</option>
            <option value={45}>45 dakika önce</option>
          </select>
        </label>
      </div>

      <label
        className="settings-inline-check"
        style={{ display: "inline-flex", alignItems: "center", gap: "0.55rem", marginTop: "0.85rem", cursor: "pointer", fontSize: "0.88rem" }}
      >
        <input
          type="checkbox"
          checked={prayerConfig.notifyAtTime}
          onChange={(e) => handleNotifyAtTimeChange(e.target.checked)}
        />
        <span>Vaktinde bildirim gönder (Ezan vakti girdiğinde)</span>
      </label>
    </section>
  );
}
