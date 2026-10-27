import { useEffect } from "react";
import {
  fetchDormMenu,
  findMenuForDate,
  shouldNotifyMealNow,
  turkeyDateKey,
  DORM_MENU_NOTIFIED_KEY,
} from "../shared/dormMenu";
import { notifyDesktop } from "./desktopClient";
import { isTauri } from "@tauri-apps/api/core";

export function useDormMealReminder(setNotice: (text: string) => void) {
  useEffect(() => {
    let active = true;

    async function checkMealNotification() {
      if (!shouldNotifyMealNow()) return;
      const todayKey = turkeyDateKey();
      const lastNotified = localStorage.getItem(DORM_MENU_NOTIFIED_KEY);
      if (lastNotified === todayKey) return;

      try {
        const records = await fetchDormMenu();
        if (!active) return;
        const todayMenu = findMenuForDate(records, todayKey);
        if (todayMenu && todayMenu.dinnerDishes.length > 0) {
          const dishesText = todayMenu.dinnerDishes.join(", ");
          if (isTauri()) {
            await notifyDesktop("🍽️ Bugünün Yemek Menüsü", dishesText.slice(0, 300)).catch(() => {});
          }
          setNotice(`🍽️ Günün Yemeği: ${todayMenu.dinnerDishes.slice(0, 3).join(", ")}`);
          localStorage.setItem(DORM_MENU_NOTIFIED_KEY, todayKey);
        }
      } catch {}
    }

    // Run check on mount after short delay, then every 60 seconds
    const initial = window.setTimeout(checkMealNotification, 3000);
    const interval = window.setInterval(checkMealNotification, 60000);

    return () => {
      active = false;
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [setNotice]);
}
