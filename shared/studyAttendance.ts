export type AttendanceStatus = "attended" | "skipped";

export type AttendanceEntry = {
  status: AttendanceStatus;
  at: number;
};

export type StudyAttendanceDay = {
  id: string; // YYYY-MM-DD
  date: string; // YYYY-MM-DD
  entries: Record<string, AttendanceEntry>;
  updatedAt: number;
};

export const STUDY_ATTENDANCE_KEY = "ack-deck.study-attendance.v1";

export function cycleAttendanceStatus(current?: AttendanceStatus): AttendanceStatus | null {
  if (current === undefined) return "attended";
  if (current === "attended") return "skipped";
  return null;
}

const isValidDateStr = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const parsed = new Date(v + "T12:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
};

const isSafeTs = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 8.64e15;

export function validAttendanceEntry(v: unknown): v is AttendanceEntry {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const e = v as Record<string, unknown>;
  return (
    Object.keys(e).length === 2 &&
    (e.status === "attended" || e.status === "skipped") &&
    isSafeTs(e.at)
  );
}

export function validStudyAttendanceDay(v: unknown): v is StudyAttendanceDay {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const d = v as Record<string, unknown>;
  if (Object.keys(d).length !== 4 || !("id" in d) || !("date" in d) || !("entries" in d) || !("updatedAt" in d)) {
    return false;
  }
  if (!isValidDateStr(d.date) || d.id !== d.date || !isSafeTs(d.updatedAt)) return false;
  if (!d.entries || typeof d.entries !== "object" || Array.isArray(d.entries)) return false;
  const entries = Object.entries(d.entries as Record<string, unknown>);
  if (entries.length > 100) return false;
  const suffix = ":" + d.date;
  return entries.every(
    ([blockId, entry]) =>
      typeof blockId === "string" &&
      /^[a-zA-Z0-9_.:-]{1,300}$/.test(blockId) &&
      blockId.endsWith(suffix) &&
      validAttendanceEntry(entry)
  );
}

export function canonicalAttendanceDay(date: string, entries: Record<string, AttendanceEntry>, fallbackUpdatedAt = 0): StudyAttendanceDay {
  const sortedEntries = Object.fromEntries(
    Object.entries(entries)
      .filter(([blockId, entry]) => blockId.endsWith(":" + date) && validAttendanceEntry(entry))
      .sort(([a], [b]) => a.localeCompare(b))
  );
  const maxAt = Object.values(sortedEntries).reduce((max, item) => Math.max(max, item.at), 0);
  return {
    id: date,
    date,
    entries: sortedEntries,
    updatedAt: maxAt || fallbackUpdatedAt,
  };
}

export function groupStudyAttendanceByDay(map: Record<string, AttendanceEntry>): StudyAttendanceDay[] {
  const grouped = new Map<string, Record<string, AttendanceEntry>>();
  for (const [blockId, entry] of Object.entries(map)) {
    if (!validAttendanceEntry(entry) || blockId.length < 12) continue;
    const date = blockId.slice(-10);
    if (!isValidDateStr(date) || !blockId.endsWith(":" + date) || !/^[a-zA-Z0-9_.:-]{1,300}$/.test(blockId)) continue;
    const bucket = grouped.get(date) ?? {};
    bucket[blockId] = entry;
    grouped.set(date, bucket);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entries]) => canonicalAttendanceDay(date, entries));
}

const getStorageTarget = () =>
  (typeof window !== "undefined" ? window : globalThis) as unknown as {
    localStorage?: Storage;
    dispatchEvent?: (e: Event) => boolean;
  };

export function loadStudyAttendanceSnapshot(): { map: Record<string, AttendanceEntry>; locked: boolean } {
  try {
    const g = getStorageTarget();
    const raw = g.localStorage?.getItem(STUDY_ATTENDANCE_KEY) ?? null;
    if (raw === null) return { map: {}, locked: false };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { map: {}, locked: true };
    const clean: Record<string, AttendanceEntry> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (validAttendanceEntry(v)) clean[k] = v;
    }
    return { map: clean, locked: false };
  } catch {
    return { map: {}, locked: true };
  }
}

export function loadStudyAttendance(): Record<string, AttendanceEntry> {
  return loadStudyAttendanceSnapshot().map;
}

export function saveStudyAttendance(data: Record<string, AttendanceEntry>): boolean {
  try {
    const g = getStorageTarget();
    g.localStorage?.setItem(STUDY_ATTENDANCE_KEY, JSON.stringify(data));
    if (typeof Event !== "undefined") {
      g.dispatchEvent?.(typeof CustomEvent !== "undefined" ? new CustomEvent("ack-study-attendance-changed", { detail: data }) : new Event("ack-study-attendance-changed"));
      g.dispatchEvent?.(new Event("ack-data-changed"));
    }
    return true;
  } catch {
    return false;
  }
}

export function applyStudyAttendanceDay(date: string, day: StudyAttendanceDay | null): boolean {
  const snapshot = loadStudyAttendanceSnapshot();
  if (snapshot.locked) return false;
  const suffix = ":" + date;
  const next: Record<string, AttendanceEntry> = {};
  for (const [k, v] of Object.entries(snapshot.map)) {
    if (!k.endsWith(suffix)) next[k] = v;
  }
  if (day) {
    for (const [k, v] of Object.entries(day.entries)) {
      if (k.endsWith(suffix) && validAttendanceEntry(v)) next[k] = v;
    }
  }
  return saveStudyAttendance(next);
}

export function setStudyBlockStatus(
  blockId: string,
  status: AttendanceStatus | null
): Record<string, AttendanceEntry> {
  const current = loadStudyAttendance();
  const next = { ...current };
  if (status === null) {
    delete next[blockId];
  } else {
    next[blockId] = { status, at: Date.now() };
  }
  saveStudyAttendance(next);
  return next;
}

export function getStudyBlockAttendance(blockId: string): AttendanceEntry | undefined {
  const data = loadStudyAttendance();
  return data[blockId];
}
