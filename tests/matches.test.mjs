import test from "node:test";
import assert from "node:assert/strict";
import { mergeMatchSources, parseEspnF1Race, parseSporekraniMatches, parseSporxMatches } from "../cloud/src/matches.ts";
import { parseEspnLineups, parseEspnStandings } from "../cloud/src/matchDetails.ts";
import { groupLineupRows, isLineupWindowOpen } from "../shared/matchDetails.ts";
import {
  buildMatchesAiSummary,
  formatMatchChannels,
  formatMatchWhen,
  nextMatchForTeam,
  selectSummaryMatches,
  upcomingMatches,
} from "../shared/matches.ts";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  validNotificationPreferences,
} from "../shared/notificationPreferences.ts";

test("parseSporekraniMatches extracts senior football matches with channels and excludes U19/women/espor", () => {
  const sampleHtml = `
    <script>
      window.__DATA__ = [
        {"id":494648,"sport_id":1,"league_name":"TFF Elit U19 Ligi","event_type_name":"match","home_id":7801,"home_name":"Galatasaray","away_id":18161,"away_name":"Samsunspor","name":"Galatasaray - Samsunspor","date_time":"2026-11-21 13:00:00","channels":[]},
        {"id":488984,"sport_id":1,"league_name":"Trendyol Süper Lig","event_type_name":"match","home_id":5859,"home_name":"Galatasaray","away_id":6302,"away_name":"Samsunspor","name":"Galatasaray - Samsunspor","date_time":"2026-11-21 16:00:00","channels":[{"name":"Bein Sports 1"}],"stadium":"Rams Park"},
        {"id":497958,"sport_id":1,"league_name":"TEFL Türkiye Espor Futbol Ligi","event_type_name":"match","home_id":999,"home_name":"Sivasspor","away_id":998,"away_name":"Galatasaray","name":"Sivasspor - Galatasaray","date_time":"2026-11-18 22:00:00","channels":[{"name":"Twitch"}]}
      ];
    </script>
  `;
  const gs = parseSporekraniMatches(sampleHtml, "galatasaray");
  assert.equal(gs.length, 1);
  assert.equal(gs[0].home, "Galatasaray");
  assert.equal(gs[0].away, "Samsunspor");
  assert.equal(gs[0].league, "Trendyol Süper Lig");
  assert.equal(gs[0].time, "16:00");
  assert.equal(gs[0].dateKey, "2026-11-21");
  assert.deepEqual(gs[0].channels, ["Bein Sports 1"]);
  assert.equal(gs[0].timestampMs, Date.parse("2026-11-21T16:00:00+03:00"));

  const trHtml = `
    <script>
      window.__DATA__ = [
        {"id":101,"sport_id":1,"league_name":"UEFA Uluslar Ligi","event_type_name":"match","home_id":1,"home_name":"Türkiye","away_id":2,"away_name":"Fransa","name":"Türkiye - Fransa","date_time":"2026-11-25 21:45:00","channels":[{"name":"TRT 1"}]},
        {"id":102,"sport_id":1,"league_name":"UEFA U21 Şampiyonası","event_type_name":"match","home_id":3,"home_name":"Türkiye","away_id":4,"away_name":"İtalya","name":"Türkiye - İtalya","date_time":"2026-11-25 18:00:00","channels":[{"name":"A Spor"}]}
      ];
    </script>
  `;
  const tr = parseSporekraniMatches(trHtml, "turkey");
  assert.equal(tr.length, 1);
  assert.equal(tr[0].home, "Türkiye");
  assert.equal(tr[0].away, "Fransa");
  assert.deepEqual(tr[0].channels, ["TRT 1"]);

  // Normalized channel ID array format ("channels":[352]) + lookup dictionary
  const idBasedHtml = `
    <script>
      window.__NUXT__ = {
        events: [
          {"id":488984,"sport_id":1,"league_name":"Trendyol Süper Lig","event_type_name":"match","home_name":"Galatasaray","away_name":"Samsunspor","name":"Galatasaray - Samsunspor","date_time":"2026-11-21 16:00:00","channels":[352]}
        ],
        channels: {
          "352":{"id":352,"alt":"","icon":"x","link":null,"name":"Bein Sports 1","active":1}
        }
      };
    </script>
  `;
  const gsId = parseSporekraniMatches(idBasedHtml, "galatasaray");
  assert.equal(gsId.length, 1);
  assert.deepEqual(gsId[0].channels, ["Bein Sports 1"]);
});

test("match helpers format dates, channels, upcoming order and AI summary cleanly", () => {
  const now = Date.parse("2026-11-18T15:00:00+03:00");
  const matches = [
    {
      id: "turkey:1",
      team: "turkey",
      home: "Türkiye",
      away: "Galler",
      league: "UEFA Uluslar Ligi",
      dateTime: "2026-11-19 21:45",
      dateKey: "2026-11-19",
      time: "21:45",
      timestampMs: Date.parse("2026-11-19T21:45:00+03:00"),
      channels: ["TV8"],
    },
    {
      id: "galatasaray:1",
      team: "galatasaray",
      home: "Galatasaray",
      away: "Samsunspor",
      league: "Trendyol Süper Lig",
      dateTime: "2026-11-18 20:00",
      dateKey: "2026-11-18",
      time: "20:00",
      timestampMs: Date.parse("2026-11-18T20:00:00+03:00"),
      channels: ["Bein Sports 1"],
    },
  ];

  const gsNext = nextMatchForTeam(matches, "galatasaray", now);
  const trNext = nextMatchForTeam(matches, "turkey", now);
  assert.equal(gsNext?.id, "galatasaray:1");
  assert.equal(trNext?.id, "turkey:1");
  assert.equal(formatMatchWhen(gsNext, now), "Bugün · 20:00");
  assert.equal(formatMatchWhen(trNext, now), "Yarın · 21:45");
  assert.equal(formatMatchChannels(gsNext), "Bein Sports 1");
  assert.equal(upcomingMatches(matches, now, 5).map(m => m.id).join(","), "galatasaray:1,turkey:1");

  const summary = buildMatchesAiSummary(matches, now);
  assert.match(summary, /Galatasaray - Samsunspor/);
  assert.match(summary, /Bein Sports 1/);
  assert.match(summary, /Türkiye - Galler/);

  // Both teams present -> 1 GS + 1 TR
  assert.deepEqual(selectSummaryMatches(matches, now).map(m => m.id), ["galatasaray:1", "turkey:1"]);
  // Only GS present -> top 2 GS
  const gsOnly = [
    matches[1],
    { ...matches[1], id: "galatasaray:2", dateKey: "2026-11-24", timestampMs: Date.parse("2026-11-24T20:45:00+03:00") },
  ];
  assert.deepEqual(selectSummaryMatches(gsOnly, now).map(m => m.id), ["galatasaray:1", "galatasaray:2"]);
  // Only TR present -> top 2 TR
  const trOnly = [
    matches[0],
    { ...matches[0], id: "turkey:2", dateKey: "2026-11-23", timestampMs: Date.parse("2026-11-23T21:45:00+03:00") },
  ];
  assert.deepEqual(selectSummaryMatches(trOnly, now).map(m => m.id), ["turkey:1", "turkey:2"]);
});

test("notificationPreferences validation preserves backward compatibility and validates match lead minutes", () => {
  assert.equal(validNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES), true);
  const legacyPrefs = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  delete legacyPrefs.desktopMatches;
  delete legacyPrefs.mobileMatches;
  delete legacyPrefs.matchTeamGalatasaray;
  delete legacyPrefs.matchTeamTurkey;
  delete legacyPrefs.matchLeadMinutes;
  assert.equal(validNotificationPreferences(legacyPrefs), true);
  assert.equal(validNotificationPreferences({ ...DEFAULT_NOTIFICATION_PREFERENCES, matchLeadMinutes: 99 }), false);
});

test("parseSporxMatches and mergeMatchSources supplement distant fixtures while preserving primary channels", () => {
  const sporxHtml = `
    <table>
      <tr class="fixture-date-row"><td><div class="fixture-date-heading"><strong>21 Kasım 2026</strong></div></td></tr>
      <tr class="fixture-match-row"><td>
        <span class="fixture-match-time">16.00</span>
        <span class="fixture-match-league">Trendyol Süper Lig</span>
        <span class="fixture-team-name">Galatasaray</span>
        <span class="fixture-score">-</span>
        <span class="fixture-team-name">Samsunspor</span>
      </td></tr>
      <tr class="fixture-date-row"><td><div class="fixture-date-heading"><strong>04 Aralık 2026</strong></div></td></tr>
      <tr class="fixture-match-row"><td>
        <span class="fixture-match-time">20.00</span>
        <span class="fixture-match-league">Trendyol Süper Lig</span>
        <span class="fixture-team-name">Galatasaray</span>
        <span class="fixture-score">-</span>
        <span class="fixture-team-name">Rizespor</span>
      </td></tr>
    </table>
  `;
  const sporx = parseSporxMatches(sporxHtml, "galatasaray");
  assert.equal(sporx.length, 2);
  assert.equal(sporx[1].dateKey, "2026-12-04");

  const primary = [
    {
      id: "galatasaray:488984",
      team: "galatasaray",
      home: "Galatasaray",
      away: "Samsunspor",
      league: "Trendyol Süper Lig",
      dateTime: "2026-11-21 16:00",
      dateKey: "2026-11-21",
      time: "16:00",
      timestampMs: Date.parse("2026-11-21T16:00:00+03:00"),
      channels: ["Bein Sports 1"],
    },
  ];
  const merged = mergeMatchSources(primary, sporx, Date.parse("2026-11-18T12:00:00+03:00"));
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0].channels, ["Bein Sports 1"]);
  assert.equal(merged[1].away, "Rizespor");
  assert.deepEqual(merged[1].channels, []);
});

test("parseEspnStandings parses league table and filters national group to Turkey", () => {
  const sample = {
    children: [
      {
        name: "Group A",
        standings: {
          entries: [
            { team: { shortDisplayName: "France" }, stats: [{ name: "rank", value: 1 }, { name: "points", value: 9 }] },
          ],
        },
      },
      {
        name: "Group B",
        standings: {
          entries: [
            {
              team: { shortDisplayName: "Turkey" },
              stats: [
                { name: "rank", value: 1 },
                { name: "gamesPlayed", value: 4 },
                { name: "wins", value: 3 },
                { name: "ties", value: 1 },
                { name: "losses", value: 0 },
                { name: "pointDifferential", value: 5 },
                { name: "points", value: 10 },
              ],
            },
          ],
        },
      },
    ],
  };
  const table = parseEspnStandings(sample, "turkey", "A Milli (Uluslar Ligi)", ["turkey", "türkiye"], true);
  assert.ok(table);
  assert.equal(table.groupName, "Group B");
  assert.equal(table.rows[0].team, "Türkiye");
  assert.equal(table.rows[0].isHighlighted, true);
  assert.equal(table.rows[0].points, 10);
});

test("parseEspnLineups requires 11 confirmed starters per team and groupLineupRows splits formation", () => {
  const makeSide = (name, formation) => ({
    formation,
    team: { shortDisplayName: name },
    roster: Array.from({ length: 11 }, (_, i) => ({
      starter: true,
      jersey: String(i + 1),
      formationPlace: String(i + 1),
      position: { abbreviation: i === 0 ? "G" : "M" },
      athlete: { shortName: `P${i + 1}`, displayName: `Player ${i + 1}` },
    })),
  });
  const parsed = parseEspnLineups({
    rosters: [
      { homeAway: "home", ...makeSide("Galatasaray", "4-2-3-1") },
      { homeAway: "away", ...makeSide("Aston Villa", "4-4-2") },
    ],
  });
  assert.equal(parsed.confirmed, true);
  assert.equal(parsed.home?.players.length, 11);
  assert.equal(parsed.away?.players.length, 11);

  const rows = groupLineupRows(parsed.home);
  assert.deepEqual(rows.map(r => r.length), [1, 4, 2, 3, 1]);

  const kickoff = Date.parse("2026-11-24T20:45:00+03:00");
  assert.equal(isLineupWindowOpen(kickoff, kickoff - 120 * 60_000), false);
  assert.equal(isLineupWindowOpen(kickoff, kickoff - 60 * 60_000), true);
  assert.equal(isLineupWindowOpen(kickoff, kickoff + 30 * 60_000), true);
});

test("groupLineupRows places ESPN shirt-numbered formationPlace players by actual position and left-to-right", () => {
  const rows = groupLineupRows({
    teamName: "Galatasaray",
    formation: "4-2-3-1",
    players: [
      { name: "U. Çakir", jersey: "1", position: "G", formationPlace: 1 },
      { name: "W. Singo", jersey: "90", position: "RB", formationPlace: 2 },
      { name: "I. Jakobs", jersey: "4", position: "LB", formationPlace: 3 },
      { name: "L. Torreira", jersey: "34", position: "LM", formationPlace: 4 },
      { name: "D. Sánchez", jersey: "6", position: "CD-R", formationPlace: 5 },
      { name: "A. Bardakçi", jersey: "42", position: "CD-L", formationPlace: 6 },
      { name: "Y. Akgün", jersey: "11", position: "AM-R", formationPlace: 7 },
      { name: "M. Lemina", jersey: "99", position: "RM", formationPlace: 8 },
      { name: "B. Yilmaz", jersey: "53", position: "F", formationPlace: 9 },
      { name: "A. Batrakov", jersey: "83", position: "AM", formationPlace: 10 },
      { name: "E. Elmali", jersey: "17", position: "AM-L", formationPlace: 11 },
    ],
  });
  assert.deepEqual(
    rows.map((r) => r.map((p) => p.name)),
    [
      ["U. Çakir"],
      ["I. Jakobs", "A. Bardakçi", "D. Sánchez", "W. Singo"],
      ["L. Torreira", "M. Lemina"],
      ["E. Elmali", "A. Batrakov", "Y. Akgün"],
      ["B. Yilmaz"],
    ],
  );
});

test("parseEspnF1Race extracts only main Race session and selectSummaryMatches picks next 2 chronologically", () => {
  const f1 = parseEspnF1Race({
    id: "600052",
    name: "Qatar Airways Qatar Grand Prix",
    date: "2026-11-27T13:30Z",
    circuit: { fullName: "Losail International Circuit" },
    competitions: [
      { type: { abbreviation: "FP1" }, date: "2026-11-27T13:30Z" },
      { type: { abbreviation: "Qual" }, date: "2026-11-28T17:00Z" },
      { type: { abbreviation: "Race" }, date: "2026-11-29T16:00Z" },
    ],
  });
  assert.ok(f1);
  assert.equal(f1.team, "f1");
  assert.equal(f1.dateKey, "2026-11-29");
  assert.equal(f1.time, "19:00");
  assert.equal(f1.league, "Formula 1");

  const gs = {
    id: "galatasaray:1",
    team: "galatasaray",
    home: "Galatasaray",
    away: "Samsunspor",
    league: "Süper Lig",
    dateTime: "2026-11-28 20:00",
    dateKey: "2026-11-28",
    time: "20:00",
    timestampMs: Date.parse("2026-11-28T20:00:00+03:00"),
    channels: ["Bein Sports 1"],
  };
  const tr = {
    id: "turkey:1",
    team: "turkey",
    home: "Türkiye",
    away: "Galler",
    league: "Uluslar Ligi",
    dateTime: "2026-12-01 21:45",
    dateKey: "2026-12-01",
    time: "21:45",
    timestampMs: Date.parse("2026-12-01T21:45:00+03:00"),
    channels: ["TV8"],
  };

  // Before GS: shows GS + F1
  assert.deepEqual(
    selectSummaryMatches([tr, f1, gs], Date.parse("2026-11-27T12:00:00+03:00")).map(m => m.id),
    ["galatasaray:1", "f1:600052"],
  );
  // After GS (+3h): shows F1 + A Milli
  assert.deepEqual(
    selectSummaryMatches([tr, f1, gs], Date.parse("2026-11-28T23:00:00+03:00")).map(m => m.id),
    ["f1:600052", "turkey:1"],
  );
});
