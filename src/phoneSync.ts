import { scrubSync } from "../shared/privacy";
import { productMetadata } from "../shared/productivity";
import { loadProjectSnapshot,saveProjects } from "./projectStore";
import { validProject,type PhoneProject } from "../shared/phone";
import { loadSubscriptions, saveSubscriptions } from "./subscriptionStore";
import { type Subscription } from "../shared/subscriptions";
import { loadTasks, saveTasks, taskDueAt, localDateKey, type Task } from "./taskStore";
import { loadNotes, saveNotes } from "./notesStore";
import { loadWorkspaces } from "./workHubStore";
import { phoneRequest } from "./phoneClient";
import { validCloudRecord, validMutation, validNote, validTask, type CloudRecord, type Kind, type Mutation, type PhoneTask, type PhoneNote } from "../shared/phone";
export const PHONE_SYNC_KEY = "ack-deck.phone-sync.v1";
export type SyncState = {syncSchema?:2|3;cursor:number;base:Record<string,{version:number;local:string|null}>;queue:Mutation[];conflicts:{local:Mutation;server:CloudRecord|null}[];lastSync:number;workspaceFingerprint?:string};
const key = (kind:Kind,id:string) => `${kind}:${id}`;
export function readPhoneSync():SyncState {
  const raw=window.localStorage.getItem(PHONE_SYNC_KEY);
  if(raw===null)return{syncSchema:3,cursor:0,base:{},queue:[],conflicts:[],lastSync:0};
  const value=JSON.parse(raw) as SyncState;
  if((value.syncSchema!==undefined&&value.syncSchema!==2&&value.syncSchema!==3)||!Number.isSafeInteger(value.cursor)||value.cursor<0||!value.base||typeof value.base!=="object"||!Array.isArray(value.queue)||!value.queue.every(validMutation)||!Array.isArray(value.conflicts)||!Number.isFinite(value.lastSync))throw new Error("Telefon eşitleme kaydı okunamadı. Mevcut veriler korunuyor.");
  if(Array.isArray(value.base)||!Object.entries(value.base).every(([reference,row])=>/^(tasks|notes|subscriptions|projects):[a-zA-Z0-9_.-]{1,128}$/.test(reference)&&row&&Number.isSafeInteger(row.version)&&row.version>=0&&(row.local===null||typeof row.local==="string"))||!value.conflicts.every(row=>row&&validMutation(row.local)&&(row.server===null||validCloudRecord(row.server))))throw new Error("Telefon eşitleme kaydı okunamadı. Mevcut veriler korunuyor.");
  if(value.syncSchema!==3){value.cursor=0;value.syncSchema=3;}
  return value;
}
function save(state:SyncState){window.localStorage.setItem(PHONE_SYNC_KEY,JSON.stringify(state));}
export function phoneTask(task:Task):PhoneTask{return{...productMetadata(task),text:task.text,completed:task.completed,dueDate:task.dueDate??null,dueTime:task.dueTime??null,priority:task.priority??"normal",reminder:task.reminder??false,dueAt:taskDueAt(task),timezone:task.recurrence?.timezone??task.timezone??Intl.DateTimeFormat().resolvedOptions().timeZone,...(task.recurrence!==undefined?{recurrence:task.recurrence,occurrenceAt:task.occurrenceAt??null,lastCompletedAt:task.lastCompletedAt??null,snoozedUntil:task.snoozedUntil??null}:{})};}
function localTask(record:CloudRecord):Task {
  const data=record.data as PhoneTask;let date=data.dueDate,time=data.dueTime;
  if(data.dueAt!==null&&!data.recurrence){const local=new Date(data.dueAt);date=localDateKey(local);time=`${String(local.getHours()).padStart(2,"0")}:${String(local.getMinutes()).padStart(2,"0")}`;}
  return{...productMetadata(data),id:record.id,text:data.text,completed:data.completed,dueDate:date,dueTime:time,priority:data.priority,reminder:data.reminder,timezone:data.recurrence?data.timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,...(data.recurrence!==undefined?{recurrence:data.recurrence,occurrenceAt:data.occurrenceAt??null,lastCompletedAt:data.lastCompletedAt??null,snoozedUntil:data.snoozedUntil??null}:{})};
}
function snapshot():Map<string, {kind:Kind;id:string;data:PhoneTask|PhoneNote|Subscription|PhoneProject}> {
  const tasks=loadTasks(),notes=loadNotes(),subscriptions=loadSubscriptions(),projects=loadProjectSnapshot();if(tasks.locked||notes.error||subscriptions.locked||projects.locked)throw new Error("Görev veya not kayıtları okunamadı; eşitleme durduruldu.");
  const safeText=(s:string)=>/[A-Za-z]:[\\/]|\\\\/.test(s)?"":s;
  return new Map([...projects.entries.map(p=>({kind:"projects" as const,id:p.id,data:{name:safeText(p.name)||"Proje",description:safeText(p.description),nextStep:safeText(p.nextStep??""),workspaceId:p.workspaceId??null,inboxIds:p.inboxIds??[]}})),...tasks.entries.map(task=>({kind:"tasks" as const,id:task.id,data:phoneTask(task)})),...subscriptions.entries.map(data=>({kind:"subscriptions" as const,id:data.id,data})),...notes.notes.map(note=>({kind:"notes" as const,id:note.id,data:{...productMetadata(note),...(note.attachments?{attachments:note.attachments}:{}),title:note.title,content:note.content,updatedAt:note.updatedAt}}))].map(item=>[key(item.kind,item.id),{...item,data:scrubSync(item.data)}]));
}
function fingerprint(record:CloudRecord){return record.deleted?null:JSON.stringify(record.kind==="tasks"?phoneTask(localTask(record)):record.data);}
function replaceRecord<T extends {id:string}>(entries:T[],id:string,next:T|null):T[]{
  if(!next)return entries.filter(item=>item.id!==id);
  return entries.some(item=>item.id===id)?entries.map(item=>item.id===id?next:item):[...entries,next];
}
function apply(record:CloudRecord) {
  if(record.kind==="projects"){
    if(!record.deleted&&!validProject(record.data))throw new Error("Bulut projesi geçersiz.");
    const loaded=loadProjectSnapshot(),previous=loaded.entries.find(p=>p.id===record.id),data=record.data as PhoneProject;
    const localOnly=previous?Object.fromEntries(["name","description","nextStep"].filter(key=>/[A-Za-z]:[\\/]|\\\\/.test(String(previous[key as keyof typeof previous]??""))).map(key=>[key,previous[key as keyof typeof previous]])):{};
    const next=record.deleted?null:{...previous,id:record.id,folderPath:previous?.folderPath??"",...data,...localOnly};
    if(!saveProjects(replaceRecord(loaded.entries,record.id,next),loaded))throw new Error("Proje eşitlenemedi.");
  }else if(record.kind==="tasks"){
    if(!record.deleted&&!validTask(record.data))throw new Error("Bulut görevi geçersiz. Yerel kayıtlar korunuyor.");
    const loaded=loadTasks(),existing=loaded.entries.find(t=>t.id===record.id);
    const next=record.deleted?null:{...localTask(record),...(existing?.remindedFor?{remindedFor:existing.remindedFor}:{})};
    if(!saveTasks(replaceRecord(loaded.entries,record.id,next),loaded))throw new Error("Bulut görevi kaydedilemedi. Yerel kayıtlar korunuyor.");
  }else if(record.kind==="subscriptions"){
    const loaded=loadSubscriptions();
    if(!saveSubscriptions(replaceRecord(loaded.entries,record.id,record.deleted?null:record.data as Subscription),loaded))throw new Error("Abonelik eşitlenemedi. Kayıtlar korunuyor.");
  }else{
    if(!record.deleted&&!validNote(record.data))throw new Error("Bulut notu geçersiz. Yerel kayıtlar korunuyor.");
    const loaded=loadNotes(),localAttachments=loaded.notes.find(n=>n.id===record.id)?.attachments,cloudAttachments=(record.data as PhoneNote|null)?.attachments;
    const attachments=cloudAttachments===undefined?localAttachments:[...cloudAttachments,...(localAttachments??[]).filter(a=>!cloudAttachments.some(b=>b.id===a.id))].slice(0,20);
    const next=record.deleted?null:{id:record.id,...record.data as PhoneNote,...(attachments?{attachments}:{})};
    if(loaded.error||!saveNotes(replaceRecord(loaded.notes,record.id,next)))throw new Error("Bulut notu kaydedilemedi. Yerel kayıtlar korunuyor.");
  }
}
let running:Promise<SyncState>|null=null;
let paused=false, epoch=0;
export function pausePhoneSync(value:boolean){paused=value;epoch++;}
export function phoneSyncPaused(){return paused;}
export function synchronizePhone(request=phoneRequest):Promise<SyncState> {
  if(running)return running;
  running=sync(request).finally(()=>{running=null;});return running;
}
async function sync(request:typeof phoneRequest):Promise<SyncState> {
  const initialEpoch=epoch;
  const guard=()=>{if(paused||epoch!==initialEpoch||window.localStorage.getItem("ack-deck.restore-journal.v1")!==null||window.localStorage.getItem("ack-deck.phone-restore-review.v1")!==null)throw new Error("Telefon eşitlemesi güvenli biçimde duraklatıldı.");};
  guard();
  let state=readPhoneSync();state.queue=state.queue.map(row=>({...row,data:scrubSync(row.data)}));const local=snapshot();
  const pending=new Set([...state.queue.map(row=>key(row.kind,row.id)),...state.conflicts.map(row=>key(row.local.kind,row.local.id))]);
  for(const [reference,item] of local){if(pending.has(reference))continue;const baseline=state.base[reference];if(JSON.stringify(item.data)!==baseline?.local)state.queue.push({mutationId:crypto.randomUUID(),kind:item.kind,id:item.id,baseVersion:baseline?.version??0,data:item.data,deleted:false});}
  for(const [reference,baseline] of Object.entries(state.base)){if(local.has(reference)||pending.has(reference)||baseline.local===null)continue;const colon=reference.indexOf(":");state.queue.push({mutationId:crypto.randomUUID(),kind:reference.slice(0,colon) as Kind,id:reference.slice(colon+1),baseVersion:baseline.version,data:null,deleted:true});}
  if(!state.queue.every(validMutation))throw new Error("Bazı kayıtlar telefon eşitlemesine uygun değil. Yerel veriler korunuyor; metin uzunluklarını kontrol edin.");
  save(state);
  for(let count=0;state.queue.length&&count<40;count++){
    guard();const mutation=state.queue[0],response=await request<{conflict?:boolean;record:CloudRecord|null}>("mutate",mutation);guard();
    if(response.record!==null&&!validCloudRecord(response.record))throw new Error("Telefon eşitleme yanıtı geçersiz.");
    if(response.conflict){state.conflicts.push({local:mutation,server:response.record});state.queue.shift();save(state);continue;}
    if(!response.record)throw new Error("Telefon eşitleme yanıtı geçersiz.");
    state.base[key(mutation.kind,mutation.id)]={version:response.record.version,local:mutation.deleted?null:JSON.stringify(mutation.data)};
    state.queue.shift();save(state);
  }
  let more=true,pages=0;
  while(more&&pages++<10){
    guard();const response=await request<{records:CloudRecord[];cursor:number;more:boolean}>("sync",{cursor:state.cursor});guard();
    if(!Array.isArray(response.records)||response.records.length>40||!Number.isSafeInteger(response.cursor)||response.cursor<state.cursor||typeof response.more!=="boolean")throw new Error("Telefon eşitleme yanıtı geçersiz.");
    for(const record of response.records){
      if(!validCloudRecord(record))throw new Error("Telefon eşitleme yanıtı geçersiz.");
      const reference=key(record.kind,record.id),previous=state.base[reference],current=snapshot().get(reference),currentText=current?JSON.stringify(current.data):null;
      const conflict=state.conflicts.find(row=>key(row.local.kind,row.local.id)===reference);
      if(conflict){conflict.server=record;save(state);continue;}
      if(state.queue.some(row=>key(row.kind,row.id)===reference))continue;
      if(previous&&record.version<=previous.version)continue;
      if((previous&&currentText!==previous.local)||(!previous&&current)){
        state.conflicts.push({local:{mutationId:crypto.randomUUID(),kind:record.kind,id:record.id,baseVersion:previous?.version??0,data:current?.data??null,deleted:!current},server:record});save(state);continue;
      }
      // Journal the prior fingerprint before applying; interrupted writes are detected as
      // conflicts on retry instead of silently overwriting an intervening local edit.
      apply(record);state.base[reference]={version:record.version,local:fingerprint(record)};save(state);
    }
    state.cursor=response.cursor;more=response.more;save(state);
  }
  guard();const spaces=loadWorkspaces();
  if(!spaces.locked){const workspaces=spaces.entries.map(({id,name,icon,description})=>({id,name,icon,description:/[A-Za-z]:[\\/]/.test(description)?"":description}));const signature=JSON.stringify(workspaces);if(signature!==state.workspaceFingerprint){await request("workspaces",{workspaces:scrubSync(workspaces)});guard();state.workspaceFingerprint=signature;save(state);}}
  await request("heartbeat");guard();state.lastSync=Date.now();save(state);window.dispatchEvent(new Event("ack-phone-sync-status"));return state;
}
export async function resolvePhoneConflict(index:number,useCloud:boolean){if(running)throw new Error("Eşitleme sürüyor. Biraz sonra deneyin.");const state=readPhoneSync(),conflict=state.conflicts[index];if(!conflict)throw new Error("Çakışma bulunamadı.");const reference=key(conflict.local.kind,conflict.local.id);
  if(useCloud&&conflict.server){apply(conflict.server);state.base[reference]={version:conflict.server.version,local:fingerprint(conflict.server)};}
  else if(!useCloud){const current=snapshot().get(reference);state.queue.push({...conflict.local,data:current?.data??null,deleted:!current,mutationId:crypto.randomUUID(),baseVersion:conflict.server?.version??0});}
  state.conflicts.splice(index,1);save(state);
}
