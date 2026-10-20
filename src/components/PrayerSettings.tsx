import { useEffect, useState } from "react";
import { loadPrayerConfig, savePrayerConfig, geocodeCity } from "../prayerStore";
import type { PrayerTimesConfig } from "../../shared/prayerTimes";

export function PrayerSettings() {
  const [config, setConfig] = useState<PrayerTimesConfig>(loadPrayerConfig);
  const [cityName, setCityName] = useState(config.city);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handleChanged = () => {
      const latest = loadPrayerConfig();
      setConfig(latest);
      setCityName(latest.city);
    };
    window.addEventListener("ack-prayer-config-changed", handleChanged);
    return () => window.removeEventListener("ack-prayer-config-changed", handleChanged);
  }, []);

  async function handleSaveCity(e: React.FormEvent) {
    e.preventDefault();
    const query = cityName.trim();
    if (!query) return;
    setBusy(true);
    setMessage("");

    try {
      const location = await geocodeCity(query);
      if (!location) {
        setMessage("Şehir bulunamadı. Yazımı kontrol edin (örn. Ankara, İstanbul).");
        return;
      }

      const nextConfig: PrayerTimesConfig = {
        ...config,
        city: location.city,
        latitude: location.lat,
        longitude: location.lng,
      };

      if (savePrayerConfig(nextConfig)) {
        setConfig(nextConfig);
        setCityName(location.city);
        setMessage("Namaz vakitleri şehri güncellendi.");
      } else {
        setMessage("Ayar kaydedilemedi.");
      }
    } catch {
      setMessage("Konum servisine erişilemedi.");
    } finally {
      setBusy(false);
    }
  }

  function updateOptions(patch: Partial<PrayerTimesConfig>) {
    const next = { ...config, ...patch };
    if (savePrayerConfig(next)) {
      setConfig(next);
      setMessage("Bildirim tercihleri güncellendi.");
    }
  }

  return (
    <section className="settings-card surface" aria-labelledby="prayer-settings-heading">
      <div className="settings-card-heading">
        <div>
          <h2 id="prayer-settings-heading">Namaz Vakitleri ve Bildirimleri</h2>
          <p>Diyanet hesaplama yöntemiyle günlük vakitler, kerahat takibi ve sessiz Windows bildirimleri.</p>
        </div>
      </div>

      <form onSubmit={handleSaveCity} className="prayer-city-form">
        <label className="archive-field" htmlFor="prayer-city">
          Şehir
          <input
            id="prayer-city"
            value={cityName}
            maxLength={80}
            required
            disabled={busy}
            placeholder="Örn. Ankara"
            onChange={e => setCityName(e.target.value)}
          />
        </label>
        <button className="button button-primary" type="submit" disabled={busy || !cityName.trim()}>
          {busy ? "Aranıyor..." : "Şehri kaydet"}
        </button>
      </form>

      <div className="prayer-options-grid" style={{ marginTop: "1rem", display: "grid", gap: "0.85rem" }}>
        <label className="toggle" style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={config.notifyAtTime}
            onChange={e => updateOptions({ notifyAtTime: e.target.checked })}
          />
          <span><strong>Namaz vaktinde bildir</strong> (Ezan dakikasında sessiz Windows bildirimi)</span>
        </label>

        <label className="archive-field" style={{ maxWidth: "260px" }}>
          Vakitten önce hatırlat
          <select
            value={config.notifyBeforeMinutes}
            onChange={e => updateOptions({ notifyBeforeMinutes: Number(e.target.value) })}
          >
            <option value={0}>Kapalı (Ön bildirim yok)</option>
            <option value={5}>5 dakika önce</option>
            <option value={10}>10 dakika önce</option>
            <option value={15}>15 dakika önce</option>
            <option value={20}>20 dakika önce</option>
            <option value={30}>30 dakika önce</option>
            <option value={45}>45 dakika önce</option>
          </select>
        </label>
      </div>

      <p className="task-hint" style={{ marginTop: "0.75rem", fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
        Bildirimler alarm veya ses çalmaz; Windows Bildirim Merkezi üzerinden nazikçe tek bir toast olarak görüntülenir.
      </p>

      {message && <p className="feedback" role="status">{message}</p>}
    </section>
  );
}
