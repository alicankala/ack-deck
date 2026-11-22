import { useEffect, useState } from "react";
import {
  fetchMatches,
  formatMatchChannels,
  formatMatchWhen,
  loadMatchesCache,
  selectSummaryMatches,
  upcomingMatches,
  type MatchItem,
} from "../../shared/matches";
import {
  fetchMatchLineup,
  fetchStandings,
  isLineupWindowOpen,
  loadStandingsCache,
  type MatchLineupPayload,
  type StandingsPayload,
} from "../../shared/matchDetails";
import { MatchLineupPitch, StandingsPanel } from "../../shared/MatchDetailsViews";
import "../../shared/matchDetails.css";
import { turkeyDateKey } from "../../shared/dormMenu";
import { Icon } from "./Icon";

function MatchRow({ match, now, showTeamTag = false }: { match: MatchItem; now: number; showTeamTag?: boolean }) {
  const todayKey = turkeyDateKey(new Date(now));
  const isToday = match.dateKey === todayKey;
  const teamBadge = match.team === "galatasaray" ? "GS" : match.team === "turkey" ? "A Milli" : "F1";
  const matchTitle = match.away ? `${match.home} – ${match.away}` : match.home;
  const lineupOpen = match.team !== "f1" && isLineupWindowOpen(match.timestampMs, now);
  const [expanded, setExpanded] = useState(false);
  const [lineup, setLineup] = useState<MatchLineupPayload | null>(null);
  const [lineupLoading, setLineupLoading] = useState(false);
  const [lineupError, setLineupError] = useState<string | null>(null);

  async function loadLineup(force = false) {
    setLineupLoading(true);
    setLineupError(null);
    try {
      const data = await fetchMatchLineup(match, { force });
      setLineup(data);
    } catch (err) {
      setLineupError(err instanceof Error ? err.message : "İlk 11 alınamadı.");
    } finally {
      setLineupLoading(false);
    }
  }

  function toggleLineup() {
    const next = !expanded;
    setExpanded(next);
    if (next && !lineup) {
      void loadLineup(false);
    }
  }

  return (
    <div className={`match-item-row ${isToday ? "is-today" : ""}`} style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
        <div className="match-item-main">
          <div className="match-item-top">
            {showTeamTag && <span className={`match-team-pill is-${match.team}`}>{teamBadge}</span>}
            <strong className="match-item-title" title={matchTitle}>
              {matchTitle}
            </strong>
          </div>
          <div className="match-item-meta">
            <span className={`match-when ${isToday ? "is-today" : ""}`}>{formatMatchWhen(match, now)}</span>
            {match.league && <span className="match-league">· {match.league}</span>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          {lineupOpen && (
            <button
              type="button"
              className="ack-lineup-check-btn"
              onClick={toggleLineup}
              aria-expanded={expanded}
            >
              {expanded ? "İlk 11 ▴" : "İlk 11 ▾"}
            </button>
          )}
          <span className="match-channel-badge" title="Yayıncı kanal">
            {formatMatchChannels(match)}
          </span>
        </div>
      </div>
      {expanded && lineupOpen && (
        <MatchLineupPitch
          lineup={lineup}
          loading={lineupLoading}
          error={lineupError}
          preferredTeam={match.team}
          onRefresh={() => void loadLineup(true)}
        />
      )}
    </div>
  );
}

export function MatchWidget() {
  const [tab, setTab] = useState<"matches" | "standings">("matches");
  const [matches, setMatches] = useState<MatchItem[]>(() => loadMatchesCache()?.matches ?? []);
  const [standings, setStandings] = useState<StandingsPayload | null>(() => loadStandingsCache());
  const [loading, setLoading] = useState(false);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [error, setError] = useState("");
  const [standingsError, setStandingsError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  async function refresh(force = false) {
    setLoading(true);
    setError("");
    try {
      const payload = await fetchMatches({ force });
      setMatches(payload.matches);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Maç takvimi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshStandings(force = false) {
    setStandingsLoading(true);
    setStandingsError(null);
    try {
      const payload = await fetchStandings({ force });
      setStandings(payload);
    } catch (err) {
      setStandingsError(err instanceof Error ? err.message : "Puan durumu yüklenemedi.");
    } finally {
      setStandingsLoading(false);
    }
  }

  useEffect(() => {
    void refresh(false);
    const onUpdated = () => {
      const cached = loadMatchesCache();
      if (cached) setMatches(cached.matches);
    };
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    window.addEventListener("ack-matches-changed", onUpdated);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("ack-matches-changed", onUpdated);
    };
  }, []);

  useEffect(() => {
    if (tab === "standings" && !standings && !standingsLoading) {
      void refreshStandings(false);
    }
  }, [tab]);

  const summaryMatches = selectSummaryMatches(matches, now);
  const allUpcoming = upcomingMatches(matches, now, 8);

  return (
    <section className="dashboard-matches-card surface" aria-labelledby="matches-heading">
      <div className="dashboard-section-top">
        <div className="pomodoro-title-wrap">
          <span className="overview-icon-small" aria-hidden="true">
            ⚽
          </span>
          <div>
            <h2 id="matches-heading">Spor Takvimi</h2>
            <small>Galatasaray · A Milli · F1</small>
          </div>
        </div>

        <div className="match-card-actions">
          <div className="ack-standings-tabs" role="tablist" aria-label="Görünüm">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "matches"}
              className={`ack-standings-tab ${tab === "matches" ? "is-active" : ""}`}
              onClick={() => setTab("matches")}
            >
              Takvim
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "standings"}
              className={`ack-standings-tab ${tab === "standings" ? "is-active" : ""}`}
              onClick={() => setTab("standings")}
            >
              Puan Durumu
            </button>
          </div>
          {tab === "matches" && allUpcoming.length > 2 && (
            <button
              type="button"
              className={`ack-standings-tab ${showAll ? "is-active" : ""}`}
              onClick={() => setShowAll(prev => !prev)}
            >
              {showAll ? "Özet" : `Tümü (${allUpcoming.length})`}
            </button>
          )}
          <button
            type="button"
            className="dorm-refresh-btn"
            onClick={() => (tab === "matches" ? void refresh(true) : void refreshStandings(true))}
            disabled={tab === "matches" ? loading : standingsLoading}
            title="Yenile"
            aria-label="Yenile"
          >
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </div>

      {tab === "standings" ? (
        <StandingsPanel
          standings={standings}
          loading={standingsLoading}
          error={standingsError}
          onRefresh={() => void refreshStandings(true)}
        />
      ) : error && matches.length === 0 ? (
        <p className="match-empty-text">{error}</p>
      ) : showAll ? (
        <div className="match-list-scroll">
          {allUpcoming.map(m => (
            <MatchRow key={m.id} match={m} now={now} showTeamTag />
          ))}
        </div>
      ) : (
        <div className="match-summary-list">
          {summaryMatches.length > 0 ? (
            summaryMatches.map(m => (
              <MatchRow key={m.id} match={m} now={now} showTeamTag />
            ))
          ) : (
            <p className="match-empty-text">
              {loading ? "Yükleniyor..." : "Yaklaşan Galatasaray veya A Milli maçı bulunamadı."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
