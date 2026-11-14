import { useEffect, useRef, useState, type FormEvent } from "react";
import { savePrayerConfig, type PrayerTimesConfig } from "../../shared/prayerTimes";
import { migrateLegacyMobileStorage } from "./mobileAppHelpers";
import type { MobileInboxItem } from "./MobileSendView";
import { initAutoLockListener, isSecurityLocked } from "./mobileSecurity";
import { api, emptyState, json, readState, saveState, synchronize, type MobileState } from "./store";

type UseMobileSyncParams = {
  stopRecordingRef: { current: () => void };
};

const RESUME_SYNC_THRESHOLD_MS = 30_000;

/** Core sync state, IndexedDB bootstrap/migration, resume polling, pairing, and lock/study-reminder persistence. */
export function useMobileSync({ stopRecordingRef }: UseMobileSyncParams) {
  const [state, setState] = useState<MobileState>(emptyState);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [code, setCode] = useState(() => new URLSearchParams(location.hash.slice(1)).get("pair") ?? "");
  const [name, setName] = useState("iPhone");
  const [online, setOnline] = useState(false);
  const [push, setPush] = useState(false);
  const [isLocked, setIsLocked] = useState(() => isSecurityLocked());
  const [inbox, setInbox] = useState<MobileInboxItem[]>([]);
  const [inboxLoaded, setInboxLoaded] = useState(false);
  const [studyReminders, setStudyReminders] = useState<{ id: string; leadMinutes: number | null }[]>(() => {
    try {
      const raw = localStorage.getItem("ack-deck.study-reminders.v1");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const ref = useRef(state);
  const locked = useRef(false);
  ref.current = state;

  const lastSyncTimeRef = useRef<number>(Date.now());
  const resumeTimerRef = useRef<number | null>(null);

  function updateStudyReminder(programId: string, leadMinutes: number | null) {
    setStudyReminders((prev) => {
      const next = [...prev.filter((x) => x.id !== programId), { id: programId, leadMinutes }];
      try {
        localStorage.setItem("ack-deck.study-reminders.v1", JSON.stringify(next));
      } catch {}
      if (ref.current.token) {
        void api(ref.current, "study-reminders", json({ studyReminders: next })).catch(() => {});
      }
      return next;
    });
  }

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 1600);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const cleanup = initAutoLockListener();
    const handleLockState = () => setIsLocked(isSecurityLocked());
    window.addEventListener("ack-mobile-lock-state-changed", handleLockState);
    return () => {
      cleanup();
      window.removeEventListener("ack-mobile-lock-state-changed", handleLockState);
    };
  }, []);

  async function commit(value: MobileState) {
    await saveState(value);
    ref.current = value;
    setState(value);
  }

  async function refresh(value = ref.current, silent = false) {
    if (!value.token || locked.current) return;
    locked.current = true;
    if (!silent) {
      setBusy(true);
      setError("");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("ack-dorm-menu-refresh"));
      }
    }
    const startTime = Date.now();
    try {
      const next = await synchronize(value);
      ref.current = next;
      setState(next);
      lastSyncTimeRef.current = Date.now();
      const [status, list] = await Promise.all([
        api<{
          online: boolean;
          notifications: boolean;
          prayerConfig?: PrayerTimesConfig;
          studyReminders?: { id: string; leadMinutes: number | null }[];
        }>(next, "status"),
        api<{ items: MobileInboxItem[] }>(next, "inbox"),
      ]);
      setOnline(status.online);
      setPush(status.notifications);
      setInbox(list.items);
      setInboxLoaded(true);
      if (status.prayerConfig && typeof status.prayerConfig === "object" && status.prayerConfig.city) {
        savePrayerConfig(status.prayerConfig);
      }
      if (Array.isArray(status.studyReminders)) {
        setStudyReminders(status.studyReminders);
        try {
          localStorage.setItem("ack-deck.study-reminders.v1", JSON.stringify(status.studyReminders));
        } catch {}
      }
      if (!silent) {
        const elapsed = Date.now() - startTime;
        if (elapsed < 350) await new Promise((r) => setTimeout(r, 350 - elapsed));
        setNotice(next.conflicts.length ? "Eşitleme çakışması var; iki sürüm de korundu." : "Eşitlendi");
      } else if (next.conflicts.length) {
        setNotice("Eşitleme çakışması var; iki sürüm de korundu.");
      }
    } catch (e) {
      if (!silent) {
        setError(
          navigator.onLine
            ? e instanceof Error
              ? e.message
              : "Eşitleme tamamlanamadı."
            : "Çevrimdışı — bağlantı gelince eşitlenecek."
        );
      }
      try {
        const saved = await readState();
        ref.current = saved;
        setState(saved);
      } catch {}
    } finally {
      locked.current = false;
      if (!silent) setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    void readState()
      .then(async (value) => {
        if (active) {
          const initial = await migrateLegacyMobileStorage(value);
          ref.current = initial;
          setState(initial);
          setName(initial.name);
          setReady(true);
          void refresh(initial);
        }
      })
      .catch(() => setError("Telefon kayıtları okunamadı. Mevcut veriler korundu."));
    const reconnect = () => void refresh();
    window.addEventListener("online", reconnect);
    return () => {
      active = false;
      window.removeEventListener("online", reconnect);
      stopRecordingRef.current();
    };
  }, []);

  async function checkOnlineStatus() {
    if (!ref.current.token || document.hidden || !navigator.onLine || locked.current) return;
    try {
      const res = await api<{ online: boolean }>(ref.current, "status");
      setOnline(res.online);
    } catch {}
  }

  async function handleResumeSync() {
    if (document.hidden || !ref.current.token || !navigator.onLine) return;
    if (Date.now() - lastSyncTimeRef.current >= RESUME_SYNC_THRESHOLD_MS) {
      await refresh(ref.current, true);
    } else {
      await checkOnlineStatus();
    }
  }

  useEffect(() => {
    const triggerResumeCheck = () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = window.setTimeout(() => void handleResumeSync(), 120);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopRecordingRef.current();
      } else {
        triggerResumeCheck();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", triggerResumeCheck);
    const poller = setInterval(() => void checkOnlineStatus(), 15000);
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", triggerResumeCheck);
      clearInterval(poller);
    };
  }, []);

  async function pair(event: FormEvent) {
    event.preventDefault();
    if (!ready || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const current = ref.current;
      const result = await api<{ token: string }>(current, "pair/exchange", json({ code: code.trim(), name: name.trim() }));
      const next = { ...current, token: result.token, name: name.trim() };
      await commit(next);
      history.replaceState(null, "", location.pathname);
      setCode("");
      setNotice("Telefon eşleştirildi.");
      locked.current = false;
      void refresh(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eşleştirme tamamlanamadı.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return {
    state,
    stateRef: ref,
    lockedRef: locked,
    ready,
    busy,
    setBusy,
    error,
    setError,
    notice,
    setNotice,
    code,
    setCode,
    name,
    setName,
    online,
    push,
    setPush,
    isLocked,
    setIsLocked,
    inbox,
    setInbox,
    inboxLoaded,
    studyReminders,
    updateStudyReminder,
    commit,
    refresh,
    pair,
  };
}
