import { useState, useEffect, useCallback } from "react";
import {
  fetchDormMenu,
  findMenuForDate,
  turkeyDateKey,
  type DailyMenu,
  loadDormMenuCache,
  isDormMenuFresh,
} from "../../shared/dormMenu";

export function MobileDormMenuCard({
  isCollapsed,
  onToggleCollapse,
}: {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
} = {}) {
  const todayKey = turkeyDateKey();
  const [menu, setMenu] = useState<DailyMenu | null>(() => findMenuForDate(loadDormMenuCache(), todayKey));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (force = false) => {
    const currentKey = turkeyDateKey();
    if (!force && isDormMenuFresh(currentKey)) {
      const cached = findMenuForDate(loadDormMenuCache(), currentKey);
      setMenu(cached);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const records = await fetchDormMenu(force);
      const current = findMenuForDate(records, currentKey);
      setMenu(current);
      if (!current) setError("Bugünün menüsü henüz girilmedi.");
    } catch {
      setError("Menü alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const syncOrFetch = () => {
      const currentKey = turkeyDateKey();
      const cached = findMenuForDate(loadDormMenuCache(), currentKey);
      if (cached) {
        setMenu(cached);
        setError("");
      }
      if (!isDormMenuFresh(currentKey)) {
        void refresh(false);
      }
    };

    const syncFromCache = () => {
      const current = findMenuForDate(loadDormMenuCache(), turkeyDateKey());
      if (current) {
        setMenu(current);
        setError("");
      }
    };

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === "hidden") return;
      syncOrFetch();
    };

    syncOrFetch();

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "hidden" && !isDormMenuFresh(turkeyDateKey())) {
        void refresh(false);
      }
    }, 60_000);

    window.addEventListener("ack-dorm-menu-updated", syncFromCache);
    window.addEventListener("ack-dorm-menu-refresh", syncOrFetch);
    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("ack-dorm-menu-updated", syncFromCache);
      window.removeEventListener("ack-dorm-menu-refresh", syncOrFetch);
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
  }, [todayKey, refresh]);

  const dishIcons = ["🍲", "🥩", "🍚", "🥗", "🍮", "🍞", "🍎"];

  if (isCollapsed) {
    const dishSummary = menu && menu.dinnerDishes.length > 0
      ? menu.dinnerDishes.join(", ")
      : (loading ? "Yükleniyor…" : (error || "Menü henüz yayınlanmadı"));

    return (
      <div
        className="mobile-collapsed-card"
        onClick={onToggleCollapse}
        role="button"
        tabIndex={0}
        aria-expanded={false}
        title="Yemek menüsü kartını genişletmek için tıkla"
      >
        <div className="mobile-collapsed-left">
          <span className="mobile-collapsed-icon" aria-hidden="true">🍽️</span>
          <span className="mobile-collapsed-title">Menü:</span>
          <span className="mobile-collapsed-text">{dishSummary}</span>
        </div>
        <span className="mobile-collapsed-arrow" aria-hidden="true">⌄</span>
      </div>
    );
  }

  return (
    <article className="mobile-dorm-menu-card" aria-label="Günün Yemek Menüsü">
      <div className="mobile-dorm-header">
        <div className="mobile-dorm-title-group">
          <span className="mobile-dorm-icon" aria-hidden="true">🍽️</span>
          <div>
            <h3>Günün Yemek Menüsü</h3>
            <span className="mobile-dorm-sub">
              Altınkalem · {menu?.isFallback ? `Son Menü (${menu.date.split("-").reverse().join(".")})` : todayKey.split("-").reverse().join(".")}
            </span>
          </div>
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            className="mobile-card-collapse-btn"
            onClick={onToggleCollapse}
            title="Kartı daralt"
            aria-label="Yemek menüsü kartını daralt"
          >
            ⌃
          </button>
        )}
      </div>

      {menu && menu.dinnerDishes.length > 0 ? (
        <div className="mobile-dorm-dishes">
          {menu.dinnerDishes.map((dish, idx) => (
            <div key={idx} className="mobile-dorm-dish-row">
              <span className="dish-bullet" aria-hidden="true">
                {dishIcons[idx % dishIcons.length]}
              </span>
              <span className="dish-text">{dish}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mobile-dorm-empty">
          <small>{error || (loading ? "Menü yükleniyor…" : "Bugünün menüsü henüz yayınlanmadı.")}</small>
        </div>
      )}
    </article>
  );
}
