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

type Props = {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

function MobileMatchRow({ match, now, showTeamTag = false }: { match: MatchItem; now: number; showTeamTag?: boolean }) {
  const isToday = match.dateKey === turkeyDateKey(new Date(now));
  const lineupOpen = match.team !== "f1" && isLineupWindowOpen(match.timestampMs, now);
  const matchTitle = match.away ? `${match.home} – ${match.away}` : match.home;
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
    <div className={`mobile-match-row ${isToday ? "is-today" : ""}`}>
      <div className="mobile-match-row-top">
        {showTeamTag && (
          <span className={`mobile-match-pill is-${match.team}`}>
            {match.team === "galatasaray" ? "GS" : match.team === "turkey" ? "A Milli" : "F1"}
          </span>
        )}
        <strong className="mobile-match-title">{matchTitle}</strong>
        {lineupOpen && (
          <button
            type="button"
            className="ack-lineup-check-btn"
            style={{ marginLeft: "auto" }}
            onClick={toggleLineup}
            aria-expanded={expanded}
          >
            {expanded ? "İlk 11 ▴" : "İlk 11 ▾"}
          </button>
        )}
      </div>
      <div className="mobile-match-row-bottom">
        <span className={`mobile-match-when ${isToday ? "is-today" : ""}`}>
          {formatMatchWhen(match, now)}{match.league ? ` · ${match.league}` : ""}
        </span>
        <span className="mobile-match-channel">{formatMatchChannels(match)}</span>
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

export function MobileMatchCard({ isCollapsed, onToggleCollapse }: Props) {
  const [tab, setTab] = useState<"matches" | "standings">("matches");
  const [matches, setMatches] = useState<MatchItem[]>(() => loadMatchesCache()?.matches ?? []);
  const [standings, setStandings] = useState<StandingsPayload | null>(() => loadStandingsCache());
  const [loading, setLoading] = useState(false);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [standingsError, setStandingsError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  async function refresh(force = false) {
    setLoading(true);
    try {
      const payload = await fetchMatches({ force });
      setMatches(payload.matches);
    } catch {} finally {
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
  const allUpcoming = upcomingMatches(matches, now, 6);
  const firstMatch = allUpcoming[0] ?? null;

  if (isCollapsed) {
    return (
      <div
        className="mobile-collapsed-card"
        onClick={onToggleCollapse}
        role="button"
        tabIndex={0}
        aria-expanded={false}
        title="Maç takvimini genişletmek için tıkla"
      >
        <div className="mobile-collapsed-left">
          <span className="mobile-collapsed-icon" aria-hidden="true">⚽</span>
          <span className="mobile-collapsed-title">Spor:</span>
          <span className="mobile-collapsed-text">
            {firstMatch
              ? `${firstMatch.away ? `${firstMatch.home} – ${firstMatch.away}` : firstMatch.home} · ${formatMatchWhen(firstMatch, now)}`
              : "Yaklaşan etkinlik yok"}
          </span>
        </div>
        <span className="mobile-collapsed-arrow" aria-hidden="true">⌄</span>
      </div>
    );
  }

  return (
    <article className="mobile-match-card" aria-label="Maç Takvimi">
      <div className="mobile-match-header">
        <div className="mobile-match-title-group">
          <span aria-hidden="true">⚽</span>
          <div>
            <h3>Spor Takvimi</h3>
            <span className="mobile-match-sub">Galatasaray · A Milli · F1</span>
          </div>
        </div>
        <div className="mobile-match-actions">
          <button
            type="button"
            className="mobile-match-refresh-btn"
            onClick={() => (tab === "matches" ? void refresh(true) : void refreshStandings(true))}
            disabled={tab === "matches" ? loading : standingsLoading}
            aria-label="Yenile"
            title="Yenile"
          >
            ↻
          </button>
          {onToggleCollapse && (
            <button
              type="button"
              className="mobile-card-collapse-btn"
              onClick={onToggleCollapse}
              title="Kartı daralt"
              aria-label="Maç takvimi kartını daralt"
            >
              ⌃
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <button
            type="button"
            className={`ack-standings-tab ${tab === "matches" ? "is-active" : ""}`}
            onClick={() => setTab("matches")}
          >
            Maçlar
          </button>
          <button
            type="button"
            className={`ack-standings-tab ${tab === "standings" ? "is-active" : ""}`}
            onClick={() => setTab("standings")}
          >
            Puan Durumu
          </button>
        </div>
        {tab === "matches" && allUpcoming.length > 2 && (
          <button
            type="button"
            className="mobile-match-toggle-btn"
            onClick={() => setShowAll(prev => !prev)}
          >
            {showAll ? "Özet" : `Tümü (${allUpcoming.length})`}
          </button>
        )}
      </div>

      {tab === "standings" ? (
        <StandingsPanel
          standings={standings}
          loading={standingsLoading}
          error={standingsError}
          onRefresh={() => void refreshStandings(true)}
        />
      ) : showAll ? (
        <div className="mobile-match-list">
          {allUpcoming.map(m => (
            <MobileMatchRow key={m.id} match={m} now={now} showTeamTag />
          ))}
        </div>
      ) : (
        <div className="mobile-match-list">
          {summaryMatches.length > 0 ? (
            summaryMatches.map(m => (
              <MobileMatchRow key={m.id} match={m} now={now} showTeamTag />
            ))
          ) : (
            <span className="mobile-match-empty">
              {loading ? "Yükleniyor..." : "Yaklaşan Galatasaray veya A Milli maçı yok."}
            </span>
          )}
        </div>
      )}
    </article>
  );
}
