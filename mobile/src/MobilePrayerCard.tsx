import { useEffect, useState } from "react";
import {
  calculatePrayerTimes,
  formatRemainingTime,
  loadPrayerConfig,
  type PrayerDayInfo,
  type PrayerTimesConfig,
} from "../../shared/prayerTimes";

export function MobilePrayerCard({ onOpenCitySettings }: { onOpenCitySettings?: () => void }) {
  const [config, setConfig] = useState<PrayerTimesConfig>(loadPrayerConfig);
  const [info, setInfo] = useState<PrayerDayInfo | null>(null);

  useEffect(() => {
    function handleConfigChange() {
      setConfig(loadPrayerConfig());
    }
    window.addEventListener("ack-prayer-config-changed", handleConfigChange);
    return () => window.removeEventListener("ack-prayer-config-changed", handleConfigChange);
  }, []);

  useEffect(() => {
    function update() {
      const data = calculatePrayerTimes(config.latitude, config.longitude, new Date(), config.city);
      setInfo(data);
    }
    update();
    const timer = setInterval(update, 20000);
    return () => clearInterval(timer);
  }, [config]);

  if (!info) return null;
  const kerahat = info.kerahat;

  return (
    <article className="mobile-prayer-card" aria-label="Namaz vakitleri">
      <div className="mobile-prayer-head">
        <div className="mobile-prayer-title">
          <span className="mobile-prayer-icon" aria-hidden="true">🕌</span>
          <div>
            <strong>Namaz Vakitleri</strong>
            <button
              type="button"
              className="mobile-prayer-city-btn"
              onClick={onOpenCitySettings}
              title="Şehri değiştir"
            >
              {info.city} <span aria-hidden="true">✎</span>
            </button>
          </div>
        </div>
        {kerahat.inKerahat ? (
          <span className="mobile-kerahat-chip warning">
            ⚠️ {kerahat.label} ({formatRemainingTime(kerahat.remainingMs ?? 0)})
          </span>
        ) : info.nextPrayer ? (
          <span className="mobile-prayer-chip">
            {info.nextPrayer.label}: <strong>{formatRemainingTime(info.timeToNextMs)} kaldı</strong>
          </span>
        ) : null}
      </div>

      <div className="mobile-prayer-row">
        {info.items.map(item => {
          const isNext = info.nextPrayer?.name === item.name;
          const isCurrent = info.currentPrayer?.name === item.name;
          return (
            <div
              key={item.name}
              className={`mobile-prayer-item ${isCurrent ? "is-current" : ""} ${isNext ? "is-next" : ""}`}
            >
              <small>{item.label}</small>
              <strong>{item.time}</strong>
            </div>
          );
        })}
      </div>
    </article>
  );
}
