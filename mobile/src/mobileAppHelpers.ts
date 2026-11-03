import { useEffect, useRef, useState } from "react";
import { productMetadata } from "../../shared/productivity";
import { nextOccurrence, type Recurrence } from "../../shared/recurrence";
import {
  loadStudyAttendance,
  saveStudyAttendance,
  setStudyBlockStatus,
  cycleAttendanceStatus,
  canonicalAttendanceDay,
  groupStudyAttendanceByDay,
  type StudyAttendanceDay,
  type AttendanceEntry,
} from "../../shared/studyAttendance";
import { loadMedia } from "../../src/mediaStore";
import { loadPrayerConfig, lookupTurkeyCity } from "../../shared/prayerTimes";
import { fetchMobileWeather, loadWeatherCache, type WeatherData } from "../../shared/weather";
import type { CloudRecord, Mutation, PhoneTask } from "../../shared/phone";
import { enqueue, saveState, type MobileState } from "./store";

export const dateKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export async function migrateLegacyMobileStorage(initial: MobileState): Promise<MobileState> {
  let state = initial;
  try {
    let dirty = false;
    if (localStorage.getItem("ack-deck.media-migrated.v1") !== "1") {
      const legacyMedia = loadMedia().entries;
      for (const item of legacyMedia) {
        if (!state.records.some(r => r.kind === "mediaItems" && r.id === item.id)) {
          state = enqueue(state, {
            mutationId: crypto.randomUUID(),
            kind: "mediaItems",
            id: item.id,
            baseVersion: 0,
            deleted: false,
            data: item,
          });
          dirty = true;
        }
      }
      localStorage.setItem("ack-deck.media-migrated.v1", "1");
    }
    if (localStorage.getItem("ack-deck.study-att-migrated.v1") !== "1") {
      const legacyDays = groupStudyAttendanceByDay(loadStudyAttendance());
      for (const dayObj of legacyDays) {
        if (!state.records.some(r => r.kind === "studyAttendance" && r.id === dayObj.id)) {
          state = enqueue(state, {
            mutationId: crypto.randomUUID(),
            kind: "studyAttendance",
            id: dayObj.id,
            baseVersion: 0,
            deleted: false,
            data: dayObj,
          });
          dirty = true;
        }
      }
      localStorage.setItem("ack-deck.study-att-migrated.v1", "1");
    }
    if (dirty) await saveState(state);
  } catch {}
  return state;
}

export function buildTaskMutationData(params: {
  editing: CloudRecord | null;
  title: string;
  date: string;
  time: string;
  reminder: boolean;
  reminderLead: number;
  projectId: string;
  recurrence: Recurrence | null;
}): PhoneTask {
  const { editing, title, date, time, reminder, reminderLead, projectId, recurrence } = params;
  const previous = editing?.data as PhoneTask | undefined;
  const changed =
    JSON.stringify(recurrence) !== JSON.stringify(previous?.recurrence ?? null) ||
    date !== previous?.dueDate ||
    time !== previous?.dueTime;
  const rule = recurrence && changed ? { ...recurrence, start: date, time } : recurrence;
  const first = rule && changed ? nextOccurrence(rule, Date.parse(date + "T00:00:00Z") - 86400000) : null;
  if (rule && (!date || !time || (changed && !first))) {
    throw new Error("Tekrar için tarih, saat ve günleri kontrol edin.");
  }
  const dueAt =
    first?.at ??
    (!changed && previous?.snoozedUntil
      ? previous.snoozedUntil
      : rule
      ? previous?.dueAt ?? null
      : date && time
      ? new Date(`${date}T${time}:00`).getTime()
      : null);

  return {
    ...productMetadata(previous ?? {}),
    checklist: previous?.checklist ?? [],
    projectId: projectId || null,
    reminderLeadMinutes: reminderLead,
    text: title.trim(),
    completed: rule && changed ? false : editing?.data && "completed" in editing.data ? editing.data.completed : false,
    dueDate: first?.date ?? (date || null),
    dueTime: time || null,
    recurrence: rule,
    occurrenceAt: first?.at ?? previous?.occurrenceAt ?? dueAt,
    lastCompletedAt: previous?.lastCompletedAt ?? null,
    snoozedUntil: changed ? null : previous?.snoozedUntil ?? null,
    priority: "normal",
    reminder,
    dueAt,
    timezone: rule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

export function buildSnoozedTaskData(task: PhoneTask, minutes: number): PhoneTask {
  const future = new Date();
  if (minutes === 1440) future.setDate(future.getDate() + 1);
  else future.setMinutes(future.getMinutes() + minutes);
  future.setSeconds(0, 0);
  return {
    ...task,
    snoozedUntil: future.getTime(),
    occurrenceAt: task.occurrenceAt ?? task.dueAt,
    dueDate: task.recurrence ? task.dueDate : dateKey(future),
    dueTime:
      task.recurrence
        ? task.dueTime
        : `${String(future.getHours()).padStart(2, "0")}:${String(future.getMinutes()).padStart(2, "0")}`,
    dueAt: future.getTime(),
    timezone: task.recurrence?.timezone ?? task.timezone,
    reminder: true,
    completed: false,
  };
}

export function useMobileWeather(onNotice: (msg: string) => void) {
  const [weather, setWeather] = useState<WeatherData | null>(() => loadWeatherCache());
  const [weatherModalOpen, setWeatherModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    async function updateWeather() {
      try {
        let city = "Karabük";
        const rawCity = localStorage.getItem("ack-deck.weather-city.v1");
        if (rawCity) {
          try {
            const parsed = JSON.parse(rawCity);
            if (typeof parsed === "string" && parsed.trim()) city = parsed.trim();
          } catch {}
        } else {
          const prayer = loadPrayerConfig();
          if (prayer.city) city = prayer.city;
        }
        const cityData = lookupTurkeyCity(city) || { city, lat: 41.20488, lng: 32.62768 };
        const w = await fetchMobileWeather(cityData.city, cityData.lat, cityData.lng);
        if (active && w) setWeather(w);
      } catch {}
    }

    void updateWeather();
    const interval = setInterval(updateWeather, 30 * 60 * 1000);
    window.addEventListener("ack-weather-city-changed", updateWeather);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("ack-weather-city-changed", updateWeather);
    };
  }, []);

  async function handleMobileChangeCity(newCity: string) {
    localStorage.setItem("ack-deck.weather-city.v1", newCity);
    const cityData = lookupTurkeyCity(newCity) || { city: newCity, lat: 41.20488, lng: 32.62768 };
    const w = await fetchMobileWeather(cityData.city, cityData.lat, cityData.lng);
    if (w) setWeather(w);
    onNotice(`Hava durumu konumu ${newCity} olarak güncellendi.`);
  }

  return { weather, weatherModalOpen, setWeatherModalOpen, handleMobileChangeCity };
}

export function useMobileStudyAttendance(params: {
  ready: boolean;
  records: CloudRecord[];
  isLockedRef: { current: boolean };
  getLatestRecords: () => CloudRecord[];
  saveMutation: (mutation: Mutation) => Promise<void>;
}) {
  const { ready, records, isLockedRef, getLatestRecords, saveMutation } = params;
  const [attendance, setAttendance] = useState(() => loadStudyAttendance());
  const pendingAttendanceDays = useRef<Set<string>>(new Set());
  const attendanceSyncTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    return () => {
      attendanceSyncTimers.current.forEach(timer => clearTimeout(timer));
      attendanceSyncTimers.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const attRows = records.filter(r => r.kind === "studyAttendance");
    if (attRows.length === 0) return;
    const currentLocal = loadStudyAttendance();
    const merged: Record<string, AttendanceEntry> = {};
    for (const [k, v] of Object.entries(currentLocal)) {
      const d = k.slice(-10);
      if (pendingAttendanceDays.current.has(d)) merged[k] = v;
    }
    for (const row of attRows) {
      if (row.deleted || !row.data || pendingAttendanceDays.current.has(row.id)) continue;
      const dayData = row.data as StudyAttendanceDay;
      for (const [k, v] of Object.entries(dayData.entries)) {
        merged[k] = v;
      }
    }
    if (JSON.stringify(merged) !== JSON.stringify(currentLocal)) {
      saveStudyAttendance(merged);
      setAttendance(merged);
    }
  }, [ready, records]);

  function scheduleAttendanceSync(dateStr: string) {
    const prevTimer = attendanceSyncTimers.current.get(dateStr);
    if (prevTimer) clearTimeout(prevTimer);
    const timer = setTimeout(async () => {
      if (isLockedRef.current) {
        scheduleAttendanceSync(dateStr);
        return;
      }
      attendanceSyncTimers.current.delete(dateStr);
      const latestMap = loadStudyAttendance();
      const dayObj = canonicalAttendanceDay(dateStr, latestMap, Date.now());
      const hasEntries = Object.keys(dayObj.entries).length > 0;
      const existingRow = getLatestRecords().find(r => r.kind === "studyAttendance" && r.id === dateStr);
      pendingAttendanceDays.current.delete(dateStr);
      if (!hasEntries && (!existingRow || existingRow.deleted)) return;
      try {
        await saveMutation({
          mutationId: crypto.randomUUID(),
          kind: "studyAttendance",
          id: dateStr,
          baseVersion: existingRow?.version ?? 0,
          deleted: !hasEntries,
          data: hasEntries ? dayObj : null,
        });
      } catch {}
    }, 450);
    attendanceSyncTimers.current.set(dateStr, timer);
  }

  function toggleMobileStudyBlock(blockId: string) {
    const nextStatus = cycleAttendanceStatus(attendance[blockId]?.status);
    const dateStr = blockId.slice(-10);
    pendingAttendanceDays.current.add(dateStr);
    const nextMap = setStudyBlockStatus(blockId, nextStatus);
    setAttendance(nextMap);
    scheduleAttendanceSync(dateStr);
  }

  return { attendance, toggleMobileStudyBlock };
}

export function useMobileHashRouting(params: {
  setPage: (p: string) => void;
  setPlanTab: (t: "calendar" | "subscriptions") => void;
  setSendTab: (t: "ai" | "send") => void;
  setNotificationTask: (id: string | null) => void;
}) {
  const { setPage, setPlanTab, setSendTab, setNotificationTask } = params;

  useEffect(() => {
    function handleHashRoute(urlOrHash?: string) {
      let hashStr = "";
      if (typeof urlOrHash === "string") {
        const idx = urlOrHash.indexOf("#");
        hashStr = idx !== -1 ? urlOrHash.slice(idx + 1) : urlOrHash;
      } else {
        hashStr = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
      }
      if (!hashStr) return;

      if (hashStr === "prayer" || hashStr.startsWith("prayer")) {
        setPage("today");
        setTimeout(() => {
          document.querySelector(".mobile-prayer-card")?.scrollIntoView({ behavior: "smooth" });
        }, 200);
        return;
      }

      const urlParams = new URLSearchParams(hashStr);
      const task = urlParams.get("task");
      if (task) {
        setNotificationTask(task);
        setPage("today");
        return;
      }

      const p = urlParams.get("page");
      if (p === "prayer") {
        setPage("today");
        setTimeout(() => {
          document.querySelector(".mobile-prayer-card")?.scrollIntoView({ behavior: "smooth" });
        }, 200);
      } else if (p === "subscriptions") {
        setPage("plan");
        setPlanTab("subscriptions");
      } else if (p === "plan" || p === "calendar") {
        setPage("plan");
        setPlanTab("calendar");
      } else if (p === "notes") {
        setPage("notes");
      } else if (p === "today" || p === "tasks") {
        setPage("today");
      } else if (p === "send") {
        setPage("send");
      } else if (p === "ai") {
        setPage("send");
        setSendTab("ai");
      } else if (p === "media") {
        setPage("media");
      } else if (p === "settings") {
        setPage("settings");
      }
    }

    const raw = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
    const urlParams = new URLSearchParams(raw);
    const hasTaskOrPair = Boolean(urlParams.get("task") || raw.startsWith("pair="));
    if (hasTaskOrPair) {
      handleHashRoute();
    } else if (raw) {
      try {
        history.replaceState(null, "", location.pathname);
      } catch {}
    }

    const change = () => handleHashRoute();
    window.addEventListener("hashchange", change);
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "ack-navigate" && typeof e.data?.url === "string") {
        handleHashRoute(e.data.url);
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("hashchange", change);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);
}
