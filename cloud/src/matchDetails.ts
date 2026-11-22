import type { MatchTeamKey } from "../../shared/matches";
import type {
  LineupPlayer,
  MatchLineupPayload,
  StandingRow,
  StandingsLeagueKey,
  StandingsPayload,
  StandingsTable,
  TeamLineup,
} from "../../shared/matchDetails";

const STANDINGS_KV_KEY = "standings:cache";
const STANDINGS_KV_TTL_MS = 2 * 60 * 60 * 1000;
const STANDINGS_MATCH_LIVE_TTL_MS = 10 * 60 * 1000;
const LINEUP_PENDING_COOLDOWN_MS = 2 * 60 * 1000;
const LINEUP_CONFIRMED_TTL_MS = 6 * 60 * 60 * 1000;

type KvLike = {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, val: string, opts?: { expirationTtl?: number }): Promise<void>;
};

type EspnStat = { name?: string; value?: number };
type EspnStandingEntry = {
  team?: { displayName?: string; shortDisplayName?: string; name?: string };
  athlete?: { displayName?: string; shortName?: string };
  stats?: EspnStat[];
};
type EspnStandingGroup = {
  name?: string;
  abbreviation?: string;
  standings?: { entries?: EspnStandingEntry[] };
};
type EspnStandingsResponse = {
  name?: string;
  children?: EspnStandingGroup[];
  standings?: { entries?: EspnStandingEntry[] };
};

function readStat(stats: EspnStat[] | undefined, name: string, fallback = 0): number {
  const hit = stats?.find((s) => s.name === name);
  return typeof hit?.value === "number" && Number.isFinite(hit.value) ? Math.round(hit.value) : fallback;
}

function normalizeTeamName(raw: string): string {
  return raw.replace(/\bTurkey\b/gi, "Türkiye").trim();
}

function mapStandingEntries(entries: EspnStandingEntry[], highlightTerms: string[]): StandingRow[] {
  return entries
    .map((entry, idx) => {
      const rawName = entry.team?.shortDisplayName || entry.team?.displayName || entry.team?.name || "";
      const team = normalizeTeamName(rawName);
      const lower = rawName.toLowerCase();
      const stats = entry.stats;
      const rank = readStat(stats, "rank", idx + 1);
      return {
        rank: rank > 0 ? rank : idx + 1,
        team,
        played: readStat(stats, "gamesPlayed"),
        won: readStat(stats, "wins"),
        drawn: readStat(stats, "ties"),
        lost: readStat(stats, "losses"),
        goalDiff: readStat(stats, "pointDifferential"),
        points: readStat(stats, "points"),
        isHighlighted: highlightTerms.some((term) => lower.includes(term)),
      };
    })
    .filter((r) => r.team.length > 0)
    .sort((a, b) => a.rank - b.rank || b.points - a.points || b.goalDiff - a.goalDiff);
}

export function parseEspnStandings(
  json: EspnStandingsResponse,
  key: StandingsLeagueKey,
  title: string,
  highlightTerms: string[],
  filterToHighlightedGroup = false,
): StandingsTable | null {
  const groups = Array.isArray(json.children) && json.children.length > 0
    ? json.children
    : json.standings?.entries
      ? [{ name: json.name, standings: json.standings }]
      : [];

  if (groups.length === 0) return null;

  if (filterToHighlightedGroup) {
    for (const group of groups) {
      const rows = mapStandingEntries(group.standings?.entries ?? [], highlightTerms);
      if (rows.some((r) => r.isHighlighted)) {
        return {
          key,
          title,
          ...(group.name ? { groupName: group.name } : {}),
          rows,
        };
      }
    }
    return null;
  }

  const first = groups[0];
  const rows = mapStandingEntries(first.standings?.entries ?? [], highlightTerms);
  if (rows.length === 0) return null;
  return {
    key,
    title,
    ...(groups.length > 1 && first.name ? { groupName: first.name } : {}),
    rows,
  };
}

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function isAnyTrackedMatchLive(kv: KvLike, now: number): Promise<boolean> {
  const cachedMatches = (await kv.get("matches:cache", "json").catch(() => null)) as {
    matches?: Array<{ timestampMs?: number }>;
  } | null;
  if (!cachedMatches || !Array.isArray(cachedMatches.matches)) return false;
  return cachedMatches.matches.some(
    (m) => typeof m.timestampMs === "number" && now >= m.timestampMs && now <= m.timestampMs + 3.5 * 3600 * 1000,
  );
}

function parseEspnF1Standings(json: EspnStandingsResponse): StandingsTable | null {
  const driverGroup = json.children?.find((c) => /driver/i.test(c.name ?? "")) ?? json.children?.[0];
  const entries = driverGroup?.standings?.entries ?? [];
  if (entries.length === 0) return null;
  const rows: StandingRow[] = entries
    .map((entry, idx) => {
      const name = (entry.athlete?.displayName || entry.athlete?.shortName || entry.team?.displayName || "").trim();
      const rank = readStat(entry.stats, "rank", idx + 1);
      const points = readStat(entry.stats, "championshipPts", 0);
      return {
        rank: rank > 0 ? rank : idx + 1,
        team: name,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalDiff: 0,
        points,
        isHighlighted: false,
      };
    })
    .filter((r) => r.team.length > 0)
    .sort((a, b) => a.rank - b.rank || b.points - a.points);
  if (rows.length === 0) return null;
  return { key: "f1", title: "Formula 1 (Pilotlar)", rows };
}

export async function getStandingsWithCache(
  kv: KvLike,
  force = false,
  now = Date.now(),
): Promise<StandingsPayload & { cached?: boolean }> {
  const cached = (await kv.get(STANDINGS_KV_KEY, "json").catch(() => null)) as StandingsPayload | null;
  const ttlMs = (await isAnyTrackedMatchLive(kv, now)) ? STANDINGS_MATCH_LIVE_TTL_MS : STANDINGS_KV_TTL_MS;
  if (!force && cached && Array.isArray(cached.tables) && now - cached.updatedAt < ttlMs) {
    return { ...cached, cached: true };
  }

  const [superLigRes, uclRes, nationsRes, wcqRes, f1Res] = await Promise.allSettled([
    fetchJson<EspnStandingsResponse>("https://site.api.espn.com/apis/v2/sports/soccer/tur.1/standings"),
    fetchJson<EspnStandingsResponse>("https://site.api.espn.com/apis/v2/sports/soccer/uefa.champions/standings"),
    fetchJson<EspnStandingsResponse>("https://site.api.espn.com/apis/v2/sports/soccer/uefa.nations/standings"),
    fetchJson<EspnStandingsResponse>("https://site.api.espn.com/apis/v2/sports/soccer/fifa.worldq.uefa/standings"),
    fetchJson<EspnStandingsResponse>("https://site.api.espn.com/apis/v2/sports/racing/f1/standings"),
  ]);

  const tables: StandingsTable[] = [];
  if (superLigRes.status === "fulfilled") {
    const t = parseEspnStandings(superLigRes.value, "super_lig", "Süper Lig", ["galatasaray"]);
    if (t) tables.push(t);
  }
  if (uclRes.status === "fulfilled") {
    const t = parseEspnStandings(uclRes.value, "ucl", "Şampiyonlar Ligi", ["galatasaray"]);
    if (t) tables.push(t);
  }

  const nationsTable =
    nationsRes.status === "fulfilled"
      ? parseEspnStandings(nationsRes.value, "turkey", "A Milli (Uluslar Ligi)", ["turkey", "türkiye", "turkiye"], true)
      : null;
  const wcqTable =
    wcqRes.status === "fulfilled"
      ? parseEspnStandings(wcqRes.value, "turkey", "A Milli (DK Elemeleri)", ["turkey", "türkiye", "turkiye"], true)
      : null;

  // Prefer whichever national competition currently has matches played (or fallback to nations)
  const nationsPlayed = nationsTable?.rows.some((r) => r.played > 0) ?? false;
  const wcqPlayed = wcqTable?.rows.some((r) => r.played > 0) ?? false;
  const turkeyTable = wcqPlayed && !nationsPlayed ? wcqTable : nationsTable ?? wcqTable;
  if (turkeyTable) tables.push(turkeyTable);

  if (f1Res.status === "fulfilled") {
    const t = parseEspnF1Standings(f1Res.value);
    if (t) tables.push(t);
  }

  if (tables.length > 0) {
    const payload: StandingsPayload = { updatedAt: now, tables };
    await kv.put(STANDINGS_KV_KEY, JSON.stringify(payload), { expirationTtl: 86400 }).catch(() => {});
    return { ...payload, cached: false };
  }

  if (cached && Array.isArray(cached.tables)) {
    return { ...cached, cached: true };
  }
  return { updatedAt: now, tables: [], cached: false };
}

type EspnRosterEntry = {
  starter?: boolean;
  jersey?: string;
  formationPlace?: string | number;
  position?: { abbreviation?: string; name?: string };
  athlete?: { displayName?: string; shortName?: string };
};

type EspnTeamRoster = {
  homeAway?: "home" | "away";
  formation?: string;
  team?: { displayName?: string; shortDisplayName?: string };
  roster?: EspnRosterEntry[];
};

type EspnSummaryResponse = {
  rosters?: EspnTeamRoster[];
};

export function parseEspnLineups(json: EspnSummaryResponse): { home?: TeamLineup; away?: TeamLineup; confirmed: boolean } {
  const rosters = Array.isArray(json.rosters) ? json.rosters : [];
  const parseSide = (r: EspnTeamRoster | undefined): TeamLineup | undefined => {
    if (!r) return undefined;
    const starters: LineupPlayer[] = (r.roster ?? [])
      .filter((p) => p.starter === true && p.athlete?.displayName)
      .map((p, idx) => ({
        name: (p.athlete?.shortName || p.athlete?.displayName || "").trim(),
        jersey: String(p.jersey ?? "").trim(),
        position: (p.position?.abbreviation ?? "").trim(),
        formationPlace: Number(p.formationPlace) || idx + 1,
      }))
      .sort((a, b) => a.formationPlace - b.formationPlace);
    if (starters.length < 11) return undefined;
    return {
      teamName: normalizeTeamName(r.team?.shortDisplayName || r.team?.displayName || ""),
      formation: (r.formation ?? "").trim(),
      players: starters.slice(0, 11),
    };
  };

  const homeRoster = rosters.find((r) => r.homeAway === "home") ?? rosters[0];
  const awayRoster = rosters.find((r) => r.homeAway === "away") ?? rosters[1];
  const home = parseSide(homeRoster);
  const away = parseSide(awayRoster);
  return {
    home,
    away,
    confirmed: Boolean(home && away),
  };
}

type EspnScoreboardEvent = {
  id?: string;
  date?: string;
  name?: string;
};

function istanbulDateKey(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(isoDate));
  } catch {
    return isoDate.slice(0, 10);
  }
}

async function findEspnMatchEvent(
  team: MatchTeamKey,
  dateKey: string,
): Promise<{ leagueSlug: string; eventId: string } | null> {
  const leagues =
    team === "galatasaray"
      ? ["tur.1", "uefa.champions"]
      : ["uefa.nations", "fifa.worldq.uefa", "fifa.friendly"];
  const teamPattern = team === "galatasaray" ? /galatasaray/i : /\b(turkey|türkiye|turkiye)\b/i;

  const responses = await Promise.allSettled(
    leagues.map(async (slug) => {
      const data = await fetchJson<{ events?: EspnScoreboardEvent[] }>(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard`,
        6000,
      );
      return { slug, events: data.events ?? [] };
    }),
  );

  for (const res of responses) {
    if (res.status !== "fulfilled") continue;
    for (const ev of res.value.events) {
      if (!ev.id || !ev.name || !ev.date) continue;
      if (!teamPattern.test(ev.name)) continue;
      if (istanbulDateKey(ev.date) === dateKey) {
        return { leagueSlug: res.value.slug, eventId: ev.id };
      }
    }
  }
  return null;
}

export async function getMatchLineupWithCache(
  kv: KvLike,
  params: { matchId: string; team: MatchTeamKey; dateKey: string; timestampMs: number },
  force = false,
  now = Date.now(),
): Promise<MatchLineupPayload> {
  const { matchId, team, dateKey, timestampMs } = params;

  if (timestampMs - now > 90 * 60 * 1000) {
    return {
      matchId,
      status: "too_early",
      checkedAt: now,
      message: "İlk 11 maçtan ~1 saat önce açıklanır.",
    };
  }

  const kvKey = `lineup:${matchId}`;
  const cached = (await kv.get(kvKey, "json").catch(() => null)) as MatchLineupPayload | null;
  if (cached) {
    if (cached.status === "confirmed" && now - cached.checkedAt < LINEUP_CONFIRMED_TTL_MS) {
      return cached;
    }
    if (!force && cached.status === "pending" && now - cached.checkedAt < LINEUP_PENDING_COOLDOWN_MS) {
      return cached;
    }
  }

  try {
    const found = await findEspnMatchEvent(team, dateKey);
    if (found) {
      const summary = await fetchJson<EspnSummaryResponse>(
        `https://site.api.espn.com/apis/site/v2/sports/soccer/${found.leagueSlug}/summary?event=${found.eventId}`,
        7000,
      );
      const parsed = parseEspnLineups(summary);
      if (parsed.confirmed && parsed.home && parsed.away) {
        const confirmedPayload: MatchLineupPayload = {
          matchId,
          status: "confirmed",
          home: parsed.home,
          away: parsed.away,
          checkedAt: now,
        };
        await kv.put(kvKey, JSON.stringify(confirmedPayload), { expirationTtl: 21600 }).catch(() => {});
        return confirmedPayload;
      }
    }
  } catch {}

  const pendingPayload: MatchLineupPayload = {
    matchId,
    status: "pending",
    checkedAt: now,
    message: "Resmi ilk 11 henüz açıklanmadı.",
  };
  await kv.put(kvKey, JSON.stringify(pendingPayload), { expirationTtl: 180 }).catch(() => {});
  return pendingPayload;
}
