import { useEffect, useState } from "react";
export function Header({ onOpenSearch }: { onOpenSearch: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  const time = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const date = new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  const greeting = now.getHours() < 12 ? "Günaydın" : now.getHours() < 18 ? "İyi günler" : "İyi akşamlar";
  return <header className="dashboard-header"><div><span className="dashboard-eyebrow">ÇALIŞMA ALANIN</span><h1>{greeting}</h1><time dateTime={now.toISOString()}>{date}</time></div><div className="dashboard-header-actions"><span className="dashboard-clock" aria-label="Saat">{time}</span><button className="button button-secondary" type="button" onClick={onOpenSearch}>Ara <kbd>Ctrl+K</kbd></button></div></header>;
}
