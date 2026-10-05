import { nextOccurrence } from "../shared/recurrence";
import { subscriptionReminder } from "../shared/subscriptions";
import { loadSubscriptions } from "./subscriptionStore";
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { loadTasks, reminderKey, saveTasks, taskDueAt, type Task } from "./taskStore";
export function pendingReminders(tasks: Task[]) {
  return tasks.filter(t=>!t.completed&&t.reminder&&taskDueAt(t)!==null).flatMap(task=>{
    let due=taskDueAt(task)!;const delivered=Number(task.remindedFor?.split("|")[1]);
    if(task.recurrence&&delivered>=due){const next=nextOccurrence(task.recurrence,Math.max(delivered,Date.now()-1));if(!next)return [];due=next.at;}
    if(task.remindedFor===task.id+"|"+due)return [];
    return [{id:task.id,text:task.text,dueAt:due}];
  });
}
export function useReminders(onError: (message: string) => void) {
  useEffect(() => {
    let active = true, running = false, dirty = false, paused = false; const cleanups: (() => void)[] = [];
    async function sync() {
      dirty = true; if (running || paused) return; running = true;
      try { while (dirty && active && !paused) {
        dirty = false; const loaded = loadTasks();
        const delivered = await invoke<string[]>("sync_task_reminders", { reminders: loaded.locked ? [] : [...pendingReminders(loaded.entries),...loadSubscriptions().entries.flatMap(s=>{const next=subscriptionReminder(s);return next?[{id:"subscription:"+s.id,text:s.name+" ödeme hatırlatması",dueAt:next.at}]:[]})] });
        if (!active) return;
        if (paused) { dirty = true; continue; }
        if (loaded.locked) { onError("Görevler okunamadığı için hatırlatmalar yüklenemedi."); continue; }
        const latest = loadTasks();
        const updated = latest.entries.map((task) => { const key = delivered.filter(key=>key.startsWith(task.id+"|")).sort((a,b)=>Number(b.split("|")[1])-Number(a.split("|")[1]))[0] ?? reminderKey(task); return key && delivered.includes(key) && task.remindedFor !== key ? { ...task, remindedFor: key } : task; });
        if (updated.some((task, i) => task !== latest.entries[i]) && !saveTasks(updated, latest)) onError("Hatırlatma durumu yerel kayıtlara yazılamadı.");
      } } catch { if (active) onError("Windows hatırlatmaları yüklenemedi. Görev kayıtları korunuyor."); } finally { running = false; }
    }
    const refresh = () => { void sync(); }; window.addEventListener("ack-data-changed", refresh);
    const restoreActive = (event: Event) => { paused = (event as CustomEvent).detail === true; if (!paused) refresh(); }; window.addEventListener("ack-restore-active", restoreActive);
    const subscriptions = [listen<{ id: string; key: string }>("ack-reminder-delivered", () => { if (active) refresh(); }), listen<string>("ack-reminder-error", () => { if (active) onError("Windows hatırlatması hazırlanamadı."); })];
    void Promise.all(subscriptions.map(async (promise) => { try { const cleanup = await promise; if (active) cleanups.push(cleanup); else cleanup(); } catch {} })).then(() => { if (active) refresh(); });
    return () => { active = false; window.removeEventListener("ack-data-changed", refresh); window.removeEventListener("ack-restore-active", restoreActive); cleanups.forEach((cleanup) => cleanup()); };
  }, [onError]);
}
