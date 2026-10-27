export type AttendanceStatus = "attended" | "skipped";

export type AttendanceEntry = {
  status: AttendanceStatus;
  at: number;
};

export const STUDY_ATTENDANCE_KEY = "ack-deck.study-attendance.v1";

export function loadStudyAttendance(): Record<string, AttendanceEntry> {
  try {
    const raw = localStorage.getItem(STUDY_ATTENDANCE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {}
  return {};
}

export function saveStudyAttendance(data: Record<string, AttendanceEntry>): void {
  try {
    localStorage.setItem(STUDY_ATTENDANCE_KEY, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent("ack-study-attendance-changed", { detail: data }));
    window.dispatchEvent(new Event("ack-data-changed"));
  } catch {}
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
