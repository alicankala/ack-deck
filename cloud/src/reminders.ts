import { nextOccurrence } from "../../shared/recurrence";
import { subscriptionReminder, money, type Subscription } from "../../shared/subscriptions";
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
export async function runReminders(env: Env, send = sendNotification) {
  const now = Date.now();
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
  // Advance the notification cursor only, not the user's overdue task. The
  // saved rule lets this same Cron continue while every desktop is powered off.
  const finished=await env.DB.prepare("SELECT r.*,t.data FROM reminders r JOIN (SELECT kind,id,data,deleted FROM records UNION ALL SELECT kind,'subscription:'||id AS id,data,deleted FROM subscriptions) t ON t.kind=r.kind AND t.id=r.task_id AND t.deleted=0 WHERE r.active=1 AND r.due_at<=? AND NOT EXISTS (SELECT 1 FROM reminder_deliveries l JOIN devices d ON d.id=l.device_id AND d.revoked_at IS NULL JOIN push_subscriptions p ON p.device_id=d.id AND p.active=1 WHERE l.generation=r.generation AND (l.state='sending' OR l.state='retry' AND l.attempts<3)) AND NOT EXISTS (SELECT 1 FROM push_subscriptions p JOIN devices d ON d.id=p.device_id AND d.revoked_at IS NULL WHERE p.active=1 AND NOT EXISTS (SELECT 1 FROM reminder_deliveries l WHERE l.device_id=p.device_id AND l.generation=r.generation)) LIMIT 40").bind(now).all<{task_id:string;kind:string;generation:string;occurrence_at:number;data:string}>();
  for(const row of finished.results){
    const data=JSON.parse(row.data),task=data as PhoneTask;
    if(row.kind==="tasks"&&!task.recurrence)continue;
    const next=row.kind==="subscriptions"?subscriptionReminder(data as Subscription,now):task.recurrence&&!task.completed?nextOccurrence(task.recurrence,Math.max(now,row.occurrence_at??0)):null;
    const occurrence=next?("paymentAt" in next?next.paymentAt:next.at):0;
    await env.DB.prepare("UPDATE reminders SET due_at=?,occurrence_at=?,generation=?,active=? WHERE task_id=? AND generation=? AND active=1").bind(next?.at??0,occurrence,row.task_id+":occ:"+occurrence,Number(!!next),row.task_id,row.generation).run();
  }
  await env.DB.batch([env.DB.prepare("DELETE FROM rate_limits WHERE reset_at<?").bind(now-3600000),env.DB.prepare("DELETE FROM pairing_codes WHERE expires_at<?").bind(now-86400000),env.DB.prepare("UPDATE remote_commands SET state='expired' WHERE state IN ('pending','claimed') AND expires_at<?").bind(now)]);
}
