import type { MatchItem, MatchesPayload, MatchTeamKey } from "../../shared/matches";

const MATCHES_KV_KEY = "matches:cache";
const MATCHES_KV_TTL_MS = 6 * 60 * 60 * 1000;

type SporekraniRawMatch = {
  id?: number;
  sport_id?: number;
  event_type_name?: string;
  league_name?: string;
  home_id?: number;
  away_id?: number;
  home_name?: string;
  away_name?: string;
  name?: string;
  date_time?: string;
  stadium?: string;
  channels?: Array<number | string | { name?: string }>;
};

const EXCLUDED_TEAM_OR_LEAGUE_RE = /\b(u19|u21|u17|u16|ümit|gençlik|genclik|kadın|kadin|espor|tefl|ampute|futsal)\b/i;

const TR_MONTH_MAP: Record<string, string> = {
  ocak: "01",
  şubat: "02",
  subat: "02",
  mart: "03",
  nisan: "04",
  mayıs: "05",
  mayis: "05",
  haziran: "06",
  temmuz: "07",
  ağustos: "08",
  agustos: "08",
  eylül: "09",
  eylul: "09",
  ekim: "10",
  kasım: "11",
  kasim: "11",
  aralık: "12",
  aralik: "12",
};

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function parseSporxMatches(html: string, team: MatchTeamKey): MatchItem[] {
  const results: MatchItem[] = [];
  const seen = new Set<string>();
  const rowRe = /<tr\s+class="([^"]*fixture-(?:date|match)-row[^"]*)"[^>]*>([\s\S]*?)<\/tr>/gi;
  let currentDateKey: string | null = null;
  let m: RegExpExecArray | null;

  while ((m = rowRe.exec(html)) !== null) {
    const cls = m[1];
    const body = m[2];
    if (cls.includes("fixture-date-row")) {
      const text = stripTags(body);
      const dm = text.match(/(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(\d{4})/);
      if (dm) {
        const mon = TR_MONTH_MAP[dm[2].toLocaleLowerCase("tr-TR")];
        if (mon) {
          currentDateKey = `${dm[3]}-${mon}-${dm[1].padStart(2, "0")}`;
        }
      }
      continue;
    }

    if (!currentDateKey) continue;
    const timeRaw = body.match(/class="fixture-match-time"[^>]*>([\s\S]*?)<\/span>/i)?.[1];
    const timeClean = timeRaw ? stripTags(timeRaw).replace(".", ":") : "00:00";
    const time = /^\d{2}:\d{2}$/.test(timeClean) ? timeClean : "00:00";

    const leagueRaw = body.match(/class="fixture-match-league"[^>]*>([\s\S]*?)<\/span>/i)?.[1];
    const league = leagueRaw ? stripTags(leagueRaw) : "";

    const teamNames = [...body.matchAll(/class="fixture-team-name"[^>]*>([\s\S]*?)<\/span>/gi)].map(x => stripTags(x[1]));
    if (teamNames.length < 2) continue;
    const [home, away] = teamNames;
    if (!home || !away) continue;
    if (EXCLUDED_TEAM_OR_LEAGUE_RE.test(`${league} ${home} ${away}`)) continue;

    const scoreRaw = body.match(/class="fixture-score"[^>]*>([\s\S]*?)<\/span>/i)?.[1];
    const score = scoreRaw ? stripTags(scoreRaw) : "-";
    if (score && score !== "-" && /\d/.test(score)) continue;

    const timestampMs = Date.parse(`${currentDateKey}T${time}:00+03:00`);
    if (!Number.isFinite(timestampMs)) continue;

    const id = `${team}:sporx:${currentDateKey}:${home}:${away}`;
    if (seen.has(id)) continue;
    seen.add(id);

    results.push({
      id,
      team,
      home,
      away,
      league,
      dateTime: `${currentDateKey} ${time}`,
      dateKey: currentDateKey,
      time,
      timestampMs,
      channels: [],
    });
  }

  return results;
}

function extractBalancedObject(src: string, startIdx: number): string | null {
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = startIdx; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inStr = false;
      }
      continue;
    }
    if (ch === "\"") {
      inStr = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return src.slice(startIdx, i + 1);
      }
    }
  }
  return null;
}

function extractSporekraniChannelMap(html: string): Map<number, string> {
  const map = new Map<number, string>();
  const re = /"(\d+)":\{"id":\1,"alt":[^}]*?"name":"((?:\\.|[^"\\])+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const id = Number(m[1]);
    if (!Number.isFinite(id)) continue;
    try {
      const name = (JSON.parse(`"${m[2]}"`) as string).trim();
      if (name) map.set(id, name);
    } catch {
      const fallback = m[2].trim();
      if (fallback) map.set(id, fallback);
    }
  }
  return map;
}

export function parseSporekraniMatches(html: string, team: MatchTeamKey): MatchItem[] {
  const results: MatchItem[] = [];
  const seenIds = new Set<string>();
  const channelMap = extractSporekraniChannelMap(html);
  const needle = "\"sport_id\":1";
  let pos = 0;

  while (pos < html.length) {
    const hit = html.indexOf(needle, pos);
    if (hit < 0) break;
    pos = hit + needle.length;

    const objStart = html.lastIndexOf("{", hit);
    if (objStart < 0 || hit - objStart > 40) continue;

    const jsonText = extractBalancedObject(html, objStart);
    if (!jsonText) continue;

    let raw: SporekraniRawMatch;
    try {
      raw = JSON.parse(jsonText) as SporekraniRawMatch;
    } catch {
      continue;
    }

    if (raw.sport_id !== 1 || raw.event_type_name !== "match" || !raw.date_time) continue;
    const league = (raw.league_name ?? "").trim();
    const home = (raw.home_name ?? "").trim();
    const away = (raw.away_name ?? "").trim();
    const name = (raw.name ?? "").trim();
    if (!home || !away) continue;

    if (EXCLUDED_TEAM_OR_LEAGUE_RE.test(`${league} ${name} ${home} ${away}`)) continue;

    if (team === "galatasaray") {
      const isSeniorGsId = raw.home_id === 5859 || raw.away_id === 5859;
      const hasGsName = home === "Galatasaray" || away === "Galatasaray";
      if (!isSeniorGsId && !hasGsName) continue;
    } else {
      const hasTurkeyName = home === "Türkiye" || away === "Türkiye";
      if (!hasTurkeyName) continue;
    }

    const dtMatch = raw.date_time.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
    if (!dtMatch) continue;
    const dateKey = dtMatch[1];
    const time = dtMatch[2];
    const timestampMs = Date.parse(`${dateKey}T${time}:00+03:00`);
    if (!Number.isFinite(timestampMs)) continue;

    const id = `${team}:${raw.id ?? `${dateKey}_${time}_${home}_${away}`}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const channels = Array.isArray(raw.channels)
      ? raw.channels
          .map(c => {
            if (typeof c === "number" || typeof c === "string") {
              return channelMap.get(Number(c)) ?? "";
            }
            return (c?.name ?? "").trim();
          })
          .filter(Boolean)
      : [];

    results.push({
      id,
      team,
      home,
      away,
      league,
      dateTime: `${dateKey} ${time}`,
      dateKey,
      time,
      timestampMs,
      channels,
      ...(raw.stadium?.trim() ? { stadium: raw.stadium.trim() } : {}),
    });
  }

  return results;
}

async function fetchTeamFromSporekrani(team: MatchTeamKey): Promise<MatchItem[]> {
  const slug = team === "galatasaray" ? "galatasaray" : "turkiye";
  const res = await fetch(`https://www.sporekrani.com/home/team/${slug}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept-Language": "tr-TR,tr;q=0.9",
    },
  });
  if (!res.ok) {
    throw new Error(`Sporekrani HTTP ${res.status}`);
  }
  const html = await res.text();
  return parseSporekraniMatches(html, team);
}

async function fetchTeamFromSporx(team: MatchTeamKey): Promise<MatchItem[]> {
  const url = team === "galatasaray" ? "https://www.sporx.com/galatasaray-fiksturu" : "https://www.sporx.com/turkiye-fiksturu";
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept-Language": "tr-TR,tr;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`Sporx HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  let html: string;
  try {
    html = new TextDecoder("windows-1254").decode(buf);
  } catch {
    html = new TextDecoder("utf-8").decode(buf);
  }
  return parseSporxMatches(html, team);
}

export function mergeMatchSources(primary: MatchItem[], fallback: MatchItem[], now = Date.now()): MatchItem[] {
  const cutoff = now - 150 * 60_000;
  const existingKeys = new Set(primary.map(m => `${m.team}|${m.dateKey}`));
  const merged = [...primary];
  for (const item of fallback) {
    if (item.timestampMs < cutoff) continue;
    if (existingKeys.has(`${item.team}|${item.dateKey}`)) continue;
    existingKeys.add(`${item.team}|${item.dateKey}`);
    merged.push(item);
  }
  return merged.sort((a, b) => a.timestampMs - b.timestampMs);
}

type EspnF1Competition = {
  type?: { abbreviation?: string; text?: string };
  date?: string;
};

type EspnF1Event = {
  id?: string;
  name?: string;
  date?: string;
  circuit?: { fullName?: string };
  competitions?: EspnF1Competition[];
};

type EspnF1Scoreboard = {
  leagues?: Array<{ calendar?: Array<{ startDate?: string; endDate?: string; label?: string }> }>;
  events?: EspnF1Event[];
};

function istanbulDateAndTime(isoDate: string): { dateKey: string; time: string } | null {
  const ms = Date.parse(isoDate);
  if (!Number.isFinite(ms)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(ms));
    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    const y = get("year");
    const m = get("month");
    const d = get("day");
    const h = get("hour");
    const min = get("minute");
    if (y && m && d && h && min) {
      return { dateKey: `${y}-${m}-${d}`, time: `${h === "24" ? "00" : h}:${min}` };
    }
  } catch {}
  return null;
}

export function parseEspnF1Race(ev: EspnF1Event): MatchItem | null {
  if (!ev.id || !ev.name) return null;
  const raceComp = ev.competitions?.find((c) => c.type?.abbreviation === "Race");
  const iso = raceComp?.date || ev.date;
  if (!iso) return null;
  const timestampMs = Date.parse(iso);
  if (!Number.isFinite(timestampMs)) return null;
  const dt = istanbulDateAndTime(iso);
  if (!dt) return null;
  return {
    id: `f1:${ev.id}`,
    team: "f1",
    home: ev.name.trim(),
    away: "",
    league: "Formula 1",
    dateTime: `${dt.dateKey} ${dt.time}`,
    dateKey: dt.dateKey,
    time: dt.time,
    timestampMs,
    channels: ["beIN Sports / F1 TV"],
    ...(ev.circuit?.fullName?.trim() ? { stadium: ev.circuit.fullName.trim() } : {}),
  };
}

async function fetchUpcomingF1Races(now = Date.now()): Promise<MatchItem[]> {
  const cutoff = now - 150 * 60_000;
  const base = await fetch("https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard", {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    signal: AbortSignal.timeout(6000),
  });
  if (!base.ok) return [];
  const data = (await base.json()) as EspnF1Scoreboard;
  const results = new Map<string, MatchItem>();

  for (const ev of data.events ?? []) {
    const item = parseEspnF1Race(ev);
    if (item && item.timestampMs >= cutoff) results.set(item.id, item);
  }

  const upcomingCal = (data.leagues?.[0]?.calendar ?? [])
    .filter((entry) => entry.endDate && Date.parse(entry.endDate) >= cutoff)
    .slice(0, 3);

  await Promise.allSettled(
    upcomingCal.map(async (entry) => {
      const endMs = Date.parse(entry.endDate!);
      if (!Number.isFinite(endMs)) return;
      const ymd = new Date(endMs).toISOString().slice(0, 10).replace(/-/g, "");
      const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard?dates=${ymd}`, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return;
      const calData = (await res.json()) as EspnF1Scoreboard;
      for (const ev of calData.events ?? []) {
        const item = parseEspnF1Race(ev);
        if (item && item.timestampMs >= cutoff) results.set(item.id, item);
      }
    }),
  );

  return [...results.values()];
}

export async function getMatchesWithCache(
  kv: { get(key: string, type: "json"): Promise<unknown>; put(key: string, val: string, opts?: { expirationTtl?: number }): Promise<void> },
  force = false,
  now = Date.now(),
): Promise<MatchesPayload & { cached?: boolean }> {
  const cached = (await kv.get(MATCHES_KV_KEY, "json").catch(() => null)) as MatchesPayload | null;
  if (!force && cached && Array.isArray(cached.matches) && now - cached.updatedAt < MATCHES_KV_TTL_MS) {
    return { ...cached, cached: true };
  }

  try {
    const [gsSporekrani, trSporekrani, gsSporx, trSporx, f1Races] = await Promise.allSettled([
      fetchTeamFromSporekrani("galatasaray"),
      fetchTeamFromSporekrani("turkey"),
      fetchTeamFromSporx("galatasaray"),
      fetchTeamFromSporx("turkey"),
      fetchUpcomingF1Races(now),
    ]);
    const primary = [
      ...(gsSporekrani.status === "fulfilled" ? gsSporekrani.value : []),
      ...(trSporekrani.status === "fulfilled" ? trSporekrani.value : []),
      ...(f1Races.status === "fulfilled" ? f1Races.value : []),
    ];
    const fallback = [
      ...(gsSporx.status === "fulfilled" ? gsSporx.value : []),
      ...(trSporx.status === "fulfilled" ? trSporx.value : []),
    ];
    const combined = mergeMatchSources(primary, fallback, now);

    if (combined.length > 0 || [gsSporekrani, trSporekrani, gsSporx, trSporx, f1Races].some(r => r.status === "fulfilled")) {
      const payload: MatchesPayload = { updatedAt: now, matches: combined };
      await kv.put(MATCHES_KV_KEY, JSON.stringify(payload), { expirationTtl: 86400 }).catch(() => {});
      return { ...payload, cached: false };
    }
  } catch {}

  if (cached && Array.isArray(cached.matches)) {
    return { ...cached, cached: true };
  }
  return { updatedAt: now, matches: [], cached: false };
}
