export const START_PAGES = ["home", "tasks", "calendar", "notes", "projects", "ai", "subscriptions", "inbox"] as const;
export type StartPage = (typeof START_PAGES)[number];
export const LEGACY_START_PAGES = ["tools", "archive"] as const;
export const PC_REFRESH_INTERVALS = [2500, 5000, 10000] as const;
export type PcRefreshInterval = (typeof PC_REFRESH_INTERVALS)[number];
export type ThemeMode = "dark" | "light";
export type Preferences = { startPage: StartPage; pcRefreshMs: PcRefreshInterval; theme?: ThemeMode };
export const DEFAULT_PREFERENCES: Preferences = { startPage: "home", pcRefreshMs: 2500, theme: "dark" };
const KEY = "ack-deck.preferences.v1";

export function validStartPageInput(value: unknown): boolean {
  return (
    typeof value === "string" &&
    ((START_PAGES as readonly string[]).includes(value) ||
      (LEGACY_START_PAGES as readonly string[]).includes(value))
  );
}

export function normalizeStartPage(value: unknown): StartPage {
  if (value === "tools") return "projects";
  if (value === "archive") return "home";
  return typeof value === "string" && (START_PAGES as readonly string[]).includes(value)
    ? (value as StartPage)
    : "home";
}

export function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    return {
      startPage: normalizeStartPage(value?.startPage),
      pcRefreshMs: (PC_REFRESH_INTERVALS as readonly number[]).includes(value?.pcRefreshMs)
        ? value.pcRefreshMs
        : 2500,
      theme: value?.theme === "light" ? "light" : "dark",
    };
  } catch { return { ...DEFAULT_PREFERENCES }; }
}
export function savePreferences(value: Preferences): boolean {
  try { window.localStorage.setItem(KEY, JSON.stringify(value)); return true; } catch { return false; }
}
