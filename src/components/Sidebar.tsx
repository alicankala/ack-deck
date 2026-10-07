import { Icon, type IconName } from "./Icon";
export type Page = "home" | "tasks" | "ai" | "workspaces" | "projects" | "tools" | "notes" | "qr" | "ip" | "files" | "speed" | "pc" | "archive" | "settings" | "inbox" | "subscriptions" | "calendar";
const navigationGroups: { label: string; items: { id: Page; label: string; icon: IconName }[] }[] = [
  { label: "Günlük", items: [
  { id: "home", label: "Ana Sayfa", icon: "grid" },
  { id: "tasks", label: "Görevler", icon: "check" },
  { id: "calendar", label: "Haftalık Plan", icon: "grid" },
  { id: "projects", label: "Projeler", icon: "folder" },
  { id: "ai", label: "ACK AI", icon: "spark" },
  ] },
  { label: "Kayıtlar", items: [
  { id: "notes", label: "Notlar", icon: "note" },
  { id: "inbox", label: "Gelenler", icon: "files" },
  { id: "subscriptions", label: "Abonelikler", icon: "archive" },
  ] },
  { label: "Yardımcılar", items: [
  { id: "tools", label: "Araçlar", icon: "tool" },
  ] },
];
export function Sidebar({ activePage, onNavigate }: { activePage: Page; onNavigate: (page: Page) => void }) {
  return <aside className="sidebar">
    <div className="brand" aria-label="ACKDeck"><img className="brand-mark" src="/ack-mark.svg" alt="ACK" /><div className="brand-copy"><strong>ACKDeck</strong></div></div>
    <nav className="sidebar-nav" aria-label="Ana menü">
      {navigationGroups.map(group => <div className="sidebar-nav-group" role="group" aria-label={group.label} key={group.label}>
      <div className="sidebar-section-label">{group.label}</div>
      {group.items.map(item => <button key={item.id} type="button" aria-label={item.label} title={item.label} className={`nav-item ${activePage === item.id ? "active" : ""}`} aria-current={activePage === item.id ? "page" : undefined} onClick={() => onNavigate(item.id)}>
        <Icon name={item.icon} size={19} /><span>{item.label}</span>{activePage === item.id && <span className="nav-indicator" />}
      </button>)}
      </div>)}
    </nav>
    <div className="sidebar-bottom"><div className="sidebar-line" /><button type="button" className={`nav-item ${activePage === "settings" ? "active" : ""}`} aria-label="Ayarlar" title="Ayarlar" aria-current={activePage === "settings" ? "page" : undefined} onClick={() => onNavigate("settings")}><Icon name="settings" size={19} /><span>Ayarlar</span></button></div>
  </aside>;
}
