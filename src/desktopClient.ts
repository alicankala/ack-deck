import { invoke } from "@tauri-apps/api/core";
export type DesktopPreferences = { closeToTray: boolean; startInTray: boolean };
export type DesktopStatus = { preferences: DesktopPreferences; autoStart: boolean; visible: boolean; trayReady: boolean; version: string };
export const getDesktopStatus = () => invoke<DesktopStatus>("desktop_status");
export const saveDesktopPreferences = (preferences: DesktopPreferences, autoStart: boolean) => invoke("save_desktop_preferences", { preferences, autoStart });
export const notifyDesktop = (title: string, body: string, target?: string) => invoke("notify_desktop", { title, body, target: target ?? null });
