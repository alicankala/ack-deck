import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
  validNotificationPreferences,
} from "../shared/notificationPreferences";

export const NOTIFICATION_PREFERENCES_KEY = "ack-deck.notification-preferences.v1";

export function loadNotificationPreferences(): NotificationPreferences {
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
    const parsed = JSON.parse(raw);
    if (validNotificationPreferences(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      return {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        ...Object.fromEntries(
          Object.entries(parsed).filter(([k, v]) => k in DEFAULT_NOTIFICATION_PREFERENCES && typeof v === "boolean")
        ),
      };
    }
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

export function saveNotificationPreferences(prefs: NotificationPreferences): boolean {
  try {
    window.localStorage.setItem(NOTIFICATION_PREFERENCES_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent("ack-notification-preferences-changed", { detail: prefs }));
    window.dispatchEvent(new Event("ack-data-changed"));
    return true;
  } catch {
    return false;
  }
}
