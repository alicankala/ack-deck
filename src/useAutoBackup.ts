import { useEffect, useRef } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { createFullBackup } from "./backupStore";
import { getDesktopStatus } from "./desktopClient";

export const AUTO_BACKUP_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 saatte bir
export const AUTO_BACKUP_CHECK_MS = 5 * 60 * 1000; // 5 dakikada bir kontrol (15 sn kaymasını ve uyku dönüşünü kaçırmaz)
const AUTO_BACKUP_KEY = "ack-deck.last-auto-backup.v1";

export function getAutoBackupInfo(): { lastTime: number | null; lastFile: string | null } {
  try {
    const raw = localStorage.getItem(AUTO_BACKUP_KEY);
    if (!raw) return { lastTime: null, lastFile: null };
    const parsed = JSON.parse(raw);
    return {
      lastTime: typeof parsed?.lastTime === "number" && Number.isFinite(parsed.lastTime) ? parsed.lastTime : null,
      lastFile: typeof parsed?.lastFile === "string" && parsed.lastFile ? parsed.lastFile : null,
    };
  } catch {
    return { lastTime: null, lastFile: null };
  }
}

export function useAutoBackup() {
  const inFlight = useRef(false);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;

    async function checkAndRunBackup() {
      if (disposed || inFlight.current) return;
      if (localStorage.getItem("ack-deck.restore-journal.v1") !== null) return;

      inFlight.current = true;
      try {
        const { lastTime, lastFile } = getAutoBackupInfo();
        const now = Date.now();

        // Kayıtlı son otomatik yedek klasörden silinmemişse ve 4 saat dolmamışsa bekle
        if (lastTime && now <= lastTime + AUTO_BACKUP_INTERVAL_MS && now >= lastTime - 60_000) {
          let fileStillOnDisk = true;
          if (lastFile) {
            try {
              const exists = await invoke<boolean | null>("auto_backup_exists", { fileName: lastFile });
              if (exists === false) fileStillOnDisk = false;
            } catch {
              // Komut hatasında gereksiz döngüye girmemek için mevcut zaman kaydına güven
            }
          }
          if (fileStillOnDisk) {
            return;
          }
        }

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
        const completedAt = Date.now();

        localStorage.setItem(
          AUTO_BACKUP_KEY,
          JSON.stringify({ lastTime: completedAt, lastFile: fileName })
        );

        window.dispatchEvent(
          new CustomEvent("ack-auto-backup-completed", { detail: { fileName, time: completedAt } })
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

    // Açık kaldığı sürece her 5 dakikada bir kontrol et
    const intervalTimer = setInterval(() => {
      void checkAndRunBackup();
    }, AUTO_BACKUP_CHECK_MS);

    // Pencere öne geldiğinde / uykudan uyandığında / tepsiden açıldığında anında telafi et
    const onFocus = () => {
      void checkAndRunBackup();
    };
    const onVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void checkAndRunBackup();
      }
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("ack-auto-backup-recheck", onFocus);
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    const unlistenPromises = [
      listen<boolean>("ack-visibility", (event) => {
        if (event.payload) void checkAndRunBackup();
      }).catch(() => () => {}),
      listen("ack-auto-backup-tick", () => {
        void checkAndRunBackup();
      }).catch(() => () => {}),
    ];

    return () => {
      disposed = true;
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("ack-auto-backup-recheck", onFocus);
      if (typeof document !== "undefined" && typeof document.removeEventListener === "function") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      for (const p of unlistenPromises) {
        void p.then((unlisten) => unlisten());
      }
    };
  }, []);
}
