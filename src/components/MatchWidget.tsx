import { useEffect, useState } from "react";
import {
  fetchMatches,
  formatMatchChannels,
  formatMatchWhen,
  loadMatchesCache,
  nextMatchForTeam,
  upcomingMatches,
  type MatchItem,
} from "../../shared/matches";
import { turkeyDateKey } from "../../shared/dormMenu";
import { Icon } from "./Icon";

function MatchRow({ match, now, showTeamTag = false }: { match: MatchItem; now: number; showTeamTag?: boolean }) {
  const todayKey = turkeyDateKey(new Date(now));
  const isToday = match.dateKey === todayKey;
  const teamBadge = match.team === "galatasaray" ? "GS" : "A Milli";

  return (
    <div className={`match-item-row ${isToday ? "is-today" : ""}`}>
      <div className="match-item-main">
        <div className="match-item-top">
          {showTeamTag && (
            <span className={`match-team-pill is-${match.team}`}>{teamBadge}</span>
          )}
          <strong className="match-item-title" title={`${match.home} - ${match.away}`}>
            {match.home} – {match.away}
          </strong>
        </div>
        <div className="match-item-meta">
          <span className={`match-when ${isToday ? "is-today" : ""}`}>{formatMatchWhen(match, now)}</span>
          {match.league && <span className="match-league">· {match.league}</span>}
        </div>
      </div>
      <span className="match-channel-badge" title="Yayıncı kanal">
        {formatMatchChannels(match)}
      </span>
    </div>
  );
}

export function MatchWidget() {
  const [matches, setMatches] = useState<MatchItem[]>(() => loadMatchesCache()?.matches ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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

  const nextGs = nextMatchForTeam(matches, "galatasaray", now);
  const nextTr = nextMatchForTeam(matches, "turkey", now);
  const allUpcoming = upcomingMatches(matches, now, 8);

  return (
    <section className="dashboard-matches-card surface" aria-labelledby="matches-heading">
      <div className="dashboard-section-top">
        <div className="pomodoro-title-wrap">
          <span className="overview-icon-small" aria-hidden="true">
            ⚽
          </span>
          <div>
            <h2 id="matches-heading">Maç Takvimi</h2>
            <small>Galatasaray &amp; A Milli Futbol</small>
          </div>
        </div>

        <div className="match-card-actions">
          {allUpcoming.length > 2 && (
            <button
              type="button"
              className="dashboard-more"
              onClick={() => setShowAll(prev => !prev)}
            >
              {showAll ? "Özet" : `Fikstür (${allUpcoming.length})`}
            </button>
          )}
          <button
            type="button"
            className="dorm-refresh-btn"
            onClick={() => void refresh(true)}
            disabled={loading}
            title="Maç takvimini yenile"
            aria-label="Maç takvimini yenile"
          >
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </div>

      {error && matches.length === 0 ? (
        <p className="match-empty-text">{error}</p>
      ) : showAll ? (
        <div className="match-list-scroll">
          {allUpcoming.map(m => (
            <MatchRow key={m.id} match={m} now={now} showTeamTag />
          ))}
        </div>
      ) : (
        <div className="match-summary-list">
          <div className="match-team-block">
            <span className="match-team-label is-galatasaray">Galatasaray</span>
            {nextGs ? (
              <MatchRow match={nextGs} now={now} />
            ) : (
              <p className="match-empty-text">
                {loading ? "Yükleniyor..." : "Yaklaşan Galatasaray maçı bulunamadı."}
              </p>
            )}
          </div>

          <div className="match-team-block">
            <span className="match-team-label is-turkey">Türkiye A Milli</span>
            {nextTr ? (
              <MatchRow match={nextTr} now={now} />
            ) : (
              <p className="match-empty-text">
                {loading ? "Yükleniyor..." : "Yaklaşan A Milli maçı planlanmadı."}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
