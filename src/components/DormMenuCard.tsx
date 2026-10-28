import { useState, useEffect } from "react";
import {
  fetchDormMenu,
  findMenuForDate,
  turkeyDateKey,
  type DailyMenu,
  loadDormMenuCache,
} from "../../shared/dormMenu";

export function DormMenuCard() {
  const todayKey = turkeyDateKey();
  const [menu, setMenu] = useState<DailyMenu | null>(() => findMenuForDate(loadDormMenuCache(), todayKey));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const records = await fetchDormMenu();
      const current = findMenuForDate(records, todayKey);
      setMenu(current);
      if (!current) setError("Bugünün menüsü henüz yayınlanmadı.");
    } catch {
      setError("Yemek menüsü alınamadı.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let lastFetchedAt = Date.now();
    void refresh();
    const syncFromCache = () => {
      const current = findMenuForDate(loadDormMenuCache(), turkeyDateKey());
      if (current) {
        setMenu(current);
        setError("");
      }
    };
    const onFocus = () => {
      if (Date.now() - lastFetchedAt > 5 * 60 * 1000) {
        lastFetchedAt = Date.now();
        void refresh();
      }
    };
    const interval = window.setInterval(() => {
      lastFetchedAt = Date.now();
      void refresh();
    }, 30 * 60 * 1000);
    window.addEventListener("ack-dorm-menu-updated", syncFromCache);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("ack-dorm-menu-updated", syncFromCache);
      window.removeEventListener("focus", onFocus);
    };
  }, [todayKey]);

  const dishIcons = ["🍲", "🥩", "🍚", "🥗", "🍮", "🍞", "🍎"];

  return (
    <article className="surface dorm-menu-card" aria-label="Günün Yemek Menüsü">
      <div className="dorm-menu-header">
        <div className="dorm-menu-title-wrap">
          <span className="dorm-menu-badge-icon" aria-hidden="true">🍽️</span>
          <div>
            <h3>Günün Yemek Menüsü</h3>
            <small className="dorm-menu-source">
              Altınkalem · {menu?.isFallback ? `Son Menü (${menu.date.split("-").reverse().join(".")})` : todayKey.split("-").reverse().join(".")}
            </small>
          </div>
        </div>
        <button
          type="button"
          className="button button-secondary dorm-menu-refresh-btn"
          disabled={loading}
          onClick={refresh}
          title="Menüyü yenile"
        >
          {loading ? "…" : "↻"}
        </button>
      </div>

      {menu && menu.dinnerDishes.length > 0 ? (
        <div className="dorm-menu-body">
          <div className="dorm-dishes-list">
            {menu.dinnerDishes.map((dish, idx) => (
              <div key={idx} className="dorm-dish-item">
                <span className="dorm-dish-icon" aria-hidden="true">
                  {dishIcons[idx % dishIcons.length]}
                </span>
                <span className="dorm-dish-name">{dish}</span>
              </div>
            ))}
          </div>
          {menu.breakfastDishes.length > 0 && (
            <div className="dorm-breakfast-section">
              <span className="dorm-sub-heading">Kahvaltı</span>
              <div className="dorm-dishes-list">
                {menu.breakfastDishes.map((dish, idx) => (
                  <div key={idx} className="dorm-dish-item">
                    <span className="dorm-dish-icon" aria-hidden="true">☕</span>
                    <span className="dorm-dish-name">{dish}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="dorm-menu-empty">
          <p>{error || (loading ? "Yemek menüsü yükleniyor…" : "Bugün için yayınlanmış menü bulunamadı.")}</p>
        </div>
      )}
    </article>
  );
}
