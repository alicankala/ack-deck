import { dailySummary } from "../productIntelligence";
import { Subscriptions } from "./Subscriptions";
import { PrayerWidget } from "./PrayerWidget";
import { DormMenuCard } from "./DormMenuCard";
import { completeOccurrence, scheduleDate, formatCompletedTime } from "../../shared/recurrence";
import { loadStudyAttendance, setStudyBlockStatus, cycleAttendanceStatus } from "../../shared/studyAttendance";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Header } from "./Header";
import { PcStatus } from "./PcStatus";
import { PomodoroTimer } from "./PomodoroTimer";
import { Icon, type IconName } from "./Icon";
import { loadDashboardData, relativeUseTime, todayTasks } from "../dashboardData";
import { loadTasks, saveTasks, localDateKey } from "../taskStore";
import { loadStudyPrograms } from "../studyProgramStore";
import { studyBlocks, WEEKDAY_SHORT } from "../../shared/studyPrograms";
import { weekDates } from "../../shared/weeklyPlan";
import { MEDIA_STATUS_LABELS, MEDIA_TYPE_ICONS, MEDIA_TYPE_LABELS } from "../../shared/media";
import type { Project } from "../projectStore";
import type { NavigationTarget } from "../navigation";

function parseTimeMinutes(hhmm?: string | null): number | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function formatCountdown(mins: number): string {
  const safe = Math.max(1, mins);
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h > 0 && m > 0) return `${h} sa ${m} dk`;
  if (h > 0) return `${h} sa`;
  return `${m} dk`;
}

type Props = { projects: Project[]; refreshMs: number; onNavigate: (target: NavigationTarget) => void; onAskAi: (text: string) => void; targetId?: string; };
function AiStart({ onAskAi }: Pick<Props, "onAskAi">) {
  const [draft, setDraft] = useState("");
  const submitting = useRef(false);
  function ask(text: string) { if (!text.trim() || submitting.current) return; submitting.current = true; onAskAi(text.trim()); }
  function submit(event: FormEvent) { event.preventDefault(); ask(draft); }
  return <section className="dashboard-ai surface" aria-labelledby="dashboard-ai-heading">
    <div className="dashboard-ai-title"><span className="dashboard-ai-icon"><Icon name="spark" size={23} /></span><div><h2 id="dashboard-ai-heading">ACK AI</h2><p>Bir sonraki adımını birlikte planlayalım.</p></div></div>
    <form onSubmit={submit}><label className="sr-only" htmlFor="dashboard-ai-prompt">ACK AI mesajı</label><textarea id="dashboard-ai-prompt" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={3} maxLength={8000} placeholder="Bana ne yapmak istediğini yaz..." /><div className="dashboard-ai-send"><small>Enter ile gönder · İşlemler için onayın istenir.</small><button className="button button-primary" type="submit" disabled={!draft.trim()}>Gönder <Icon name="arrowRight" size={16} /></button></div></form>
  </section>;
}
export function Dashboard({ refreshMs, onNavigate, onAskAi, targetId }: Props) {
  const [data, setData] = useState(loadDashboardData), [now, setNow] = useState(() => new Date());
  const [studyData, setStudyData] = useState(loadStudyPrograms);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (targetId === "prayer") {
      const el = document.getElementById("prayer-widget");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("prayer-widget-highlight");
        const timer = setTimeout(() => el.classList.remove("prayer-widget-highlight"), 2500);
        return () => clearTimeout(timer);
      }
    }
  }, [targetId]);
  useEffect(() => {
    let frameId: number | null = null;
    const refresh = () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        setData(loadDashboardData());
        setStudyData(loadStudyPrograms());
        frameId = null;
      });
    };
    window.addEventListener("ack-data-changed", refresh);
    window.addEventListener("ack-media-changed", refresh);
    window.addEventListener("ack-recents-changed", refresh);
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      window.removeEventListener("ack-data-changed", refresh);
      window.removeEventListener("ack-media-changed", refresh);
      window.removeEventListener("ack-recents-changed", refresh);
      window.clearInterval(timer);
    };
  }, []);
  const daily = todayTasks(data.tasks.entries, now);
  function complete(id: string) { const current = loadTasks(); if (!saveTasks(current.entries.map(task => task.id === id ? completeOccurrence(task) : task), current)) setFeedback("Görev kaydedilemedi. Mevcut veriler korunuyor."); }
  const summary = dailySummary();
  const allBlocks = studyBlocks(studyData.entries, now);
  const todayDateStr = localDateKey(now);
  const [selectedDate, setSelectedDate] = useState<string>(todayDateStr);
  const [attendance, setAttendance] = useState(() => loadStudyAttendance());
  useEffect(() => {
    const handleAtt = () => setAttendance(loadStudyAttendance());
    window.addEventListener("ack-study-attendance-changed", handleAtt);
    window.addEventListener("ack-data-changed", handleAtt);
    return () => {
      window.removeEventListener("ack-study-attendance-changed", handleAtt);
      window.removeEventListener("ack-data-changed", handleAtt);
    };
  }, []);
  function toggleStudyBlock(blockId: string) {
    const nextStatus = cycleAttendanceStatus(attendance[blockId]?.status);
    setAttendance(setStudyBlockStatus(blockId, nextStatus));
  }
  const todayStudyBlocks = allBlocks.filter(b => b.date === todayDateStr);
  const curWeekDates = weekDates(now);

  const getTasksForDate = (dateStr: string) => {
    return data.tasks.entries.filter(t => {
      if (t.completed) return false;
      if (t.recurrence) {
        return scheduleDate(t, new Date(dateStr + "T12:00:00").getTime()) === dateStr;
      }
      return t.dueDate === dateStr;
    });
  };

  const weekDays = curWeekDates.map(dStr => {
    const d = new Date(dStr + "T12:00:00");
    const dayOfWeek = (d.getDay() + 6) % 7;
    const studyCount = allBlocks.filter(b => b.date === dStr).length;
    const taskCount = getTasksForDate(dStr).length;
    return {
      date: dStr,
      shortLabel: WEEKDAY_SHORT[dayOfWeek],
      dayNum: d.getDate(),
      studyCount,
      taskCount,
      count: studyCount + taskCount,
    };
  });

  const isSelectedToday = selectedDate === todayDateStr;
  const displayedStudyBlocks = allBlocks.filter(b => b.date === selectedDate);
  const displayedTasks = getTasksForDate(selectedDate);

  const selectedDateLabel = (() => {
    try {
      const [y, m, d] = selectedDate.split("-").map(Number);
      return new Date(y, m - 1, d).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "short" });
    } catch {
      return selectedDate;
    }
  })();

  const timelineItems = [
    ...displayedStudyBlocks.map(b => ({
      kind: "study" as const,
      id: b.id,
      time: b.time,
      endTime: b.endTime,
      label: b.label,
      topic: b.topic,
    })),
    ...displayedTasks.map(t => ({
      kind: "task" as const,
      id: t.id,
      time: t.dueTime,
      text: t.text,
      completed: t.completed,
    })),
  ].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const nextSessionCard = ((): {
    eyebrow: string;
    badge: string;
    title: string;
    meta: string;
    tone: "live" | "accent" | "warn";
    icon: IconName;
    target: NavigationTarget;
  } => {
    const activeBlock = todayStudyBlocks.find(b => {
      if (attendance[b.id]?.status) return false;
      const start = parseTimeMinutes(b.time);
      const end = parseTimeMinutes(b.endTime);
      return start !== null && end !== null && start <= nowMinutes && end > nowMinutes;
    });
    if (activeBlock) {
      const end = parseTimeMinutes(activeBlock.endTime)!;
      return {
        eyebrow: "Şu an derstesin",
        badge: `${formatCountdown(end - nowMinutes)} kaldı`,
        title: `${activeBlock.label}${activeBlock.topic ? ` · ${activeBlock.topic}` : ""}`,
        meta: `${activeBlock.time} – ${activeBlock.endTime} · İşaretlemek için tıkla`,
        tone: "live",
        icon: "spark",
        target: { page: "tasks" },
      };
    }

    const upcomingToday: {
      startMins: number;
      eyebrow: string;
      title: string;
      meta: string;
      target: NavigationTarget;
    }[] = [];

    for (const b of todayStudyBlocks) {
      if (attendance[b.id]?.status) continue;
      const start = parseTimeMinutes(b.time);
      if (start !== null && start > nowMinutes) {
        upcomingToday.push({
          startMins: start,
          eyebrow: "Sıradaki ders",
          title: `${b.label}${b.topic ? ` · ${b.topic}` : ""}`,
          meta: `Bugün · ${b.time} – ${b.endTime}`,
          target: { page: "tasks" },
        });
      }
    }

    for (const t of getTasksForDate(todayDateStr)) {
      const start = parseTimeMinutes(t.dueTime);
      if (start !== null && start > nowMinutes) {
        upcomingToday.push({
          startMins: start,
          eyebrow: "Sıradaki görev",
          title: t.text,
          meta: `Bugün · Saat ${t.dueTime}`,
          target: { page: "tasks", id: t.id },
        });
      }
    }

    upcomingToday.sort((a, b) => a.startMins - b.startMins);
    if (upcomingToday.length > 0) {
      const first = upcomingToday[0];
      return {
        eyebrow: first.eyebrow,
        badge: `${formatCountdown(first.startMins - nowMinutes)} sonra`,
        title: first.title,
        meta: first.meta,
        tone: "accent",
        icon: "check",
        target: first.target,
      };
    }

    const unmarkedEarlierBlock = todayStudyBlocks.find(b => !attendance[b.id]?.status);
    if (unmarkedEarlierBlock) {
      return {
        eyebrow: "Bekleyen ders kaydı",
        badge: `Bugün ${unmarkedEarlierBlock.time}`,
        title: `${unmarkedEarlierBlock.label}${unmarkedEarlierBlock.topic ? ` · ${unmarkedEarlierBlock.topic}` : ""}`,
        meta: "Çalışıldı (✓) veya çalışılmadı (✕) işaretle",
        tone: "warn",
        icon: "check",
        target: { page: "tasks" },
      };
    }

    if (daily.length > 0) {
      const firstTask = daily[0];
      const isOverdue = firstTask.label === "Zamanı geçti";
      return {
        eyebrow: isOverdue ? "Geciken görev" : firstTask.label === "Bugün" ? "Bugünkü görev" : "Yaklaşan görev",
        badge: firstTask.task.dueTime || (firstTask.label.startsWith("Sıradaki · ") ? firstTask.label.slice(11) : "Bugün"),
        title: firstTask.task.text,
        meta: isOverdue ? "Tamamlanmayı bekliyor" : "Görev detayını aç",
        tone: isOverdue ? "warn" : "accent",
        icon: "check",
        target: { page: "tasks", id: firstTask.task.id },
      };
    }

    const nextWeekStudyBlocks = studyBlocks(studyData.entries, new Date(now.getTime() + 7 * 86400000));
    const futureBlocks = [...allBlocks, ...nextWeekStudyBlocks]
      .filter(b => b.date > todayDateStr && !attendance[b.id]?.status)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    if (futureBlocks.length > 0) {
      const nextBlock = futureBlocks[0];
      const dayIdx = (new Date(nextBlock.date + "T12:00:00").getDay() + 6) % 7;
      return {
        eyebrow: "Sıradaki ders",
        badge: `${WEEKDAY_SHORT[dayIdx]} ${nextBlock.time}`,
        title: `${nextBlock.label}${nextBlock.topic ? ` · ${nextBlock.topic}` : ""}`,
        meta: `${nextBlock.time} – ${nextBlock.endTime} oturumu`,
        tone: "accent",
        icon: "grid",
        target: { page: "calendar" },
      };
    }

    return {
      eyebrow: "Sıradaki plan",
      badge: "Açık",
      title: "Bekleyen ders veya görev yok",
      meta: "+ Yeni görev eklemek için tıkla",
      tone: "accent",
      icon: "plus",
      target: { page: "tasks", intent: "new-task" },
    };
  })();

  const totalWeekLessons = allBlocks.length;
  const attendedWeekLessons = allBlocks.filter(b => attendance[b.id]?.status === "attended").length;
  const skippedWeekLessons = allBlocks.filter(b => attendance[b.id]?.status === "skipped").length;
  const pendingWeekLessons = Math.max(0, totalWeekLessons - attendedWeekLessons - skippedWeekLessons);
  const weekProgressPct = totalWeekLessons > 0 ? Math.round((attendedWeekLessons / totalWeekLessons) * 100) : 0;
  const weekSkippedPct = totalWeekLessons > 0 ? Math.min(100 - weekProgressPct, Math.round((skippedWeekLessons / totalWeekLessons) * 100)) : 0;

  const recentContentCard = ((): {
    eyebrow: string;
    badge: string;
    title: string;
    meta: string;
    icon: IconName;
    target: NavigationTarget;
  } => {
    const latestNote = data.notes.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const latestMedia = data.media.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];

    if (latestMedia && (!latestNote || latestMedia.updatedAt >= latestNote.updatedAt)) {
      const detailParts = [MEDIA_STATUS_LABELS[latestMedia.status]];
      if (latestMedia.progress?.trim()) detailParts.push(latestMedia.progress.trim());
      if (latestMedia.rating) detailParts.push(`★ ${latestMedia.rating}/10`);
      return {
        eyebrow: `Son Koleksiyon · ${MEDIA_TYPE_LABELS[latestMedia.type]}`,
        badge: relativeUseTime(latestMedia.updatedAt, now.getTime()),
        title: `${MEDIA_TYPE_ICONS[latestMedia.type]} ${latestMedia.title}`,
        meta: detailParts.join(" · "),
        icon: "archive",
        target: { page: "media" },
      };
    }

    if (latestNote) {
      const snippet = latestNote.content.replace(/\s+/g, " ").trim().slice(0, 68);
      return {
        eyebrow: "Son düzenlenen not",
        badge: relativeUseTime(latestNote.updatedAt, now.getTime()),
        title: latestNote.title.trim() || "Başlıksız not",
        meta: snippet || "Notu açmak için tıkla",
        icon: "note",
        target: { page: "notes", id: latestNote.id },
      };
    }

    return {
      eyebrow: "Not & Koleksiyon",
      badge: "Yeni",
      title: "İlk notunu veya koleksiyonunu ekle",
      meta: "Notlar sekmesini açmak için tıkla",
      icon: "note",
      target: { page: "notes", intent: "new-note" },
    };
  })();

  return (
    <div className="dashboard work-dashboard">
      <Header />
      <div className="dashboard-workbench">
        <div className="dashboard-primary-column">
          <div className="dashboard-overview live-status-overview" aria-label="Canlı durum özeti">
            <button
              type="button"
              className={`live-overview-card tone-${nextSessionCard.tone}`}
              onClick={() => onNavigate(nextSessionCard.target)}
            >
              <span className="overview-icon"><Icon name={nextSessionCard.icon} size={20} /></span>
              <span className="live-overview-body">
                <span className="live-overview-top">
                  <span className="live-overview-eyebrow">{nextSessionCard.eyebrow}</span>
                  <span className="live-overview-badge">{nextSessionCard.badge}</span>
                </span>
                <strong className="live-overview-title" title={nextSessionCard.title}>{nextSessionCard.title}</strong>
                <small className="live-overview-meta">{nextSessionCard.meta}</small>
              </span>
            </button>

            <button
              type="button"
              className="live-overview-card tone-progress"
              onClick={() => onNavigate({ page: "calendar" })}
            >
              <span className="overview-icon"><Icon name="layers" size={20} /></span>
              <span className="live-overview-body">
                <span className="live-overview-top">
                  <span className="live-overview-eyebrow">
                    {totalWeekLessons > 0 ? "Haftalık ders ilerlemesi" : "Haftalık ders planı"}
                  </span>
                  <span className="live-overview-badge">
                    {totalWeekLessons > 0 ? `%${weekProgressPct}` : "Planla"}
                  </span>
                </span>
                <strong className="live-overview-title">
                  {totalWeekLessons > 0 ? `${attendedWeekLessons} / ${totalWeekLessons} ders çalışıldı` : "Ders programı eklenmedi"}
                </strong>
                {totalWeekLessons > 0 ? (
                  <span className="live-progress-wrap">
                    <span className="live-progress-track" aria-hidden="true">
                      <span className="live-progress-fill is-attended" style={{ width: `${weekProgressPct}%` }} />
                      {weekSkippedPct > 0 && (
                        <span className="live-progress-fill is-skipped" style={{ width: `${weekSkippedPct}%` }} />
                      )}
                    </span>
                    <small className="live-overview-meta">
                      {pendingWeekLessons === 0 && skippedWeekLessons === 0
                        ? "Haftanın tüm dersleri tamamlandı ✓"
                        : `${pendingWeekLessons} bekliyor${skippedWeekLessons > 0 ? ` · ${skippedWeekLessons} çalışılmadı` : ""}`}
                    </small>
                  </span>
                ) : (
                  <small className="live-overview-meta">Aylık Plan'dan ders çizelgesi ekle</small>
                )}
              </span>
            </button>

            <button
              type="button"
              className="live-overview-card tone-recent"
              onClick={() => onNavigate(recentContentCard.target)}
            >
              <span className="overview-icon"><Icon name={recentContentCard.icon} size={20} /></span>
              <span className="live-overview-body">
                <span className="live-overview-top">
                  <span className="live-overview-eyebrow">{recentContentCard.eyebrow}</span>
                  <span className="live-overview-badge">{recentContentCard.badge}</span>
                </span>
                <strong className="live-overview-title" title={recentContentCard.title}>{recentContentCard.title}</strong>
                <small className="live-overview-meta">{recentContentCard.meta}</small>
              </span>
            </button>
          </div>

          {/* Haftalık Çizelge (Üstte) */}
          <section className="dashboard-weekly-preview surface" aria-labelledby="dashboard-weekly-heading">
            <div className="dashboard-section-top">
              <div className="weekly-preview-title">
                <span className="overview-icon-small"><Icon name="grid" size={18} /></span>
                <div>
                  <h2 id="dashboard-weekly-heading">Haftalık Çizelge</h2>
                </div>
              </div>
              <button type="button" className="dashboard-more" onClick={() => onNavigate({ page: "calendar" })}>
                Tüm planı aç <Icon name="arrowRight" size={14} />
              </button>
            </div>

            <div className="dashboard-schedule-vertical-layout">
              {/* Üstte: Haftanın Günleri Şeridi (İlk SS) */}
              <div className="schedule-week-strip-box">
                <div className="week-mini-strip-compact">
                  {weekDays.map(day => (
                    <button
                      key={day.date}
                      type="button"
                      className={`week-mini-cell ${day.date === selectedDate ? "is-selected" : ""} ${day.date === todayDateStr ? "is-today" : ""}`}
                      onClick={() => setSelectedDate(day.date)}
                      title={`${day.shortLabel} ${day.dayNum}: ${day.count > 0 ? `${day.count} ders oturumu` : "Ders yok"}`}
                    >
                      <span className="mini-cell-day">{day.shortLabel}</span>
                      <span className="mini-cell-num">{day.dayNum}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Altta: Seçilen Günün Oturum ve İşleri (İkinci SS) */}
              <div className="schedule-day-feed-box">
                <div className="schedule-column-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span className="column-dot" />
                    <strong>{isSelectedToday ? "Bugünkü Oturumlar & İşler" : `${selectedDateLabel} Programı`}</strong>
                  </div>
                  {!isSelectedToday && (
                    <button
                      type="button"
                      className="dashboard-text-button"
                      style={{ fontSize: "0.76rem", padding: "0.2rem 0.5rem", height: "auto", minHeight: "auto" }}
                      onClick={() => setSelectedDate(todayDateStr)}
                    >
                      Bugüne dön
                    </button>
                  )}
                </div>

                {timelineItems.length > 0 ? (
                  <div className="schedule-timeline-list">
                    {timelineItems.map(item => (
                      <div
                        key={item.id}
                        className={`schedule-timeline-item ${item.kind === "study" ? "session-study" : "session-task"} ${item.kind === "task" && item.completed ? "is-completed" : ""}`}
                      >
                        <span className="timeline-clock">
                          {item.kind === "study" ? `${item.time} – ${item.endTime}` : item.time || "Tüm gün"}
                        </span>
                        <div className="timeline-content">
                          <strong>{item.kind === "study" ? item.label : item.text}</strong>
                          {item.kind === "study" && item.topic ? <small>{item.topic}</small> : null}
                          {item.kind === "study" && attendance[item.id]?.status && (
                            <div style={{ marginTop: "4px" }}>
                              {attendance[item.id]?.status === "attended" ? (
                                <span className="timeline-status-badge is-attended" style={{ fontSize: "0.78rem", color: "#34d399", fontWeight: 600 }}>
                                  ✓ Çalışıldı
                                </span>
                              ) : attendance[item.id]?.status === "skipped" ? (
                                <span className="timeline-status-badge is-skipped" style={{ fontSize: "0.78rem", color: "#f87171", fontWeight: 600 }}>
                                  ✗ Çalışılmadı
                                </span>
                              ) : null}
                            </div>
                          )}
                        </div>
                        <span className={`timeline-tag ${item.kind === "study" ? "" : "task-tag"}`}>
                          {item.kind === "study" ? "Ders" : "Görev"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="schedule-today-empty">
                    <p>{isSelectedToday ? "Bugün için ders veya görev bulunmuyor." : `${selectedDateLabel} için planlı ders veya görev yok.`}</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {feedback && <p className="tool-feedback error" role="alert">{feedback}</p>}

          {/* Bugün ve ACK AI (Altta) */}
          <div className="dashboard-start-grid">
            <section className="dashboard-today surface" aria-labelledby="dashboard-today-heading">
              <div className="dashboard-section-top">
                <div>
                  <h2 id="dashboard-today-heading">Bugün</h2>
                  <small className="today-date-subtitle">
                    {now.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" })}
                  </small>
                </div>
                <button type="button" className="dashboard-text-button" onClick={() => onNavigate({ page: "tasks", intent: "new-task" })}>
                  + Görev
                </button>
              </div>

              <div className="daily-summary-counts">
                <button type="button" className="today-badge-btn" onClick={() => onNavigate({ page: "tasks" })}>
                  <Icon name="check" size={13} />
                  <span>
                    <strong>{summary.today}</strong> görev
                    {todayStudyBlocks.length > 0 && ` · ${todayStudyBlocks.filter(b => !attendance[b.id]?.status).length}/${todayStudyBlocks.length} ders`}
                    {summary.overdue > 0 && <em className="overdue-count"> ({summary.overdue} geciken)</em>}
                  </span>
                </button>
                <button type="button" className="today-badge-btn" onClick={() => onNavigate({ page: "inbox" })}>
                  <Icon name="files" size={13} />
                  <span><strong>{summary.unhandledInbox ?? "0"}</strong> gelen</span>
                </button>
                <button type="button" className="today-badge-btn" onClick={() => onNavigate({ page: "subscriptions" })}>
                  <Icon name="archive" size={13} />
                  <span><strong>{summary.subscriptions.length}</strong> abonelik</span>
                </button>
              </div>

              {data.tasks.warning && <p className="dashboard-empty" role="status">{data.tasks.warning}</p>}

              <div className="dashboard-daily-list">
                {todayStudyBlocks.map(block => {
                  const att = attendance[block.id];
                  const status = att?.status;
                  return (
                    <div
                      className={`dashboard-daily-task study-daily-row ${status === "attended" ? "is-study-attended" : status === "skipped" ? "is-study-skipped" : ""}`}
                      key={block.id}
                    >
                      <button
                        type="button"
                        className={`task-toggle study-status-toggle ${status === "attended" ? "is-attended" : status === "skipped" ? "is-skipped" : ""}`}
                        onClick={() => toggleStudyBlock(block.id)}
                        title="1 tık: Çalıştım · 2 tık: Çalışmadım · 3 tık: Sıfırla"
                        aria-label={`${block.label}: ${status === undefined ? "Çalıştım olarak işaretle" : status === "attended" ? "Çalışmadım olarak işaretle" : "Durumu sıfırla"}`}
                      >
                        {status === "attended" ? (
                          <Icon name="check" size={12} />
                        ) : status === "skipped" ? (
                          <span className="study-toggle-x" aria-hidden="true">✕</span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        className="dashboard-task-open"
                        onClick={() => toggleStudyBlock(block.id)}
                      >
                        <strong>{block.label}{block.topic ? ` · ${block.topic}` : ""}</strong>
                        <small>
                          📚 Ders · {block.time} – {block.endTime}
                          {status === "attended" ? (
                            <span className="study-att-inline is-attended">
                              {" · ✓ Çalışıldı"}{formatCompletedTime(att?.at) ? ` (${formatCompletedTime(att?.at)})` : ""}
                            </span>
                          ) : status === "skipped" ? (
                            <span className="study-att-inline is-skipped">
                              {" · ✗ Çalışılmadı"}{formatCompletedTime(att?.at) ? ` (${formatCompletedTime(att?.at)})` : ""}
                            </span>
                          ) : (
                            <span className="study-att-hint"> · 1 tık ✓ · 2 tık ✕</span>
                          )}
                        </small>
                      </button>
                    </div>
                  );
                })}
                {daily.map(({ task, label }) => (
                  <div className="dashboard-daily-task" key={task.id}>
                    <button
                      type="button"
                      className="task-toggle"
                      onClick={() => complete(task.id)}
                      aria-label={task.text + ": tamamlandı işaretle"}
                    />
                    <button type="button" className="dashboard-task-open" onClick={() => onNavigate({ page: "tasks", id: task.id })}>
                      <strong>{task.text}</strong>
                      <small className={label === "Zamanı geçti" ? "overdue" : ""}>
                        {label}{task.dueTime && " · " + task.dueTime}
                      </small>
                    </button>
                  </div>
                ))}
              </div>

              {!daily.length && !todayStudyBlocks.length && !data.tasks.locked && (
                <div className="dashboard-empty-state">
                  <span><Icon name="check" size={26} /></span>
                  <strong>Günün açık</strong>
                  <p>Bekleyen tarihli görev veya ders yok.</p>
                </div>
              )}
            </section>

            <AiStart onAskAi={onAskAi} />
          </div>

          {/* Pomodoro Odak Sayacı */}
          <PomodoroTimer />
        </div>

        <aside className="dashboard-right-rail" aria-label="Namaz vakitleri ve durum">
          <PrayerWidget />
          <DormMenuCard />
          <Subscriptions compact onOpen={() => onNavigate({ page: "subscriptions" })} />
          <PcStatus refreshMs={refreshMs} compact />
        </aside>
      </div>
    </div>
  );
}
