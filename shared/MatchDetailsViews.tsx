import { useState } from "react";
import {
  groupLineupRows,
  shortPlayerName,
  type MatchLineupPayload,
  type StandingsLeagueKey,
  type StandingsPayload,
  type TeamLineup,
} from "./matchDetails";

type StandingsPanelProps = {
  standings: StandingsPayload | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

export function StandingsPanel({ standings, loading, error, onRefresh }: StandingsPanelProps) {
  const tables = standings?.tables ?? [];
  const [selectedKey, setSelectedKey] = useState<StandingsLeagueKey>("super_lig");
  const activeTable = tables.find((t) => t.key === selectedKey) ?? tables[0] ?? null;

  if (loading && tables.length === 0) {
    return <div className="ack-lineup-status">Puan durumu yükleniyor...</div>;
  }
  if (error && tables.length === 0) {
    return (
      <div className="ack-lineup-status">
        <span>{error}</span>
        <button type="button" className="ack-lineup-check-btn" onClick={onRefresh}>
          Tekrar Dene
        </button>
      </div>
    );
  }
  if (!activeTable) {
    return <div className="ack-lineup-status">Puan durumu henüz bulunamadı.</div>;
  }

  return (
    <div className="ack-standings-wrap">
      <div className="ack-standings-tabs" role="tablist" aria-label="Lig seçimi">
        {tables.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTable.key === t.key}
            className={`ack-standings-tab ${activeTable.key === t.key ? "is-active" : ""}`}
            onClick={() => setSelectedKey(t.key)}
          >
            {t.key === "super_lig" ? "Süper Lig" : t.key === "ucl" ? "Şamp. Ligi" : t.key === "f1" ? "F1" : "A Milli"}
          </button>
        ))}
      </div>

      {activeTable.groupName && (
        <div className="ack-standings-group-label">
          {activeTable.title} · {activeTable.groupName}
        </div>
      )}

      <table className="ack-standings-table">
        <thead>
          <tr>
            <th className="is-rank">#</th>
            <th className="is-team">{activeTable.key === "f1" ? "Pilot" : "Takım"}</th>
            {activeTable.key !== "f1" && (
              <>
                <th className="is-stat">O</th>
                <th className="is-stat is-wdl">G</th>
                <th className="is-stat is-wdl">B</th>
                <th className="is-stat is-wdl">M</th>
                <th className="is-stat">Av</th>
              </>
            )}
            <th className="is-pts">P</th>
          </tr>
        </thead>
        <tbody>
          {activeTable.rows.map((row) => (
            <tr key={`${activeTable.key}:${row.team}`} className={row.isHighlighted ? "is-highlighted" : ""}>
              <td className="is-rank">{row.rank}</td>
              <td className="is-team" title={row.team}>{row.team}</td>
              {activeTable.key !== "f1" && (
                <>
                  <td className="is-stat">{row.played}</td>
                  <td className="is-stat is-wdl">{row.won}</td>
                  <td className="is-stat is-wdl">{row.drawn}</td>
                  <td className="is-stat is-wdl">{row.lost}</td>
                  <td className="is-stat">{row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}</td>
                </>
              )}
              <td className="is-pts">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type MatchLineupPitchProps = {
  lineup: MatchLineupPayload | null;
  loading: boolean;
  error: string | null;
  preferredTeam?: "galatasaray" | "turkey" | "f1";
  onRefresh: () => void;
};

function renderPitch(team: TeamLineup) {
  // groupLineupRows returns [GK, DEF..., MID..., FWD...]; reverse so FWD is at top and GK at bottom
  const rows = [...groupLineupRows(team)].reverse();
  return (
    <div className="ack-pitch" aria-label={`${team.teamName} ilk 11 saha dizilişi`}>
      {rows.map((row, rIdx) => {
        const isGk = rIdx === rows.length - 1;
        return (
          <div key={rIdx} className={`ack-pitch-row ${isGk ? "is-gk" : ""}`}>
            {row.map((p) => (
              <div key={`${p.formationPlace}:${p.name}`} className="ack-pitch-player" title={p.name}>
                <span className="ack-pitch-jersey">{p.jersey || "•"}</span>
                <span className="ack-pitch-name">{shortPlayerName(p.name)}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function MatchLineupPitch({
  lineup,
  loading,
  error,
  preferredTeam,
  onRefresh,
}: MatchLineupPitchProps) {
  const [side, setSide] = useState<"home" | "away" | null>(null);

  if (loading && !lineup) {
    return (
      <div className="ack-lineup-box">
        <div className="ack-lineup-status">İlk 11 kontrol ediliyor...</div>
      </div>
    );
  }

  if (error && !lineup) {
    return (
      <div className="ack-lineup-box">
        <div className="ack-lineup-status">
          <span>{error}</span>
          <button type="button" className="ack-lineup-check-btn" onClick={onRefresh}>
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  if (!lineup || lineup.status !== "confirmed" || !lineup.home || !lineup.away) {
    return (
      <div className="ack-lineup-box">
        <div className="ack-lineup-status">
          <span>{lineup?.message ?? "İlk 11 maçtan ~1 saat önce açıklanır."}</span>
          {lineup?.status === "pending" && (
            <button type="button" className="ack-lineup-check-btn" onClick={onRefresh} disabled={loading}>
              {loading ? "Bakılıyor..." : "Kontrol Et"}
            </button>
          )}
        </div>
      </div>
    );
  }

  const defaultSide: "home" | "away" =
    preferredTeam === "galatasaray" && lineup.away.teamName.toLowerCase().includes("galatasaray")
      ? "away"
      : preferredTeam === "turkey" && /türkiye|turkey/i.test(lineup.away.teamName)
        ? "away"
        : "home";
  const activeSide = side ?? defaultSide;
  const activeTeam = activeSide === "home" ? lineup.home : lineup.away;

  return (
    <div className="ack-lineup-box">
      <div className="ack-lineup-team-tabs">
        <button
          type="button"
          className={`ack-lineup-team-btn ${activeSide === "home" ? "is-active" : ""}`}
          onClick={() => setSide("home")}
        >
          {lineup.home.teamName} {lineup.home.formation ? `(${lineup.home.formation})` : ""}
        </button>
        <button
          type="button"
          className={`ack-lineup-team-btn ${activeSide === "away" ? "is-active" : ""}`}
          onClick={() => setSide("away")}
        >
          {lineup.away.teamName} {lineup.away.formation ? `(${lineup.away.formation})` : ""}
        </button>
      </div>
      {renderPitch(activeTeam)}
    </div>
  );
}
