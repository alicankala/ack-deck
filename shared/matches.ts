function turkeyDateKey(d = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (y && m && day) return `${y}-${m}-${day}`;
  } catch {}
  return d.toISOString().slice(0, 10);
}

export type MatchTeamKey = "galatasaray" | "turkey" | "f1";

export type MatchItem = {
  id: string;
  team: MatchTeamKey;
  home: string;
  away: string;
  league: string;
  dateTime: string; // "YYYY-MM-DD HH:mm" (Europe/Istanbul)
  dateKey: string; // "YYYY-MM-DD"
  time: string; // "HH:mm"
  timestampMs: number;
  channels: string[];
  stadium?: string;
};

export type MatchesPayload = {
  updatedAt: number;
  matches: MatchItem[];
};

export const MATCHES_CACHE_KEY = "ack-deck.matches.v1";
export const MATCHES_NOTIFIED_KEY = "ack-deck.matches.notified.v1";
export const MATCHES_TTL_MS = 3 * 60 * 60 * 1000;
export const DEFAULT_MATCHES_WORKER_URL = "https://ack-deck-phone.ack-deck-cloud.workers.dev";

const TURKEY_WEEKDAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
const TURKEY_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function getStorage(): StorageLike | null {
  try {
    const g = globalThis as unknown as { localStorage?: StorageLike; window?: { localStorage?: StorageLike } };
    return g.window?.localStorage ?? g.localStorage ?? null;
  } catch {
    return null;
  }
}

function dispatchMatchesChanged(): void {
  try {
    const g = globalThis as unknown as {
      window?: { dispatchEvent?: (e: unknown) => void; Event?: new (t: string) => unknown };
      dispatchEvent?: (e: unknown) => void;
      Event?: new (t: string) => unknown;
    };
    const target = g.window ?? g;
    const Ev = target.Event ?? g.Event;
    if (target.dispatchEvent && Ev) {
      target.dispatchEvent(new Ev("ack-matches-changed"));
    }
  } catch {}
}

export function loadMatchesCache(): MatchesPayload | null {
  try {
    const raw = getStorage()?.getItem(MATCHES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MatchesPayload>;
    if (!parsed || typeof parsed.updatedAt !== "number" || !Array.isArray(parsed.matches)) return null;
    return { updatedAt: parsed.updatedAt, matches: parsed.matches };
  } catch {
    return null;
  }
}

export function saveMatchesCache(payload: MatchesPayload): void {
  try {
    getStorage()?.setItem(MATCHES_CACHE_KEY, JSON.stringify(payload));
    dispatchMatchesChanged();
  } catch {}
}

export function isMatchesCacheFresh(payload: MatchesPayload | null, now = Date.now()): boolean {
  if (!payload) return false;
  return now - payload.updatedAt < MATCHES_TTL_MS;
}

export function resolveWorkerBaseUrl(workerUrl?: string): string {
  const clean = workerUrl?.trim().replace(/\/+$/, "");
  if (clean) return clean;
  try {
    const g = globalThis as unknown as { location?: { origin?: string; protocol?: string } };
    if (g.location?.protocol?.startsWith("http") && !g.location.origin?.includes("localhost") && !g.location.origin?.includes("127.0.0.1")) {
      return g.location.origin!;
    }
  } catch {}
  return DEFAULT_MATCHES_WORKER_URL;
}

export async function fetchMatches(options?: { workerUrl?: string; force?: boolean }): Promise<MatchesPayload> {
  const cached = loadMatchesCache();
  if (!options?.force && isMatchesCacheFresh(cached)) {
    return cached!;
  }

  const base = resolveWorkerBaseUrl(options?.workerUrl);
  const url = `${base}/api/matches${options?.force ? "?force=1" : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    if (cached) return cached;
    throw new Error(`Maç takvimi alınamadı (${res.status}).`);
  }
  const json = (await res.json()) as { updatedAt?: number; matches?: MatchItem[] };
  const payload: MatchesPayload = {
    updatedAt: typeof json.updatedAt === "number" ? json.updatedAt : Date.now(),
    matches: Array.isArray(json.matches) ? json.matches : [],
  };
  saveMatchesCache(payload);
  return payload;
}

export function upcomingMatches(matches: MatchItem[], now = Date.now(), limit = 10): MatchItem[] {
  const cutoff = now - 150 * 60 * 1000; // Keep live/recently finished match visible for 2.5h
  return [...matches]
    .filter(m => m.timestampMs >= cutoff)
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .slice(0, limit);
}

export function nextMatchForTeam(matches: MatchItem[], team: MatchTeamKey, now = Date.now()): MatchItem | null {
  const list = upcomingMatches(matches, now, 30);
  return list.find(m => m.team === team) ?? null;
}

export function selectSummaryMatches(matches: MatchItem[], now = Date.now()): MatchItem[] {
  return upcomingMatches(matches, now, 2);
}

export function formatMatchWhen(match: MatchItem, now = Date.now()): string {
  const todayKey = turkeyDateKey(new Date(now));
  const tomorrowKey = turkeyDateKey(new Date(now + 24 * 60 * 60 * 1000));
  if (match.dateKey === todayKey) return `Bugün · ${match.time}`;
  if (match.dateKey === tomorrowKey) return `Yarın · ${match.time}`;
  const [y, m, d] = match.dateKey.split("-").map(Number);
  if (y && m && d) {
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const wd = TURKEY_WEEKDAYS[dt.getUTCDay()];
    const mon = TURKEY_MONTHS[m - 1];
    return `${d} ${mon} ${wd} · ${match.time}`;
  }
  return `${match.dateKey} · ${match.time}`;
}

export function formatMatchChannels(match: MatchItem): string {
  if (!match.channels || match.channels.length === 0) return "Yayıncı bekleniyor";
  return match.channels.join(" / ");
}

export function buildMatchesAiSummary(matches: MatchItem[], now = Date.now()): string {
  const upcoming = upcomingMatches(matches, now, 8);
  if (upcoming.length === 0) return "";
  return upcoming
    .map(m => {
      const teamLabel = m.team === "galatasaray" ? "Galatasaray" : m.team === "turkey" ? "A Milli" : "Formula 1";
      const channel = formatMatchChannels(m);
      const title = m.away ? `${m.home} - ${m.away}` : m.home;
      return `- [${teamLabel}] ${title} | ${formatMatchWhen(m, now)} (${m.dateKey}) | ${m.league} | Kanal: ${channel}`;
    })
    .join("\n");
}
