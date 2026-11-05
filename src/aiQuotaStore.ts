export type QuotaInfo = {
  date: string;
  fastUsed: number;
  fastLimit: number;
  fastRemaining: number;
  powerfulUsed: number;
  powerfulLimit: number;
  powerfulRemaining: number;
};

const STORAGE_KEY = "ack-ai-daily-quota";
export const FAST_LIMIT = 1500;
export const POWERFUL_LIMIT = 50;

export function todayDateKey(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
}

type StoredQuota = {
  date: string;
  fastDesktop?: number;
  powerfulDesktop?: number;
  fastCloud?: number;
  powerfulCloud?: number;
  fast?: number;
  powerful?: number;
};

export function getAiQuotaUsage(): QuotaInfo {
  const today = todayDateKey();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredQuota;
      if (parsed && parsed.date === today) {
        const fastDesktop = typeof parsed.fastDesktop === "number" ? parsed.fastDesktop : (typeof parsed.fast === "number" ? parsed.fast : 0);
        const powerfulDesktop = typeof parsed.powerfulDesktop === "number" ? parsed.powerfulDesktop : (typeof parsed.powerful === "number" ? parsed.powerful : 0);
        const fastCloud = typeof parsed.fastCloud === "number" ? parsed.fastCloud : 0;
        const powerfulCloud = typeof parsed.powerfulCloud === "number" ? parsed.powerfulCloud : 0;

        const fastUsed = fastDesktop + fastCloud;
        const powerfulUsed = powerfulDesktop + powerfulCloud;

        return {
          date: today,
          fastUsed,
          fastLimit: FAST_LIMIT,
          fastRemaining: Math.max(0, FAST_LIMIT - fastUsed),
          powerfulUsed,
          powerfulLimit: POWERFUL_LIMIT,
          powerfulRemaining: Math.max(0, POWERFUL_LIMIT - powerfulUsed),
        };
      }
    }
  } catch {}

  return {
    date: today,
    fastUsed: 0,
    fastLimit: FAST_LIMIT,
    fastRemaining: FAST_LIMIT,
    powerfulUsed: 0,
    powerfulLimit: POWERFUL_LIMIT,
    powerfulRemaining: POWERFUL_LIMIT,
  };
}

export function recordAiUsage(model: "fast" | "powerful") {
  const today = todayDateKey();
  let fastDesktop = 0;
  let powerfulDesktop = 0;
  let fastCloud = 0;
  let powerfulCloud = 0;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredQuota;
      if (parsed && parsed.date === today) {
        fastDesktop = typeof parsed.fastDesktop === "number" ? parsed.fastDesktop : (typeof parsed.fast === "number" ? parsed.fast : 0);
        powerfulDesktop = typeof parsed.powerfulDesktop === "number" ? parsed.powerfulDesktop : (typeof parsed.powerful === "number" ? parsed.powerful : 0);
        fastCloud = typeof parsed.fastCloud === "number" ? parsed.fastCloud : 0;
        powerfulCloud = typeof parsed.powerfulCloud === "number" ? parsed.powerfulCloud : 0;
      }
    }
  } catch {}

  if (model === "fast") fastDesktop += 1;
  else powerfulDesktop += 1;

  const next: StoredQuota = {
    date: today,
    fastDesktop,
    powerfulDesktop,
    fastCloud,
    powerfulCloud,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("ack-ai-quota-changed"));
  } catch {}
}

export function syncCloudAiUsage(cloudData: { date?: string; fast?: number; powerful?: number }) {
  if (!cloudData || typeof cloudData !== "object") return;
  const today = todayDateKey();
  if (cloudData.date && cloudData.date !== today) return;

  const cloudFast = typeof cloudData.fast === "number" ? cloudData.fast : 0;
  const cloudPowerful = typeof cloudData.powerful === "number" ? cloudData.powerful : 0;

  let fastDesktop = 0;
  let powerfulDesktop = 0;
  let fastCloud = 0;
  let powerfulCloud = 0;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredQuota;
      if (parsed && parsed.date === today) {
        fastDesktop = typeof parsed.fastDesktop === "number" ? parsed.fastDesktop : (typeof parsed.fast === "number" ? parsed.fast : 0);
        powerfulDesktop = typeof parsed.powerfulDesktop === "number" ? parsed.powerfulDesktop : (typeof parsed.powerful === "number" ? parsed.powerful : 0);
        fastCloud = typeof parsed.fastCloud === "number" ? parsed.fastCloud : 0;
        powerfulCloud = typeof parsed.powerfulCloud === "number" ? parsed.powerfulCloud : 0;
      }
    }
  } catch {}

  const nextFastCloud = Math.max(fastCloud, cloudFast);
  const nextPowerfulCloud = Math.max(powerfulCloud, cloudPowerful);

  if (nextFastCloud !== fastCloud || nextPowerfulCloud !== powerfulCloud) {
    const next: StoredQuota = {
      date: today,
      fastDesktop,
      powerfulDesktop,
      fastCloud: nextFastCloud,
      powerfulCloud: nextPowerfulCloud,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent("ack-ai-quota-changed"));
    } catch {}
  }
}
