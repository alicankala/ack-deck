import { Icon, type IconName } from "./Icon";

export type Page =
  | "home"
  | "tasks"
  | "calendar"
  | "notes"
  | "media"
  | "projects"
  | "ai"
  | "subscriptions"
  | "inbox"
  | "settings";

const navigationItems: { id: Page; label: string; icon: IconName }[] = [
  { id: "home", label: "Ana Sayfa", icon: "grid" },
  { id: "tasks", label: "Görevler", icon: "check" },
  { id: "calendar", label: "Aylık Plan", icon: "grid" },
  { id: "notes", label: "Notlar", icon: "note" },
  { id: "inbox", label: "Gelenler", icon: "files" },
  { id: "ai", label: "ACK AI", icon: "spark" },
  { id: "projects", label: "Projeler & Araçlar", icon: "folder" },
  { id: "media", label: "Koleksiyon", icon: "archive" },
  { id: "subscriptions", label: "Abonelikler", icon: "archive" },
];

export function Sidebar({ activePage, onNavigate }: { activePage: Page; onNavigate: (page: Page) => void }) {
  return (
    <aside className="sidebar">
      <div className="brand" aria-label="ACKDeck" data-tauri-drag-region="deep">
        <img className="brand-mark" src="/ack-mark.svg" alt="ACK" />
        <div className="brand-copy">
          <strong>ACKDeck</strong>
        </div>
      </div>
      <nav className="sidebar-nav" aria-label="Ana menü">
        {navigationItems.map(item => (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            title={item.label}
            className={`nav-item ${activePage === item.id ? "active" : ""}`}
            aria-current={activePage === item.id ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
            {activePage === item.id && <span className="nav-indicator" />}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-line" />
        <button
          type="button"
          className={`nav-item ${activePage === "settings" ? "active" : ""}`}
          aria-label="Ayarlar"
          title="Ayarlar"
          aria-current={activePage === "settings" ? "page" : undefined}
          onClick={() => onNavigate("settings")}
        >
          <Icon name="settings" size={19} />
          <span>Ayarlar</span>
        </button>
      </div>
    </aside>
  );
}
