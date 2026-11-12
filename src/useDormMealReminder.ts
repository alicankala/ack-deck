import { useEffect } from "react";
import {
  fetchDormMenu,
  findMenuForDate,
  shouldNotifyMealNow,
  turkeyDateKey,
  DORM_MENU_NOTIFIED_KEY,
  loadDormMenuCache,
} from "../shared/dormMenu";
import { notifyDesktop } from "./desktopClient";
import { ensureDesktopDormFetcher } from "./dormMenuDesktop";
import { isTauri } from "@tauri-apps/api/core";
import { loadNotificationPreferences } from "./notificationStore";

export function useDormMealReminder(setNotice: (text: string) => void) {
  useEffect(() => {
    let active = true;
    ensureDesktopDormFetcher();

    async function checkMealNotification() {
      const notif = loadNotificationPreferences();
      if (!notif.desktopMaster || !notif.desktopDormMenu) return;
      if (!shouldNotifyMealNow()) return;
      const todayKey = turkeyDateKey();
      const lastNotified = localStorage.getItem(DORM_MENU_NOTIFIED_KEY);
      if (lastNotified === todayKey) return;

      try {
        let records = loadDormMenuCache();
        let todayMenu = findMenuForDate(records, todayKey);
        if (!todayMenu || todayMenu.isFallback || !todayMenu.isToday || todayMenu.dinnerDishes.length === 0) {
          ensureDesktopDormFetcher();
          records = await fetchDormMenu();
          todayMenu = findMenuForDate(records, todayKey);
        }
        if (!active) return;
        if (todayMenu && !todayMenu.isFallback && todayMenu.isToday && todayMenu.dinnerDishes.length > 0) {
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
