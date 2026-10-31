import { loadPrayerConfig, type PrayerLogDay } from "../shared/prayerTimes";
import { loadPrayerLogs, savePrayerLogs } from "./prayerStore";
import { loadMedia, saveMedia } from "./mediaStore";
import { type MediaItem } from "../shared/media";
import {
  loadStudyAttendanceSnapshot,
  groupStudyAttendanceByDay,
  applyStudyAttendanceDay,
  canonicalAttendanceDay,
  type StudyAttendanceDay,
} from "../shared/studyAttendance";
import { loadStudyPrograms, saveStudyPrograms } from "./studyProgramStore";
import { loadStudyReminders } from "./studyReminderStore";
import { tryMergeNoteRecords } from "../shared/textMerge";
import { type StudyProgram } from "../shared/studyPrograms";
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
export type SyncState = {syncSchema?:2|3|4|5;cursor:number;base:Record<string,{version:number;local:string|null}>;queue:Mutation[];conflicts:{local:Mutation;server:CloudRecord|null}[];lastSync:number;workspaceFingerprint?:string};
const key = (kind:Kind,id:string) => `${kind}:${id}`;
export function readPhoneSync():SyncState {
  const raw=window.localStorage.getItem(PHONE_SYNC_KEY);
  if(raw===null)return{syncSchema:5,cursor:0,base:{},queue:[],conflicts:[],lastSync:0};
  const value=JSON.parse(raw) as SyncState;
  if((value.syncSchema!==undefined&&![2,3,4,5].includes(value.syncSchema))||!Number.isSafeInteger(value.cursor)||value.cursor<0||!value.base||typeof value.base!=="object"||!Array.isArray(value.queue)||!value.queue.every(validMutation)||!Array.isArray(value.conflicts)||!Number.isFinite(value.lastSync))throw new Error("Telefon eşitleme kaydı okunamadı. Mevcut veriler korunuyor.");
  if(Array.isArray(value.base)||!Object.entries(value.base).every(([reference,row])=>/^(tasks|notes|subscriptions|projects|studyPrograms|prayerLogs|mediaItems|studyAttendance):[a-zA-Z0-9_.-]{1,128}$/.test(reference)&&row&&Number.isSafeInteger(row.version)&&row.version>=0&&(row.local===null||typeof row.local==="string"))||!value.conflicts.every(row=>row&&validMutation(row.local)&&(row.server===null||validCloudRecord(row.server))))throw new Error("Telefon eşitleme kaydı okunamadı. Mevcut veriler korunuyor.");
  if(value.syncSchema!==5){value.cursor=0;value.syncSchema=5;}
  return value;
}
function save(state:SyncState){window.localStorage.setItem(PHONE_SYNC_KEY,JSON.stringify(state));}
export function phoneTask(task:Task):PhoneTask{return{...productMetadata(task),text:task.text,completed:task.completed,dueDate:task.dueDate??null,dueTime:task.dueTime??null,priority:task.priority??"normal",reminder:task.reminder??false,dueAt:taskDueAt(task),timezone:task.recurrence?.timezone??task.timezone??Intl.DateTimeFormat().resolvedOptions().timeZone,...(task.recurrence!==undefined?{recurrence:task.recurrence,occurrenceAt:task.occurrenceAt??null,lastCompletedAt:task.lastCompletedAt??null,snoozedUntil:task.snoozedUntil??null}:{})};}
function localTask(record:CloudRecord):Task {
  const data=record.data as PhoneTask;let date=data.dueDate,time=data.dueTime;
  if(data.dueAt!==null&&!data.recurrence){const local=new Date(data.dueAt);date=localDateKey(local);time=`${String(local.getHours()).padStart(2,"0")}:${String(local.getMinutes()).padStart(2,"0")}`;}
  return{...productMetadata(data),id:record.id,text:data.text,completed:data.completed,dueDate:date,dueTime:time,priority:data.priority,reminder:data.reminder,timezone:data.recurrence?data.timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,...(data.recurrence!==undefined?{recurrence:data.recurrence,occurrenceAt:data.occurrenceAt??null,lastCompletedAt:data.lastCompletedAt??null,snoozedUntil:data.snoozedUntil??null}:{})};
}
function snapshot():Map<string, {kind:Kind;id:string;data:PhoneTask|PhoneNote|Subscription|PhoneProject|StudyProgram|PrayerLogDay|MediaItem|StudyAttendanceDay}> {
  const tasks=loadTasks(),notes=loadNotes(),subscriptions=loadSubscriptions(),projects=loadProjectSnapshot(),programs=loadStudyPrograms(),prayerLogs=loadPrayerLogs(),media=loadMedia(),attendance=loadStudyAttendanceSnapshot();if(media.locked||attendance.locked||prayerLogs.locked||programs.locked||tasks.locked||notes.error||subscriptions.locked||projects.locked)throw new Error("Görev veya not kayıtları okunamadı; eşitleme durduruldu.");
  const safeText=(s:string)=>/(?:\b[A-Za-z]:[\\/]|\\\\)/.test(s)?"":s;
  const attendanceDays=groupStudyAttendanceByDay(attendance.map);
  return new Map([...media.entries.map(data=>({kind:"mediaItems" as const,id:data.id,data})),...attendanceDays.map(data=>({kind:"studyAttendance" as const,id:data.id,data})),...prayerLogs.entries.map(data=>({kind:"prayerLogs" as const,id:data.id,data})),...programs.entries.map(data=>({kind:"studyPrograms" as const,id:data.id,data})),...projects.entries.map(p=>({kind:"projects" as const,id:p.id,data:{name:safeText(p.name)||"Proje",description:safeText(p.description),nextStep:safeText(p.nextStep??""),workspaceId:p.workspaceId??null,inboxIds:p.inboxIds??[]}})),...tasks.entries.map(task=>({kind:"tasks" as const,id:task.id,data:phoneTask(task)})),...subscriptions.entries.map(data=>({kind:"subscriptions" as const,id:data.id,data})),...notes.notes.map(note=>({kind:"notes" as const,id:note.id,data:{...productMetadata(note),...(note.attachments?{attachments:note.attachments}:{}),title:note.title,content:note.content,updatedAt:note.updatedAt}}))].map(item=>[key(item.kind,item.id),{...item,data:scrubSync(item.data)}]));
}
function fingerprint(record:CloudRecord){
  if(record.deleted)return null;
  if(record.kind==="tasks")return JSON.stringify(phoneTask(localTask(record)));
  if(record.kind==="studyAttendance"){const d=record.data as StudyAttendanceDay;return JSON.stringify(canonicalAttendanceDay(d.date,d.entries,d.updatedAt));}
  return JSON.stringify(record.data);
}
function replaceRecord<T extends {id:string}>(entries:T[],id:string,next:T|null):T[]{
  if(!next)return entries.filter(item=>item.id!==id);
  return entries.some(item=>item.id===id)?entries.map(item=>item.id===id?next:item):[...entries,next];
}
function apply(record:CloudRecord) {
  if(record.kind==="mediaItems"){
    const loaded=loadMedia();
    if(!saveMedia(replaceRecord(loaded.entries,record.id,record.deleted?null:record.data as MediaItem),loaded))throw new Error("Koleksiyon kaydı eşitlenemedi; mevcut kayıtlar korunuyor.");
  }else if(record.kind==="studyAttendance"){
    if(!applyStudyAttendanceDay(record.id,record.deleted?null:record.data as StudyAttendanceDay))throw new Error("Ders katılım kaydı eşitlenemedi; mevcut kayıtlar korunuyor.");
  }else if(record.kind==="prayerLogs"){
    const loaded=loadPrayerLogs();
    if(!savePrayerLogs(replaceRecord(loaded.entries,record.id,record.deleted?null:record.data as PrayerLogDay),loaded))throw new Error("Namaz kaydı eşitlenemedi; mevcut kayıtlar korunuyor.");
  }else if(record.kind==="studyPrograms"){
    const loaded=loadStudyPrograms();
    if(!saveStudyPrograms(replaceRecord(loaded.entries,record.id,record.deleted?null:record.data as StudyProgram),loaded))throw new Error("Ders programı eşitlenemedi; mevcut kayıtlar korunuyor.");
  }else if(record.kind==="projects"){
    if(!record.deleted&&!validProject(record.data))throw new Error("Bulut projesi geçersiz.");
    const loaded=loadProjectSnapshot(),previous=loaded.entries.find(p=>p.id===record.id),data=record.data as PhoneProject;
    const localOnly=previous?Object.fromEntries(["name","description","nextStep"].filter(key=>/(?:\b[A-Za-z]:[\\/]|\\\\)/.test(String(previous[key as keyof typeof previous]??""))).map(key=>[key,previous[key as keyof typeof previous]])):{};
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
let paused=false, epoch=0, runningEpoch=-1;
export function pausePhoneSync(value:boolean){paused=value;epoch++;}
export function phoneSyncPaused(){return paused;}
export function isPhoneSyncRunning(){return running!==null;}
export function synchronizePhone(request=phoneRequest):Promise<SyncState> {
  // Reuse only a sync started in the current epoch. A sync from an older epoch is being
  // cancelled by its pause guard; returning it would surface a false "tamamlanamadı" error.
  if(running&&runningEpoch===epoch)return running;
  const previous=running,startEpoch=epoch;
  const next:Promise<SyncState>=(previous?previous.then(()=>undefined,()=>undefined):Promise.resolve()).then(()=>sync(request));
  const clear=()=>{if(running===next)running=null;};
  next.then(clear,clear);
  running=next;runningEpoch=startEpoch;return next;
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
    if(response.conflict){
      const ref=key(mutation.kind,mutation.id),baseline=state.base[ref];
      if(mutation.kind==="notes"&&!mutation.deleted&&mutation.data&&response.record&&!response.record.deleted&&response.record.data&&baseline?.local){
        try{
          const merged=tryMergeNoteRecords(JSON.parse(baseline.local) as PhoneNote,mutation.data as PhoneNote,response.record.data as PhoneNote);
          if(merged){
            const cleanMerged=scrubSync(merged);
            apply({...response.record,data:cleanMerged});
            state.base[ref]={version:response.record.version,local:fingerprint(response.record)};
            state.queue[0]={mutationId:crypto.randomUUID(),kind:"notes",id:mutation.id,baseVersion:response.record.version,data:cleanMerged,deleted:false};
            save(state);continue;
          }
        }catch{}
      }
      state.conflicts.push({local:mutation,server:response.record});state.queue.shift();save(state);continue;
    }
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
        if(record.kind==="notes"&&!record.deleted&&record.data&&previous?.local&&current?.data){
          try{
            const merged=tryMergeNoteRecords(JSON.parse(previous.local) as PhoneNote,current.data as PhoneNote,record.data as PhoneNote);
            if(merged){
              const cleanMerged=scrubSync(merged);
              apply({...record,data:cleanMerged});
              state.base[reference]={version:record.version,local:fingerprint(record)};
              state.queue.push({mutationId:crypto.randomUUID(),kind:"notes",id:record.id,baseVersion:record.version,data:cleanMerged,deleted:false});
              save(state);continue;
            }
          }catch{}
        }
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
  const studyRem=loadStudyReminders();
  await request("heartbeat", { prayerConfig: loadPrayerConfig(), ...(!studyRem.locked ? { studyReminders: studyRem.entries } : {}) });guard();state.lastSync=Date.now();save(state);window.dispatchEvent(new Event("ack-phone-sync-status"));return state;
}
export async function resolvePhoneConflict(index:number,useCloud:boolean){if(running)throw new Error("Eşitleme sürüyor. Biraz sonra deneyin.");const state=readPhoneSync(),conflict=state.conflicts[index];if(!conflict)throw new Error("Çakışma bulunamadı.");const reference=key(conflict.local.kind,conflict.local.id);
  if(useCloud&&conflict.server){apply(conflict.server);state.base[reference]={version:conflict.server.version,local:fingerprint(conflict.server)};}
  else if(!useCloud){const current=snapshot().get(reference);state.queue.push({...conflict.local,data:current?.data??null,deleted:!current,mutationId:crypto.randomUUID(),baseVersion:conflict.server?.version??0});}
  state.conflicts.splice(index,1);save(state);
}
