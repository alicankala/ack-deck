import { useState, useEffect } from "react";
import {
  fetchDormMenu,
  findMenuForDate,
  turkeyDateKey,
  type DailyMenu,
  loadDormMenuCache,
} from "../../shared/dormMenu";

export function MobileDormMenuCard() {
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
      if (!current) setError("Bugünün menüsü henüz girilmedi.");
    } catch {
      setError("Menü alınamadı.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [todayKey]);

  const dishIcons = ["🍲", "🥩", "🍚", "🥗", "🍮", "🍞", "🍎"];

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
        <button
          type="button"
          className="mobile-dorm-refresh"
          disabled={loading}
          onClick={refresh}
          aria-label="Yemek menüsünü yenile"
        >
          {loading ? "…" : "↻"}
        </button>
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
