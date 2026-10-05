export type StartPage = "home" | "ai" | "projects" | "tools" | "archive";
export type Preferences = { startPage: StartPage; pcRefreshMs: 2500 | 5000 | 10000 };
export const DEFAULT_PREFERENCES: Preferences = { startPage: "home", pcRefreshMs: 2500 };
const KEY = "ack-deck.preferences.v1";
export function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    return {
      startPage: ["home", "ai", "projects", "tools", "archive"].includes(value?.startPage) ? value.startPage : "home",
      pcRefreshMs: [2500, 5000, 10000].includes(value?.pcRefreshMs) ? value.pcRefreshMs : 2500,
    };
  } catch { return { ...DEFAULT_PREFERENCES }; }
}
export function savePreferences(value: Preferences): boolean {
  try { window.localStorage.setItem(KEY, JSON.stringify(value)); return true; } catch { return false; }
}
