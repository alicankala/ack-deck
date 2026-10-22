import { useEffect, useState } from "react";

export function Header() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const time = new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);

  const dateFormatted = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(now);

  const hours = now.getHours();
  const greeting =
    hours >= 5 && hours < 12
      ? "Günaydın"
      : hours >= 12 && hours < 18
      ? "İyi günler"
      : hours >= 18 && hours < 24
      ? "İyi akşamlar"
      : "İyi geceler";

  return (
    <header className="dashboard-header">
      <div className="dashboard-greeting-block">
        <h1 className="dashboard-greeting-title">{greeting}</h1>
      </div>
      <div className="dashboard-header-actions">
        <div className="dashboard-live-badge" aria-label="Canlı Saat ve Tarih">
          <span className="live-status-dot" aria-hidden="true" />
          <span className="live-clock-text">{time}</span>
          <span className="live-badge-sep" aria-hidden="true">•</span>
          <span className="live-date-text">{dateFormatted}</span>
        </div>
      </div>
    </header>
  );
}
