export type Recurrence = { frequency: "daily" | "weekly" | "monthly"; interval: number; weekdays: number[]; dayOfMonth: number; start: string; time: string; timezone: string; endDate: string | null; count: number | null };
const DAY = 86400000;
export function validDate(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value; }
export function validRecurrence(value: unknown): value is Recurrence {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Recurrence;
  if (Object.keys(r).sort().join() !== ["frequency","interval","weekdays","dayOfMonth","start","time","timezone","endDate","count"].sort().join()) return false;
  try { new Intl.DateTimeFormat("en", {timeZone:r.timezone}); } catch { return false; }
  return ["daily","weekly","monthly"].includes(r.frequency) && Number.isInteger(r.interval) && r.interval >= 1 && r.interval <= (r.frequency==="daily"?3650:365) && Array.isArray(r.weekdays) && r.weekdays.length <= 7 && new Set(r.weekdays).size === r.weekdays.length && r.weekdays.every(d=>Number.isInteger(d)&&d>=0&&d<=6) && (r.frequency!=="weekly" || r.weekdays.length>0) && Number.isInteger(r.dayOfMonth) && r.dayOfMonth>=1 && r.dayOfMonth<=31 && validDate(r.start) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(r.time) && typeof r.timezone === "string" && (r.endDate===null || validDate(r.endDate)&&r.endDate>=r.start) && (r.count===null || Number.isInteger(r.count)&&r.count>=1&&r.count<=100000);
}
export function zonedParts(at:number, timezone:string) {
  const parts = new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(at);
  const p = Object.fromEntries(parts.map(v=>[v.type,v.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};
}
// Calendar arithmetic uses the rule's zone, never the host/Worker zone. On a DST
// gap the wall time moves forward by the gap; an ambiguous time uses the first
// deterministic matching instant. The rule itself retains the original time.
export function zonedAt(date:string,time:string,timezone:string):number {
  const wall = Date.parse(`${date}T${time}:00Z`); let candidate=wall; const seen:number[]=[];
  for(let i=0;i<5;i++) { const p=zonedParts(candidate,timezone), actual=Date.parse(`${p.date}T${p.time}:00Z`), delta=wall-actual; if(!delta)return candidate; seen.push(candidate); candidate+=delta; if(seen.includes(candidate))return Math.max(candidate,...seen); }
  return candidate;
}
export type Occurrence = { date:string; at:number; index:number };
export function nextOccurrence(r:Recurrence,after:number):Occurrence|null {
  if(!validRecurrence(r)||!Number.isFinite(after))return null;
  const anchor=Date.parse(r.start), anchorDay=new Date(anchor).getUTCDay(), monday=anchor-((anchorDay+6)%7)*DAY;
  const localAfter=Date.parse(zonedParts(Math.max(after,anchor-2*DAY),r.timezone).date);
  const startMonth=new Date(anchor).getUTCFullYear()*12+new Date(anchor).getUTCMonth();
  const firstWeek=r.weekdays.filter(d=>((d+6)%7)>=((anchorDay+6)%7)).length;
  for(let day=Math.max(anchor,localAfter);day<=anchor+DAY*366*200;day+=DAY) {
    const d=new Date(day), date=d.toISOString().slice(0,10); if(r.endDate&&date>r.endDate)return null;
    let index=0;
    if(r.frequency==="daily") { const offset=Math.round((day-anchor)/DAY); if(offset%r.interval)continue; index=offset/r.interval+1; }
    else if(r.frequency==="weekly") { const week=Math.floor((day-monday)/(7*DAY)); if(week%r.interval||!r.weekdays.includes(d.getUTCDay()))continue; const pos=(d.getUTCDay()+6)%7; const before=r.weekdays.filter(v=>(v+6)%7<=pos && (week!==0||(v+6)%7>=(anchorDay+6)%7)).length; index=week===0?before:firstWeek+(week/r.interval-1)*r.weekdays.length+before; }
    else { const month=d.getUTCFullYear()*12+d.getUTCMonth()-startMonth; if(month%r.interval)continue; const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate(); if(d.getUTCDate()!==Math.min(r.dayOfMonth,last))continue; const anchorMatches=Math.min(r.dayOfMonth,new Date(Date.UTC(new Date(anchor).getUTCFullYear(),new Date(anchor).getUTCMonth()+1,0)).getUTCDate())>=new Date(anchor).getUTCDate(); index=month/r.interval+(anchorMatches?1:0); }
    if(r.count!==null&&index>r.count)return null;
    const at=zonedAt(date,r.time,r.timezone); if(at>after)return {date,at,index};
  }
  return null;
}
export function recurrenceLabel(r:Recurrence|null|undefined):string {
  if(!r)return "Tek sefer";
  if(r.frequency==="daily")return r.interval===1?"Her gün":`Her ${r.interval} günde bir`;
  if(r.frequency==="monthly")return r.interval===1?`Her ayın ${r.dayOfMonth}'i`:`Her ${r.interval} ayda bir`;
  const names=["Paz","Pzt","Sal","Çar","Per","Cum","Cmt"];
  const days=[...r.weekdays].sort((a,b)=>(a+6)%7-(b+6)%7).map(d=>names[d]).join(" · ");
  return r.interval===1?days:`Her ${r.interval} haftada · ${days}`;
}
export type RecurringFields = { completed:boolean; dueDate?:string|null; dueTime?:string|null; dueAt?:number|null; recurrence?:Recurrence|null; occurrenceAt?:number|null; lastCompletedAt?:number|null; snoozedUntil?:number|null; remindedFor?:string|null };
export function completeOccurrence<T extends RecurringFields>(task:T,now=Date.now()):T {
  if(!task.recurrence)return {...task,completed:!task.completed};
  const current=task.occurrenceAt ?? task.dueAt ?? zonedAt(task.dueDate!,task.dueTime!,task.recurrence.timezone);
  const next=nextOccurrence(task.recurrence,Math.max(now,current));
  return {...task,completed:!next,lastCompletedAt:current,occurrenceAt:next?.at??current,dueDate:next?.date??task.dueDate,dueTime:task.recurrence.time,dueAt:next?.at??task.dueAt,snoozedUntil:null,...("remindedFor" in task?{remindedFor:null}:{})};
}
