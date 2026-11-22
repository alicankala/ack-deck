import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import {
  fetchMatches,
  formatMatchChannels,
  loadMatchesCache,
  MATCHES_NOTIFIED_KEY,
} from "../shared/matches";
import { notifyDesktop } from "./desktopClient";
import { loadNotificationPreferences } from "./notificationStore";

function readNotifiedIds(): string[] {
  try {
    const raw = localStorage.getItem(MATCHES_NOTIFIED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function markNotified(key: string) {
  try {
    const list = readNotifiedIds();
    if (!list.includes(key)) {
      list.push(key);
      localStorage.setItem(MATCHES_NOTIFIED_KEY, JSON.stringify(list.slice(-40)));
    }
  } catch {}
}

export function useMatchReminder(setNotice: (text: string) => void) {
  useEffect(() => {
    let active = true;

    async function checkMatchNotifications() {
      const notif = loadNotificationPreferences();
      if (!notif.desktopMaster || notif.desktopMatches === false) return;
      const gsEnabled = notif.matchTeamGalatasaray !== false;
      const trEnabled = notif.matchTeamTurkey !== false;
      const f1Enabled = notif.matchTeamF1 !== false;
      if (!gsEnabled && !trEnabled && !f1Enabled) return;

      const leadMinutes =
        typeof notif.matchLeadMinutes === "number" && [15, 30, 60].includes(notif.matchLeadMinutes)
          ? notif.matchLeadMinutes
          : 30;
      const leadMs = leadMinutes * 60_000;

      try {
        const payload = await fetchMatches().catch(() => loadMatchesCache());
        if (!active || !payload?.matches?.length) return;
        const now = Date.now();
        const notified = readNotifiedIds();

        for (const match of payload.matches) {
          if (match.team === "galatasaray" && !gsEnabled) continue;
          if (match.team === "turkey" && !trEnabled) continue;
          if (match.team === "f1" && !f1Enabled) continue;

          const notifyAt = match.timestampMs - leadMs;
          if (notifyAt <= now && now <= match.timestampMs + 5 * 60_000) {
            const gen = `${match.id}:lead:${leadMinutes}`;
            if (notified.includes(gen)) continue;

            const channelText = formatMatchChannels(match);
            const body =
              match.team === "f1"
                ? `🏎️ ${match.home} (${leadMinutes} dk sonra · ${match.time}) · Yayın: ${channelText}`
                : `⚽ ${match.home} - ${match.away} (${leadMinutes} dk sonra · ${match.time}) · Yayın: ${channelText}`;
            const title = match.team === "f1" ? "🏎️ F1 Yarış Hatırlatması" : "⚽ Maç Hatırlatması";
            if (isTauri()) {
              await notifyDesktop(title, body.slice(0, 300)).catch(() => {});
            }
            setNotice(body);
            markNotified(gen);
          }
        }
      } catch {}
    }

    const initial = window.setTimeout(checkMatchNotifications, 4000);
    const interval = window.setInterval(checkMatchNotifications, 60000);
    return () => {
      active = false;
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [setNotice]);
}
