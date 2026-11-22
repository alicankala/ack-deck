import type { MatchItem, MatchTeamKey } from "./matches";

const DEFAULT_WORKER_URL = "https://ack-deck-phone.ack-deck-cloud.workers.dev";

function resolveWorkerUrl(workerUrl?: string): string {
  const clean = workerUrl?.trim().replace(/\/+$/, "");
  if (clean) return clean;
  try {
    const g = globalThis as unknown as { location?: { origin?: string; protocol?: string } };
    if (g.location?.protocol?.startsWith("http") && !g.location.origin?.includes("localhost") && !g.location.origin?.includes("127.0.0.1")) {
      return g.location.origin!;
    }
  } catch {}
  return DEFAULT_WORKER_URL;
}

export type StandingsLeagueKey = "super_lig" | "ucl" | "turkey" | "f1";

export type StandingRow = {
  rank: number;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalDiff: number;
  points: number;
  isHighlighted: boolean;
};

export type StandingsTable = {
  key: StandingsLeagueKey;
  title: string;
  groupName?: string;
  rows: StandingRow[];
};

export type StandingsPayload = {
  updatedAt: number;
  tables: StandingsTable[];
};

export type LineupPlayer = {
  name: string;
  jersey: string;
  position: string;
  formationPlace: number;
};

export type TeamLineup = {
  teamName: string;
  formation: string;
  players: LineupPlayer[];
};

export type MatchLineupStatus = "too_early" | "pending" | "confirmed";

export type MatchLineupPayload = {
  matchId: string;
  status: MatchLineupStatus;
  home?: TeamLineup;
  away?: TeamLineup;
  checkedAt: number;
  message?: string;
};

const STANDINGS_CACHE_KEY = "ack-deck.standings.v1";
const STANDINGS_TTL_MS = 2 * 60 * 60 * 1000;
const STANDINGS_LIVE_TTL_MS = 10 * 60 * 1000;

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

export function loadStandingsCache(): StandingsPayload | null {
  try {
    const raw = getStorage()?.getItem(STANDINGS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StandingsPayload>;
    if (!parsed || typeof parsed.updatedAt !== "number" || !Array.isArray(parsed.tables)) return null;
    return { updatedAt: parsed.updatedAt, tables: parsed.tables };
  } catch {
    return null;
  }
}

export function saveStandingsCache(payload: StandingsPayload): void {
  try {
    getStorage()?.setItem(STANDINGS_CACHE_KEY, JSON.stringify(payload));
  } catch {}
}

function isClientMatchLive(now = Date.now()): boolean {
  try {
    const raw = getStorage()?.getItem("ack-deck.matches.v1");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { matches?: Array<{ timestampMs?: number }> };
    if (!Array.isArray(parsed?.matches)) return false;
    return parsed.matches.some(
      (m) => typeof m.timestampMs === "number" && now >= m.timestampMs && now <= m.timestampMs + 3.5 * 3600 * 1000,
    );
  } catch {
    return false;
  }
}

export async function fetchStandings(options?: { workerUrl?: string; force?: boolean }): Promise<StandingsPayload> {
  const cached = loadStandingsCache();
  const now = Date.now();
  const ttl = isClientMatchLive(now) ? STANDINGS_LIVE_TTL_MS : STANDINGS_TTL_MS;
  if (!options?.force && cached && now - cached.updatedAt < ttl) {
    return cached;
  }
  const base = resolveWorkerUrl(options?.workerUrl);
  const url = `${base}/api/standings${options?.force ? "?force=1" : ""}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    if (cached) return cached;
    throw new Error(`Puan durumu alınamadı (${res.status}).`);
  }
  const json = (await res.json()) as { updatedAt?: number; tables?: StandingsTable[] };
  const payload: StandingsPayload = {
    updatedAt: typeof json.updatedAt === "number" ? json.updatedAt : Date.now(),
    tables: Array.isArray(json.tables) ? json.tables : [],
  };
  saveStandingsCache(payload);
  return payload;
}

export async function fetchMatchLineup(
  match: Pick<MatchItem, "id" | "team" | "dateKey" | "timestampMs" | "home" | "away">,
  options?: { workerUrl?: string; force?: boolean },
): Promise<MatchLineupPayload> {
  const base = resolveWorkerUrl(options?.workerUrl);
  const params = new URLSearchParams({
    matchId: match.id,
    team: match.team,
    dateKey: match.dateKey,
    timestampMs: String(match.timestampMs),
    home: match.home,
    away: match.away,
  });
  if (options?.force) params.set("force", "1");
  const res = await fetch(`${base}/api/match-lineup?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`İlk 11 bilgisi alınamadı (${res.status}).`);
  }
  return (await res.json()) as MatchLineupPayload;
}

/** Formats a player's short surname/label for compact pitch badges. */
export function shortPlayerName(fullName: string): string {
  const clean = fullName.trim();
  if (!clean) return "";
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return parts[parts.length - 1];
}

/** Groups 11 starters into pitch lines from Goalkeeper (bottom) to Attack (top). */
export function groupLineupRows(team: TeamLineup): LineupPlayer[][] {
  const sorted = [...team.players].sort((a, b) => a.formationPlace - b.formationPlace);
  if (sorted.length === 0) return [];
  const gk = sorted[0];
  const outfield = sorted.slice(1);
  const counts = (team.formation || "")
    .split("-")
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  const totalOutfield = counts.reduce((sum, n) => sum + n, 0);

  const lines = totalOutfield === outfield.length && counts.length > 0 ? counts : [4, 3, 3];
  const rows: LineupPlayer[][] = [[gk]];
  let cursor = 0;
  for (const count of lines) {
    const slice = outfield.slice(cursor, cursor + count);
    if (slice.length > 0) rows.push(slice);
    cursor += count;
  }
  if (cursor < outfield.length) {
    rows.push(outfield.slice(cursor));
  }
  return rows;
}

export function isLineupWindowOpen(timestampMs: number, now = Date.now()): boolean {
  const diff = timestampMs - now;
  // Open from 90 minutes before kickoff up to 4 hours after kickoff
  return diff <= 90 * 60 * 1000 && diff >= -4 * 60 * 60 * 1000;
}

export function isTurkeyOrGsTeam(team: MatchTeamKey): boolean {
  return team === "galatasaray" || team === "turkey";
}
