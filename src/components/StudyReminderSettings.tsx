import { useState } from "react";
import type { StudyProgram } from "../../shared/studyPrograms";
import { loadStudyReminders, saveStudyReminder } from "../studyReminderStore";
export function StudyReminderSettings({ programs }: { programs: StudyProgram[] }) {
  const loaded = loadStudyReminders(), [error, setError] = useState("");
  if (!programs.length) return null;
  return <section className="settings-card surface"><h2>Ders hatırlatmaları</h2><p>İsteğe bağlı Windows bildirimleri. ACKDeck açıkken veya tepside çalışırken gönderilir. Bu bilgisayara özeldir; telefona bildirim göndermez.</p>{(loaded.locked || error) && <p role="alert">{error || "Hatırlatma tercihleri okunamadı. Kayıtlar korunuyor."}</p>}{programs.map(p => <label className="study-reminder-row" key={p.id}><span>{p.name}{!p.active && " · Duraklatıldı"}</span><select disabled={loaded.locked} value={loaded.entries.find(v => v.id === p.id)?.leadMinutes ?? "off"} onChange={e => setError(saveStudyReminder(p.id, e.target.value === "off" ? null : Number(e.target.value)) ? "" : "Hatırlatma tercihi kaydedilemedi.")}><option value="off">Kapalı</option><option value="0">Ders başlangıcında</option><option value="15">15 dakika önce</option><option value="30">30 dakika önce</option><option value="60">1 saat önce</option></select></label>)}</section>;
}
