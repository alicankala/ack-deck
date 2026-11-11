import { recordActivity } from "./activityStore";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createFullBackup } from "./backupStore";
import { getDesktopStatus } from "./desktopClient";

const LAST_CHECKED_KEY = "ack-deck.update-last-checked.v1";
export const UPDATE_PROGRESS_EVENT = "ack-update-progress";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "downloading"
  | "verifying"
  | "ready"
  | "installing"
  | "error";

export type UpdateProgress = {
  version: string;
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
};

export type UpdateProgressPayload = {
  version: string;
  phase: "started" | "downloading" | "verifying";
  downloadedBytes?: number;
  totalBytes?: number | null;
  percent?: number | null;
};

export type UpdateStatus = {
  phase: UpdatePhase;
  version?: string;
  message?: string;
  checkedAt?: number;
  upToDate?: boolean;
  progress?: UpdateProgress;
};

function readLastCheckedAt(): number | undefined {
  try {
    const raw = window.localStorage.getItem(LAST_CHECKED_KEY);
    if (!raw) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function saveLastCheckedAt(timestamp: number) {
  try {
    window.localStorage.setItem(LAST_CHECKED_KEY, String(timestamp));
  } catch {
    // Ignore storage quota or private mode failures
  }
}

export function formatUpdateVersion(version?: string): string {
  const clean = version?.trim().replace(/^v/i, "");
  return clean ? `v${clean}` : "—";
}

export function formatUpdateBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("tr-TR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} MB`;
}

export function formatUpdateCheckTime(timestamp?: number, now = Date.now()): string {
  if (!timestamp || !Number.isFinite(timestamp) || timestamp <= 0) return "";
  const date = new Date(timestamp);
  const current = new Date(now);
  const timeText = date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const startOfToday = new Date(current.getFullYear(), current.getMonth(), current.getDate()).getTime();
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfTarget) / 86400000);
  if (dayDiff === 0) return `Bugün ${timeText}`;
  if (dayDiff === 1) return `Dün ${timeText}`;
  return `${date.toLocaleDateString("tr-TR")} ${timeText}`;
}

export function resolveUpdatePercent(
  downloadedBytes: number,
  totalBytes: number | null,
  reportedPercent?: number | null
): number | null {
  if (typeof reportedPercent === "number" && Number.isFinite(reportedPercent)) {
    return Math.min(100, Math.max(0, Math.round(reportedPercent)));
  }
  if (typeof totalBytes === "number" && Number.isFinite(totalBytes) && totalBytes > 0) {
    return Math.min(100, Math.max(0, Math.floor((downloadedBytes * 100) / totalBytes)));
  }
  return null;
}

export function applyUpdateProgress(
  current: UpdateStatus,
  payload: UpdateProgressPayload
): UpdateStatus {
  if (current.phase !== "checking" && current.phase !== "downloading" && current.phase !== "verifying") {
    return current;
  }
  const version = payload.version?.trim() || current.progress?.version || current.version || "";
  if (!version) return current;

  const sameVersion = current.progress?.version === version;
  const rawDownloaded = typeof payload.downloadedBytes === "number" && Number.isFinite(payload.downloadedBytes)
    ? Math.max(0, payload.downloadedBytes)
    : 0;
  const downloadedBytes = sameVersion
    ? Math.max(current.progress?.downloadedBytes ?? 0, rawDownloaded)
    : rawDownloaded;
  const rawTotal = typeof payload.totalBytes === "number" && payload.totalBytes > 0
    ? payload.totalBytes
    : sameVersion
      ? (current.progress?.totalBytes ?? null)
      : null;

  if (payload.phase === "verifying") {
    return {
      ...current,
      phase: "verifying",
      version,
      progress: {
        version,
        downloadedBytes,
        totalBytes: rawTotal ?? (downloadedBytes > 0 ? downloadedBytes : null),
        percent: 100,
      },
    };
  }

  const computedPercent = resolveUpdatePercent(downloadedBytes, rawTotal, payload.percent);
  const percent = sameVersion && typeof current.progress?.percent === "number"
    ? computedPercent === null
      ? current.progress.percent
      : Math.max(current.progress.percent, computedPercent)
    : computedPercent;

  return {
    ...current,
    phase: "downloading",
    version,
    progress: {
      version,
      downloadedBytes,
      totalBytes: rawTotal,
      percent,
    },
  };
}

function safeUpdateError(error: unknown): string {
  if (typeof error === "string") {
    const clean = error.trim();
    if (clean.length > 0 && clean.length < 140 && !/https?:|stack|\\\\|:\d+/i.test(clean)) {
      return clean;
    }
  }
  return "GitHub güncellemesi denetlenemedi veya indirilemedi.";
}

let status: UpdateStatus = {
  phase: "idle",
  checkedAt: readLastCheckedAt(),
};
let started = false;
const listeners = new Set<() => void>();

export const updateSnapshot = () => status;

export function subscribeUpdates(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(value: UpdateStatus) {
  status = value;
  listeners.forEach((listener) => listener());
}

export async function checkUpdates() {
  if (!isTauri()) {
    publish({
      phase: "idle",
      checkedAt: status.checkedAt,
      upToDate: false,
      message: "Güncelleme kontrolü kurulu Windows uygulamasında kullanılabilir.",
    });
    return;
  }
  if (
    status.phase === "checking" ||
    status.phase === "downloading" ||
    status.phase === "verifying" ||
    status.phase === "installing" ||
    status.phase === "ready"
  ) {
    return;
  }

  const prevUpToDate = status.upToDate;
  const prevCheckedAt = status.checkedAt;
  publish({
    phase: "checking",
    checkedAt: prevCheckedAt,
    upToDate: prevUpToDate,
  });

  let active = true;
  let unlisten: (() => void) | null = null;

  try {
    unlisten = await listen<UpdateProgressPayload>(UPDATE_PROGRESS_EVENT, (event) => {
      if (!active || !event?.payload) return;
      publish(applyUpdateProgress(status, event.payload));
    }).catch(() => null);

    const version = await invoke<string | null>("check_update");
    const checkedAt = Date.now();
    saveLastCheckedAt(checkedAt);

    if (version) {
      recordActivity({
        source: "settings",
        recordId: "updater",
        kind: "update",
        label: `${version} güncellemesi indirildi`,
      });
      publish({
        phase: "ready",
        version,
        checkedAt,
        upToDate: false,
      });
    } else {
      publish({
        phase: "idle",
        checkedAt,
        upToDate: true,
        message: "Yeni güncelleme bulunamadı.",
      });
    }
  } catch (error) {
    publish({
      phase: "error",
      checkedAt: prevCheckedAt,
      upToDate: prevUpToDate,
      message: safeUpdateError(error),
    });
  } finally {
    active = false;
    unlisten?.();
  }
}

export function startUpdates() {
  if (!started) {
    started = true;
    void checkUpdates();
  }
}

export async function installUpdate() {
  if (status.phase !== "ready" || window.localStorage.getItem("ack-deck.restore-journal.v1")) return;
  const version = status.version;
  const checkedAt = status.checkedAt;
  publish({ phase: "installing", version, checkedAt });
  window.dispatchEvent(new CustomEvent("ack-restore-active", { detail: true }));
  try {
    const desktop = await getDesktopStatus();
    const backup = await createFullBackup({ ...desktop.preferences, autoStart: desktop.autoStart }, desktop.version);
    await invoke("install_update", { content: JSON.stringify(backup, null, 2) });
  } catch {
    publish({
      phase: "ready",
      version,
      checkedAt,
      message: "Yedekleme veya kurulum tamamlanamadı. Güncelleme kurulmadı; tekrar deneyebilirsiniz.",
    });
  } finally {
    window.dispatchEvent(new CustomEvent("ack-restore-active", { detail: false }));
  }
}
