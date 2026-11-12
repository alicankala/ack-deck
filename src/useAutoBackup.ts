import { useEffect, useRef } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { createFullBackup } from "./backupStore";
import { getDesktopStatus } from "./desktopClient";

const AUTO_BACKUP_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 saatte bir
const AUTO_BACKUP_KEY = "ack-deck.last-auto-backup.v1";

export function getAutoBackupInfo(): { lastTime: number | null; lastFile: string | null } {
  try {
    const raw = localStorage.getItem(AUTO_BACKUP_KEY);
    if (!raw) return { lastTime: null, lastFile: null };
    return JSON.parse(raw);
  } catch {
    return { lastTime: null, lastFile: null };
  }
}

export function useAutoBackup() {
  const inFlight = useRef(false);

  useEffect(() => {
    if (!isTauri()) return;

    async function checkAndRunBackup() {
      if (inFlight.current) return;
      const { lastTime } = getAutoBackupInfo();
      const now = Date.now();

      // Son yedekten bu yana 4 saat geçmemişse çalıştırma
      if (lastTime && now - lastTime < AUTO_BACKUP_INTERVAL_MS) {
        return;
      }

      inFlight.current = true;
      try {
        const fallbackVersion = await getVersion().catch(() => "2.0.6");
        const desktop = await getDesktopStatus().catch(() => ({
          preferences: { closeToTray: false, startInTray: false },
          autoStart: false,
          version: fallbackVersion,
        }));

        const backup = await createFullBackup(
          {
            closeToTray: Boolean(desktop.preferences?.closeToTray),
            startInTray: Boolean(desktop.preferences?.startInTray),
            autoStart: Boolean(desktop.autoStart),
          },
          desktop.version || fallbackVersion
        );

        const content = JSON.stringify(backup, null, 2);
        const fileName = await invoke<string>("save_auto_backup", { content });

        localStorage.setItem(
          AUTO_BACKUP_KEY,
          JSON.stringify({ lastTime: now, lastFile: fileName })
        );

        window.dispatchEvent(
          new CustomEvent("ack-auto-backup-completed", { detail: { fileName, time: now } })
        );
      } catch (err) {
        console.warn("[AutoBackup] Otomatik yerel yedekleme atlandı:", err);
        const rawMessage =
          err instanceof Error
            ? err.message
            : typeof err === "string"
            ? err
            : err && typeof err === "object" && "message" in err && typeof err.message === "string"
            ? err.message
            : "";
        const message = rawMessage.trim() || "Otomatik yedekleme tamamlanamadı.";
        window.dispatchEvent(
          new CustomEvent("ack-auto-backup-failed", { detail: { message } })
        );
      } finally {
        inFlight.current = false;
      }
    }

    // İlk açılışta 15 saniye sonra kontrol et (açılışı yavaşlatmamak için)
    const initialTimer = setTimeout(() => {
      void checkAndRunBackup();
    }, 15000);

    // Açık kaldığı sürece saatte bir kontrol et
    const intervalTimer = setInterval(() => {
      void checkAndRunBackup();
    }, 60 * 60 * 1000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, []);
}
