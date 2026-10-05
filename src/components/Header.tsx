import { useEffect, useState } from "react";
export function Header({ onOpenSearch }: { onOpenSearch: () => void }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(timer); }, []);
  const time = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const date = new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  return <header className="dashboard-header"><div><h1>ACKDeck</h1><time dateTime={now.toISOString()}>{date} · {time}</time></div><button className="button button-secondary" type="button" onClick={onOpenSearch}>Ara <kbd>Ctrl+K</kbd></button></header>;
}
