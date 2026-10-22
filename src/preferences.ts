export type StartPage = "home" | "tasks" | "calendar" | "notes" | "projects" | "ai" | "subscriptions" | "inbox";
export type ThemeMode = "dark" | "light";
export type Preferences = { startPage: StartPage; pcRefreshMs: 2500 | 5000 | 10000; theme?: ThemeMode };
export const DEFAULT_PREFERENCES: Preferences = { startPage: "home", pcRefreshMs: 2500, theme: "dark" };
const KEY = "ack-deck.preferences.v1";
export function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    return {
      startPage: ["home", "tasks", "calendar", "notes", "projects", "ai", "subscriptions", "inbox"].includes(value?.startPage) ? value.startPage : "home",
      pcRefreshMs: [2500, 5000, 10000].includes(value?.pcRefreshMs) ? value.pcRefreshMs : 2500,
      theme: value?.theme === "light" ? "light" : "dark",
    };
  } catch { return { ...DEFAULT_PREFERENCES }; }
}
export function savePreferences(value: Preferences): boolean {
  try { window.localStorage.setItem(KEY, JSON.stringify(value)); return true; } catch { return false; }
}
