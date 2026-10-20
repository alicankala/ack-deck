import { useEffect, useState } from "react";
import { loadPrayerConfig, getTodayPrayerInfo } from "../prayerStore";
import { formatRemainingTime, type PrayerDayInfo, type PrayerItem } from "../../shared/prayerTimes";
import "./prayerTimes.css";

export function PrayerWidget({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const [config, setConfig] = useState(loadPrayerConfig);
  const [info, setInfo] = useState<PrayerDayInfo>(() => getTodayPrayerInfo(config));
  const [, setTick] = useState(0);

  useEffect(() => {
    const handleChanged = () => {
      const latest = loadPrayerConfig();
      setConfig(latest);
      setInfo(getTodayPrayerInfo(latest));
    };
    window.addEventListener("ack-prayer-config-changed", handleChanged);
    return () => window.removeEventListener("ack-prayer-config-changed", handleChanged);
  }, []);

  // Update clock/countdown every 30s
  useEffect(() => {
    const timer = setInterval(() => {
      setInfo(getTodayPrayerInfo(config));
      setTick(t => t + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, [config]);

  const kerahat = info.kerahat;

  return (
    <section className="dashboard-prayer surface" aria-labelledby="dashboard-prayer-heading">
      <div className="dashboard-section-top">
        <div className="prayer-header-title">
          <span className="prayer-icon-badge" aria-hidden="true">🕌</span>
          <div>
            <h2 id="dashboard-prayer-heading">Namaz Vakitleri</h2>
            <small className="prayer-city-label">{info.city}</small>
          </div>
        </div>
        {onOpenSettings && (
          <button
            type="button"
            className="dashboard-text-button"
            onClick={onOpenSettings}
            title="Şehir ve bildirim ayarları"
          >
            Ayarlar
          </button>
        )}
      </div>

      {/* Kerahat Alert Bar */}
      {kerahat.inKerahat ? (
        <div className="prayer-kerahat-badge warning" role="status">
          <span className="kerahat-indicator" aria-hidden="true">⚠️</span>
          <div className="kerahat-text">
            <strong>{kerahat.label}</strong>
            <small>{kerahat.description} ({formatRemainingTime(kerahat.remainingMs ?? 0)} kaldı)</small>
          </div>
        </div>
      ) : (
        <div className="prayer-countdown-bar">
          {info.nextPrayer && (
            <span>
              <strong>{info.nextPrayer.label}</strong> vaktine{" "}
              <span className="countdown-highlight">{formatRemainingTime(info.timeToNextMs)}</span> kaldı
            </span>
          )}
        </div>
      )}

      {/* 6 Times Matrix */}
      <div className="prayer-times-grid">
        {info.items.map((item: PrayerItem) => {
          const isNext = info.nextPrayer?.name === item.name;
          const isCurrent = info.currentPrayer?.name === item.name;
          return (
            <div
              key={item.name}
              className={`prayer-time-cell ${isCurrent ? "is-current" : ""} ${isNext ? "is-next" : ""}`}
            >
              <span className="prayer-cell-name">{item.label}</span>
              <strong className="prayer-cell-time">{item.time}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}
