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
import { turkeyDateKey } from "../../shared/dormMenu";

type Props = {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

function MobileMatchRow({ match, now, showTeamTag = false }: { match: MatchItem; now: number; showTeamTag?: boolean }) {
  const isToday = match.dateKey === turkeyDateKey(new Date(now));
  return (
    <div className={`mobile-match-row ${isToday ? "is-today" : ""}`}>
      <div className="mobile-match-row-top">
        {showTeamTag && (
          <span className={`mobile-match-pill is-${match.team}`}>
            {match.team === "galatasaray" ? "GS" : "A Milli"}
          </span>
        )}
        <strong className="mobile-match-title">{match.home} – {match.away}</strong>
      </div>
      <div className="mobile-match-row-bottom">
        <span className={`mobile-match-when ${isToday ? "is-today" : ""}`}>
          {formatMatchWhen(match, now)}{match.league ? ` · ${match.league}` : ""}
        </span>
        <span className="mobile-match-channel">{formatMatchChannels(match)}</span>
      </div>
    </div>
  );
}

export function MobileMatchCard({ isCollapsed, onToggleCollapse }: Props) {
  const [matches, setMatches] = useState<MatchItem[]>(() => loadMatchesCache()?.matches ?? []);
  const [loading, setLoading] = useState(false);
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
          <span className="mobile-collapsed-title">Maçlar:</span>
          <span className="mobile-collapsed-text">
            {firstMatch
              ? `${firstMatch.home} – ${firstMatch.away} · ${formatMatchWhen(firstMatch, now)}`
              : "Yaklaşan maç yok"}
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
            <h3>Maç Takvimi</h3>
            <span className="mobile-match-sub">Galatasaray &amp; A Milli</span>
          </div>
        </div>
        <div className="mobile-match-actions">
          {allUpcoming.length > 2 && (
            <button
              type="button"
              className="mobile-match-toggle-btn"
              onClick={() => setShowAll(prev => !prev)}
            >
              {showAll ? "Özet" : `Tümü (${allUpcoming.length})`}
            </button>
          )}
          <button
            type="button"
            className="mobile-match-refresh-btn"
            onClick={() => void refresh(true)}
            disabled={loading}
            aria-label="Maçları yenile"
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

      {showAll ? (
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
