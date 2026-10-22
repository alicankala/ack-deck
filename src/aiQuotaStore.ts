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

function todayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getAiQuotaUsage(): QuotaInfo {
  const today = todayDateKey();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.date === today) {
        const fastUsed = typeof parsed.fast === "number" ? parsed.fast : 0;
        const powerfulUsed = typeof parsed.powerful === "number" ? parsed.powerful : 0;
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
  const usage = getAiQuotaUsage();
  const next = {
    date: usage.date,
    fast: usage.fastUsed + (model === "fast" ? 1 : 0),
    powerful: usage.powerfulUsed + (model === "powerful" ? 1 : 0),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("ack-ai-quota-changed"));
  } catch {}
}
