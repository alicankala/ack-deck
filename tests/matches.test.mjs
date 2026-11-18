import test from "node:test";
import assert from "node:assert/strict";
import { mergeMatchSources, parseSporekraniMatches, parseSporxMatches } from "../cloud/src/matches.ts";
import {
  buildMatchesAiSummary,
  formatMatchChannels,
  formatMatchWhen,
  nextMatchForTeam,
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
