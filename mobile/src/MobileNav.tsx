import { Icon, type IconName } from "./Icon";

export type MobileTabId = "today" | "plan" | "notes" | "more";

const tabs: { id: MobileTabId; label: string; icon: IconName }[] = [
  { id: "today", label: "Bugün", icon: "checkCircle" },
  { id: "plan", label: "Plan", icon: "calendar" },
  { id: "notes", label: "Notlar", icon: "note" },
  { id: "more", label: "Diğer", icon: "grid" },
];

export function MobileNav({
  page,
  onChange,
}: {
  page: string;
  onChange: (page: string) => void;
}) {
  return (
    <nav className="mobile-nav" aria-label="Ana menü">
      {tabs.map((tab) => {
        const active =
          page === tab.id ||
          (tab.id === "today" && page === "tasks") ||
          (tab.id === "plan" && ["plan", "calendar", "subscriptions"].includes(page)) ||
          (tab.id === "more" && ["more", "inbox", "work", "settings"].includes(page));
        return (
          <button
            type="button"
            key={tab.id}
            className={`mobile-nav-btn ${active ? "is-active" : ""}`}
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(tab.id)}
          >
            <Icon name={tab.icon} size={22} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
