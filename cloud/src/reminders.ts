import { nextOccurrence, type Recurrence } from "../../shared/recurrence";
import { subscriptionReminder, money, type Subscription } from "../../shared/subscriptions";
import { calculatePrayerTimes } from "../../shared/prayerTimes";
import { findMenuForDate, turkeyDateKey, type DormMenuRecord } from "../../shared/dormMenu";
import type { StudyProgram } from "../../shared/studyPrograms";
import type { StudyAttendanceDay } from "../../shared/studyAttendance";
import type { PhoneTask } from "../../shared/phone";
import { buildPushPayload, vapidHeaders } from "@block65/webcrypto-web-push";
import type { Env } from "./types";
export class PushFailure extends Error {constructor(public code:string,public status=502){super(code);}}
const decode=(value:string)=>Uint8Array.from(atob(value.replaceAll("-","+").replaceAll("_","/")+"=".repeat((4-value.length%4)%4)),char=>char.charCodeAt(0));
export async function verifyVapid(env:Env){
  const {headers}=await vapidHeaders({endpoint:"https://web.push.apple.com/"} as Parameters<typeof vapidHeaders>[0],{subject:env.VAPID_SUBJECT,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY});
  const jwt=headers.authorization.split("t=")[1].split(",")[0],parts=jwt.split(".");
  const key=await crypto.subtle.importKey("raw",decode(env.VAPID_PUBLIC_KEY),{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
  if(!await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},key,decode(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1])))throw new PushFailure("VAPID_MISMATCH",503);
}
export async function sendNotification(env: Env, subscription: string, data: unknown, transport: typeof fetch = fetch) {
  const sub = JSON.parse(subscription);let stage="vapid";
  try {
    await verifyVapid(env);stage="payload";
    const payload = await buildPushPayload({ data: JSON.stringify(data), options: { ttl: 3600 } }, sub, { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY });
    stage="transport";const response=await transport(sub.endpoint, { ...payload, redirect: "manual", signal: AbortSignal.timeout(10000) });
    if(response.status>=300&&response.status<400)throw new PushFailure("PUSH_REDIRECT_REJECTED");return response;
  } catch(error){
    let message=error instanceof Error?error.message:"Unknown failure";
    for(const value of [env.OWNER_SECRET,env.VAPID_PRIVATE_KEY,env.VAPID_PUBLIC_KEY,sub.endpoint,sub.keys?.p256dh,sub.keys?.auth])if(value)message=message.split(value).join("[redacted]");
    message=message.replace(/[A-Za-z0-9_-]{24,}/g,"[redacted]").slice(0,300);
    console.warn(JSON.stringify({event:"push_failure",stage,name:error instanceof Error?error.name:"Error",message}));
    throw error instanceof PushFailure?error:new PushFailure(stage==="vapid"?"VAPID_INVALID":stage==="payload"?"PUSH_ENCRYPTION_FAILED":"PUSH_NETWORK_FAILED");
  }
}

function istanbulMinutesOfDay(ms: number): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Istanbul",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(ms));
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return (h === 24 ? 0 : h) * 60 + m;
  } catch {
    const d = new Date(ms);
    return d.getUTCHours() * 60 + d.getUTCMinutes() + 180;
  }
}

export async function runReminders(env: Env, send = sendNotification, now = Date.now(), menuFetch: typeof fetch = fetch) {
  const rows = await env.DB.prepare(`SELECT r.task_id,r.generation,r.due_at,r.kind,t.data,p.device_id,p.subscription FROM reminders r
    JOIN (SELECT kind,id,data,deleted FROM records UNION ALL SELECT kind,'subscription:'||id AS id,data,deleted FROM subscriptions) t ON t.kind=r.kind AND t.id=r.task_id AND t.deleted=0
    JOIN push_subscriptions p ON p.active=1 JOIN devices d ON d.id=p.device_id AND d.revoked_at IS NULL
    LEFT JOIN reminder_deliveries l ON l.generation=r.generation AND l.device_id=p.device_id
    WHERE r.active=1 AND r.due_at<=? AND (l.generation IS NULL OR (l.state='retry' AND l.retry_at<=? AND l.attempts<3))
    ORDER BY r.due_at LIMIT 5`).bind(now,now).all<{task_id:string;kind:string;generation:string;data:string;device_id:string;subscription:string}>();
  for (const row of rows.results) {
    const task = JSON.parse(row.data); if (task.completed || row.kind==="subscriptions"&&task.status!=="active") continue;
    const claim = await env.DB.prepare("INSERT INTO reminder_deliveries(generation,device_id,state,attempts,retry_at) VALUES(?,?,'sending',1,0) ON CONFLICT(generation,device_id) DO UPDATE SET state='sending',attempts=attempts+1 WHERE state='retry' AND retry_at<=? AND attempts<3 RETURNING generation").bind(row.generation,row.device_id,now).first();
    if (!claim) continue;
    // Re-check revocation/snooze immediately before external transmission.
    const active = await env.DB.prepare("SELECT r.task_id FROM reminders r JOIN devices d ON d.id=? JOIN push_subscriptions p ON p.device_id=d.id WHERE r.task_id=? AND r.generation=? AND r.active=1 AND d.revoked_at IS NULL AND p.active=1").bind(row.device_id,row.task_id,row.generation).first();
    if (!active) { await env.DB.prepare("UPDATE reminder_deliveries SET state='cancelled' WHERE generation=? AND device_id=?").bind(row.generation,row.device_id).run(); continue; }
    try {
      const response = await send(env,row.subscription,{ title:"ACKDeck", body:row.kind==="subscriptions"?`${task.name}: ${money(task.amount,task.currency)} ödeme hatırlatması` : task.text.slice(0,600), url:row.kind==="subscriptions"?"/#page=subscriptions":`/#task=${encodeURIComponent(row.task_id)}`, tag:row.generation });
      if ([404,410].includes(response.status)) await env.DB.prepare("UPDATE push_subscriptions SET active=0 WHERE device_id=?").bind(row.device_id).run();
      // Only explicit 429/5xx responses retry. Unknown transport outcomes stay uncertain
      // instead of repeatedly dispatching a notification that may already have arrived.
      const state = response.ok ? "sent" : response.status === 429 || response.status >= 500 ? "retry" : "failed";
      await env.DB.prepare("UPDATE reminder_deliveries SET state=?,retry_at=? WHERE generation=? AND device_id=?").bind(state,now+120000,row.generation,row.device_id).run();
    } catch { await env.DB.prepare("UPDATE reminder_deliveries SET state='uncertain' WHERE generation=? AND device_id=?").bind(row.generation,row.device_id).run(); }
  }

  let pcState: { prayer_config?: string | null; study_reminders?: string | null } | null = null;
  try {
    pcState = await env.DB.prepare("SELECT prayer_config, study_reminders FROM desktop_state WHERE id=1").first<{ prayer_config?: string | null; study_reminders?: string | null }>();
  } catch {
    pcState = await env.DB.prepare("SELECT prayer_config FROM desktop_state WHERE id=1").first<{ prayer_config?: string | null }>().catch(() => null);
  }

  // Prayer push notifications for paired devices
  try {
    if (pcState?.prayer_config) {
      const cfg = JSON.parse(pcState.prayer_config);
      if (cfg && typeof cfg.latitude === "number" && typeof cfg.longitude === "number" && (cfg.notifyAtTime || (typeof cfg.notifyBeforeMinutes === "number" && cfg.notifyBeforeMinutes > 0))) {
        const prayerAlerts: { id: string; text: string; dueAt: number }[] = [];
        for (const offset of [0, 1]) {
          const target = new Date(now + offset * 86400000);
          const dayInfo = calculatePrayerTimes(cfg.latitude, cfg.longitude, target, cfg.city || "Ankara");
          for (const item of dayInfo.items) {
            if (item.name === "sunrise") continue;
            if (cfg.notifyAtTime) {
              prayerAlerts.push({
                id: `prayer:${item.name}:${item.timestamp}`,
                text: `${item.label} vakti girdi (${item.time}).`,
                dueAt: item.timestamp,
              });
            }
            if (typeof cfg.notifyBeforeMinutes === "number" && cfg.notifyBeforeMinutes > 0) {
              const leadDue = item.timestamp - cfg.notifyBeforeMinutes * 60000;
              prayerAlerts.push({
                id: `prayer-lead:${cfg.notifyBeforeMinutes}:${item.name}:${item.timestamp}`,
                text: `${item.label} vaktine ${cfg.notifyBeforeMinutes} dakika kaldı (${item.time}).`,
                dueAt: leadDue,
              });
            }
          }
        }
        const dueAlerts = prayerAlerts.filter(r => r.dueAt <= now && r.dueAt >= now - 30 * 60000);
        if (dueAlerts.length > 0) {
          const devices = await env.DB.prepare("SELECT p.device_id, p.subscription FROM push_subscriptions p JOIN devices d ON d.id=p.device_id WHERE p.active=1 AND d.revoked_at IS NULL").all<{device_id:string;subscription:string}>();
          for (const alert of dueAlerts) {
            for (const device of devices.results) {
              const claim = await env.DB.prepare("INSERT INTO reminder_deliveries(generation,device_id,state,attempts,retry_at) VALUES(?,?,'sending',1,0) ON CONFLICT(generation,device_id) DO UPDATE SET state='sending',attempts=attempts+1 WHERE state='retry' AND retry_at<=? AND attempts<3 RETURNING generation").bind(alert.id, device.device_id, now).first();
              if (!claim) continue;
              try {
                const response = await send(env, device.subscription, {
                  title: "ACKDeck",
                  body: alert.text,
                  url: "/#page=today",
                  tag: alert.id,
                });
                if ([404, 410].includes(response.status)) await env.DB.prepare("UPDATE push_subscriptions SET active=0 WHERE device_id=?").bind(device.device_id).run();
                const state = response.ok ? "sent" : response.status === 429 || response.status >= 500 ? "retry" : "failed";
                await env.DB.prepare("UPDATE reminder_deliveries SET state=?,retry_at=? WHERE generation=? AND device_id=?").bind(state, now + 120000, alert.id, device.device_id).run();
              } catch {
                await env.DB.prepare("UPDATE reminder_deliveries SET state='uncertain' WHERE generation=? AND device_id=?").bind(alert.id, device.device_id).run();
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn("Prayer reminder processing error:", error);
  }

  // Scheduled Study Program (Ders) push notifications when PC is off
  try {
    const progRows = await env.DB.prepare("SELECT data FROM study_programs WHERE deleted=0").all<{ data: string }>().catch(() => ({ results: [] }));
    if (progRows.results.length > 0) {
      let prefs: Array<{ id: string; leadMinutes: number | null }> = [];
      if (pcState?.study_reminders) {
        try {
          const parsed = JSON.parse(pcState.study_reminders);
          if (Array.isArray(parsed)) prefs = parsed;
        } catch {}
      }

      const todayKey = turkeyDateKey(new Date(now));
      const tomorrowKey = turkeyDateKey(new Date(now + 86400000));
      const attRows = await env.DB.prepare("SELECT data FROM study_attendance WHERE deleted=0 AND id IN (?, ?)").bind(todayKey, tomorrowKey).all<{ data: string }>().catch(() => ({ results: [] }));
      const markedBlocks = new Set<string>();
      for (const r of attRows.results) {
        try {
          const day = JSON.parse(r.data) as StudyAttendanceDay;
          for (const blockId of Object.keys(day.entries || {})) markedBlocks.add(blockId);
        } catch {}
      }

      const studyAlerts: Array<{ id: string; text: string }> = [];
      for (const row of progRows.results) {
        const p = JSON.parse(row.data) as StudyProgram;
        if (!p.active) continue;
        const explicitPref = prefs.find((x) => x.id === p.id);
        if (explicitPref && explicitPref.leadMinutes === null) continue;
        const leadMin = explicitPref && typeof explicitPref.leadMinutes === "number" && [0, 15, 30, 60].includes(explicitPref.leadMinutes)
          ? explicitPref.leadMinutes
          : 15;
        const leadMs = leadMin * 60000;

        for (const s of p.sessions) {
          const rule: Recurrence = {
            frequency: "weekly",
            interval: 1,
            weekdays: s.weekdays.map((d) => d % 7),
            dayOfMonth: 1,
            start: p.startDate,
            time: s.time,
            timezone: p.timezone || "Europe/Istanbul",
            endDate: p.endDate,
            count: null,
          };
          const occ = nextOccurrence(rule, now - 25 * 60000 + leadMs);
          if (!occ) continue;
          const notifyAt = occ.at - leadMs;
          if (notifyAt <= now && notifyAt >= now - 25 * 60000) {
            const blockKey = `${p.id}:${s.id}:${occ.date}`;
            if (markedBlocks.has(blockKey)) continue;
            const gen = `study:${p.id}:${s.id}:${occ.date}:lead:${leadMin}`;
            const topicText = s.topic ? ` (${s.topic})` : "";
            const bodyText = leadMin > 0
              ? `📚 ${s.subject}${topicText} dersine ${leadMin} dk kaldı (${s.time}).`
              : `📚 ${s.subject}${topicText} ders saati başladı (${s.time}).`;
            studyAlerts.push({ id: gen, text: bodyText.slice(0, 280) });
          }
        }
      }

      if (studyAlerts.length > 0) {
        const devices = await env.DB.prepare("SELECT p.device_id, p.subscription FROM push_subscriptions p JOIN devices d ON d.id=p.device_id WHERE p.active=1 AND d.revoked_at IS NULL").all<{ device_id: string; subscription: string }>();
        for (const alert of studyAlerts) {
          for (const device of devices.results) {
            const claim = await env.DB.prepare("INSERT INTO reminder_deliveries(generation,device_id,state,attempts,retry_at) VALUES(?,?,'sending',1,0) ON CONFLICT(generation,device_id) DO UPDATE SET state='sending',attempts=attempts+1 WHERE state='retry' AND retry_at<=? AND attempts<3 RETURNING generation").bind(alert.id, device.device_id, now).first();
            if (!claim) continue;
            try {
              const response = await send(env, device.subscription, {
                title: "ACKDeck · Ders Hatırlatması",
                body: alert.text,
                url: "/#page=today",
                tag: alert.id,
              });
              if ([404, 410].includes(response.status)) await env.DB.prepare("UPDATE push_subscriptions SET active=0 WHERE device_id=?").bind(device.device_id).run();
              const state = response.ok ? "sent" : response.status === 429 || response.status >= 500 ? "retry" : "failed";
              await env.DB.prepare("UPDATE reminder_deliveries SET state=?,retry_at=? WHERE generation=? AND device_id=?").bind(state, now + 120000, alert.id, device.device_id).run();
            } catch {
              await env.DB.prepare("UPDATE reminder_deliveries SET state='uncertain' WHERE generation=? AND device_id=?").bind(alert.id, device.device_id).run();
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn("Study reminder processing error:", error);
  }

  // 12:30 Dorm Meal Menu (Yurt Yemek Menüsü) push notification when PC is off
  try {
    const minsOfDay = istanbulMinutesOfDay(now);
    if (pcState?.prayer_config && minsOfDay >= 12 * 60 + 30 && minsOfDay <= 14 * 60 + 30) {
      const todayKey = turkeyDateKey(new Date(now));
      const gen = `dorm-menu:${todayKey}`;
      const pendingDevices = await env.DB.prepare(
        `SELECT p.device_id, p.subscription FROM push_subscriptions p
         JOIN devices d ON d.id=p.device_id AND d.revoked_at IS NULL
         LEFT JOIN reminder_deliveries l ON l.generation=? AND l.device_id=p.device_id
         WHERE p.active=1 AND (l.generation IS NULL OR (l.state='retry' AND l.retry_at<=? AND l.attempts<3))`,
      )
        .bind(gen, now)
        .all<{ device_id: string; subscription: string }>();

      if (pendingDevices.results.length > 0) {
        let canFetch = true;
        if (menuFetch === fetch) {
          const throttle = await env.DB.prepare(
            "INSERT INTO rate_limits(bucket,count,reset_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN reset_at<? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END RETURNING count",
          )
            .bind(`dorm-fetch:${todayKey}`, now + 600_000, now, now)
            .first<{ count: number }>();
          canFetch = (throttle?.count ?? 1) === 1;
        }
        if (canFetch) {
          const res = await menuFetch("https://altinkalemkarabuk.com/icerik/icerik.json", {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) {
            const json = (await res.json()) as { records?: DormMenuRecord[]; menu?: { kayitlar?: DormMenuRecord[] } };
            const records = Array.isArray(json?.records) ? json.records : Array.isArray(json?.menu?.kayitlar) ? json.menu.kayitlar : [];
            const menu = findMenuForDate(records, todayKey);
            if (menu && !menu.isFallback && menu.date?.trim().startsWith(todayKey) && menu.dinnerDishes.length > 0) {
              const dishesText = menu.dinnerDishes.join(", ").slice(0, 300);
              for (const device of pendingDevices.results) {
                const claim = await env.DB.prepare(
                  "INSERT INTO reminder_deliveries(generation,device_id,state,attempts,retry_at) VALUES(?,?,'sending',1,0) ON CONFLICT(generation,device_id) DO UPDATE SET state='sending',attempts=attempts+1 WHERE state='retry' AND retry_at<=? AND attempts<3 RETURNING generation",
                )
                  .bind(gen, device.device_id, now)
                  .first();
                if (!claim) continue;
                try {
                  const response = await send(env, device.subscription, {
                    title: "🍽️ Günün Yemek Menüsü",
                    body: dishesText,
                    url: "/#page=today",
                    tag: gen,
                  });
                  if ([404, 410].includes(response.status)) await env.DB.prepare("UPDATE push_subscriptions SET active=0 WHERE device_id=?").bind(device.device_id).run();
                  const state = response.ok ? "sent" : response.status === 429 || response.status >= 500 ? "retry" : "failed";
                  await env.DB.prepare("UPDATE reminder_deliveries SET state=?,retry_at=? WHERE generation=? AND device_id=?").bind(state, now + 120000, gen, device.device_id).run();
                } catch {
                  await env.DB.prepare("UPDATE reminder_deliveries SET state='uncertain' WHERE generation=? AND device_id=?").bind(gen, device.device_id).run();
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn("Dorm menu reminder processing error:", error);
  }

  // Advance the notification cursor only, not the user's overdue task. The
  // saved rule lets this same Cron continue while every desktop is powered off.
  const finished=await env.DB.prepare("SELECT r.*,t.data FROM reminders r JOIN (SELECT kind,id,data,deleted FROM records UNION ALL SELECT kind,'subscription:'||id AS id,data,deleted FROM subscriptions) t ON t.kind=r.kind AND t.id=r.task_id AND t.deleted=0 WHERE r.active=1 AND r.due_at<=? AND NOT EXISTS (SELECT 1 FROM reminder_deliveries l JOIN devices d ON d.id=l.device_id AND d.revoked_at IS NULL JOIN push_subscriptions p ON p.device_id=d.id AND p.active=1 WHERE l.generation=r.generation AND (l.state='sending' OR l.state='retry' AND l.attempts<3)) AND NOT EXISTS (SELECT 1 FROM push_subscriptions p JOIN devices d ON d.id=p.device_id AND d.revoked_at IS NULL WHERE p.active=1 AND NOT EXISTS (SELECT 1 FROM reminder_deliveries l WHERE l.device_id=p.device_id AND l.generation=r.generation)) LIMIT 40").bind(now).all<{task_id:string;kind:string;generation:string;occurrence_at:number;data:string}>();
  for(const row of finished.results){
    const data=JSON.parse(row.data),task=data as PhoneTask;
    if(row.kind==="tasks"&&!task.recurrence)continue;
    const next=row.kind==="subscriptions"?subscriptionReminder(data as Subscription,now):task.recurrence&&!task.completed?nextOccurrence(task.recurrence,Math.max(now+(task.reminderLeadMinutes??0)*60000,row.occurrence_at??0)):null;
    const occurrence=next?("paymentAt" in next?next.paymentAt:next.at):0;
    await env.DB.prepare("UPDATE reminders SET due_at=?,occurrence_at=?,generation=?,active=? WHERE task_id=? AND generation=? AND active=1").bind(next ? next.at-(row.kind==="tasks"?(task.reminderLeadMinutes??0)*60000:0) : 0,occurrence,row.task_id+":occ:"+occurrence,Number(!!next),row.task_id,row.generation).run();
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM rate_limits WHERE reset_at<?").bind(now-3600000),
    env.DB.prepare("DELETE FROM pairing_codes WHERE expires_at<?").bind(now-86400000),
    env.DB.prepare("UPDATE remote_commands SET state='expired' WHERE state IN ('pending','claimed') AND expires_at<?").bind(now),
  ]);
  await env.DB.prepare("DELETE FROM ai_queries WHERE expires_at<?").bind(now - 300000).run().catch(() => {});
}
