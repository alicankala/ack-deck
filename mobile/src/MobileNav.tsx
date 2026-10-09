import { Icon, type IconName } from "./Icon";

const tabs: { id: string; label: string; icon: IconName }[] = [
  { id: "today", label: "Bugün", icon: "check" },
  { id: "inbox", label: "Gönderilenler", icon: "files" },
  { id: "notes", label: "Notlar", icon: "note" },
  { id: "more", label: "Diğer", icon: "grid" },
];

export function MobileNav({ page, onChange }: { page: string; onChange: (page: string) => void }) {
  return <nav className="mobile-nav" aria-label="Ana menü">{tabs.map(tab => {
    const active = page === tab.id || tab.id === "more" && ["work", "subscriptions", "settings", "projects", "calendar"].includes(page);
    return <button type="button" key={tab.id} aria-current={active ? "page" : undefined} onClick={() => onChange(tab.id)}><Icon name={tab.icon} size={22} /><span>{tab.label}</span></button>;
  })}</nav>;
}
