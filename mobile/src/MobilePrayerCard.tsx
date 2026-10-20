import { useEffect, useState } from "react";
import { calculatePrayerTimes, formatRemainingTime, type PrayerDayInfo } from "../../shared/prayerTimes";

export function MobilePrayerCard() {
  const [info, setInfo] = useState<PrayerDayInfo | null>(null);

  useEffect(() => {
    // Default to Ankara/Istanbul or local coordinates if available
    function update() {
      // Ankara as clean baseline (lat: 39.91987, lng: 32.85427)
      const data = calculatePrayerTimes(39.91987, 32.85427, new Date(), "Ankara");
      setInfo(data);
    }
    update();
    const timer = setInterval(update, 30000);
    return () => clearInterval(timer);
  }, []);

  if (!info) return null;
  const kerahat = info.kerahat;

  return (
    <article className="mobile-prayer-card" aria-label="Namaz vakitleri">
      <div className="mobile-prayer-head">
        <div className="mobile-prayer-title">
          <span className="mobile-prayer-icon" aria-hidden="true">🕌</span>
          <div>
            <strong>Namaz Vakitleri</strong>
            <small>{info.city}</small>
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
