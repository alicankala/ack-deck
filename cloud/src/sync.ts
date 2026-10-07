import { subscriptionReminder, type Subscription } from "../../shared/subscriptions";
import type { PhoneTask } from "../../shared/phone";
import { validMutation, type Mutation } from "../../shared/phone";
import { ApiError, hash } from "./security";
import { recordView, type Env, type Actor, type RecordRow } from "./types";
export async function mutate(env: Env, actor: Actor, input: unknown, schema = "3") {
  if (!validMutation(input)) throw new ApiError(400, "Kayıt bilgileri geçersiz.");
  if(input.kind==="subscriptions"&&!input.deleted&&(input.data as Subscription).id!==input.id)throw new ApiError(400,"Abonelik kimliği geçersiz.");
  const mutation: Mutation = {...input}, requestHash = await hash(JSON.stringify(input));
  const prior = await env.DB.prepare("SELECT actor,request_hash,response FROM mutations WHERE id=?").bind(mutation.mutationId).first<{actor:string;request_hash:string;response:string}>();
  if (prior) { if (prior.actor !== actor.id || prior.request_hash !== requestHash) throw new ApiError(409, "İstek kimliği daha önce kullanılmış."); return JSON.parse(prior.response); }
  if(mutation.kind==="tasks"&&!mutation.deleted&&mutation.data&&!("recurrence" in mutation.data)&&mutation.baseVersion>0){
    const current=await env.DB.prepare("SELECT * FROM records WHERE kind='tasks' AND id=?").bind(mutation.id).first<RecordRow>();
    if(current?.data&&JSON.parse(current.data).recurrence)return {conflict:true,record:recordView(current)};
  }
  if(schema!=="3"&&!mutation.deleted&&["tasks","notes"].includes(mutation.kind)){const current=await env.DB.prepare("SELECT * FROM records WHERE kind=? AND id=?").bind(mutation.kind,mutation.id).first<RecordRow>();if(current?.data){const stored=JSON.parse(current.data),metadata=Object.fromEntries(Object.entries(stored).filter(([key])=>["projectId","workspaceId","sourceInboxId","checklist","reminderLeadMinutes","attachments"].includes(key)));mutation.data={...mutation.data!,...metadata};}}
  const now = Date.now(), version = mutation.baseVersion + 1, data = mutation.data ? JSON.stringify(mutation.data) : null;
  const table=mutation.kind==="subscriptions"?"subscriptions":mutation.kind==="projects"?"projects":"records";
  const write = mutation.baseVersion === 0
    ? env.DB.prepare(`INSERT INTO ${table}(kind,id,version,data,deleted,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(kind,id) DO NOTHING`).bind(mutation.kind,mutation.id,version,data,Number(mutation.deleted),now)
    : env.DB.prepare(`UPDATE ${table} SET version=?,data=?,deleted=?,updated_at=? WHERE kind=? AND id=? AND version=?`).bind(version,data,Number(mutation.deleted),now,mutation.kind,mutation.id,mutation.baseVersion);
  // A guarded batch gives optimistic concurrency. No last-write-wins content loss.
  const change = env.DB.prepare("INSERT INTO changes(kind,record_id,version) SELECT ?,?,? WHERE changes()=1").bind(mutation.kind,mutation.id,version);
  const statements = [write, change];
  if (mutation.kind === "tasks" || mutation.kind === "subscriptions") {
    const task=mutation.kind==="tasks"?mutation.data as PhoneTask|null:null;
    const subscription=mutation.kind==="subscriptions"?mutation.data as Subscription|null:null;
    const payment=subscription?subscriptionReminder(subscription):null;
    const active=!mutation.deleted&&(task?!!task.reminder&&!task.completed:!!payment);
    const occurrence=task?.occurrenceAt??task?.dueAt??payment?.paymentAt??0;
    const reminderId=mutation.kind==="subscriptions"?"subscription:"+mutation.id:mutation.id;
    const generation=task?.recurrence?mutation.id+":occ:"+occurrence+(task.snoozedUntil?":snooze:"+task.snoozedUntil:""):subscription?reminderId+":occ:"+occurrence:mutation.id+":"+version;
    statements.push(env.DB.prepare("INSERT INTO reminders(task_id,generation,due_at,timezone,active,kind,occurrence_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1 ON CONFLICT(task_id) DO UPDATE SET generation=excluded.generation,due_at=excluded.due_at,timezone=excluded.timezone,active=excluded.active,kind=excluded.kind,occurrence_at=excluded.occurrence_at").bind(reminderId,generation,task?.snoozedUntil??(task?.dueAt!=null?task.dueAt-(task.reminderLeadMinutes??0)*60000:payment?.at??0),task?.timezone??subscription?.timezone??"UTC",Number(active),mutation.kind,occurrence));
  }
  const response = { record: { kind: mutation.kind, id: mutation.id, version, data: mutation.data, deleted: mutation.deleted, updatedAt: now } };
  statements.push(env.DB.prepare("INSERT INTO mutations(id,actor,request_hash,response,created_at) SELECT ?,?,?,?,? WHERE changes()=1").bind(mutation.mutationId,actor.id,requestHash,JSON.stringify(response),now));
  const results = await env.DB.batch(statements);
  if (!results[0].meta.changes) {
    const retry = await env.DB.prepare("SELECT actor,request_hash,response FROM mutations WHERE id=?").bind(mutation.mutationId).first<{actor:string;request_hash:string;response:string}>();
    if (retry?.actor === actor.id && retry.request_hash === requestHash) return JSON.parse(retry.response);
    const current = await env.DB.prepare(`SELECT * FROM ${table} WHERE kind=? AND id=?`).bind(mutation.kind,mutation.id).first<RecordRow>();
    return { conflict: true, record: current ? recordView(current) : null };
  }
  return response;
}
