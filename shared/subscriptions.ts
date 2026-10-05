import { nextOccurrence, validDate, zonedAt, type Recurrence } from "./recurrence";
export type Subscription = { id:string; name:string; category:string; amount:number; currency:"TRY"|"USD"|"EUR"|"GBP"; cycle:"monthly"|"yearly"|"weekly"|"custom"; periodDays:number; nextPayment:string; autoRenew:boolean; status:"active"|"paused"|"cancelled"; website:string; note:string; icon:string; reminderDays:number|null; timezone:string; createdAt:number; updatedAt:number };
export const subscriptionFields=["id","name","category","amount","currency","cycle","periodDays","nextPayment","autoRenew","status","website","note","icon","reminderDays","timezone","createdAt","updatedAt"];
export function validSubscription(value:unknown):value is Subscription {
  if(!value||typeof value!=="object"||Array.isArray(value))return false; const s=value as Subscription;
  if(Object.keys(s).sort().join()!==[...subscriptionFields].sort().join())return false;
  const text=(v:unknown,max:number)=>typeof v==="string"&&v.length<=max&&!/AIza[\w-]{20,}/.test(v);
  try {new Intl.DateTimeFormat("tr",{timeZone:s.timezone});if(s.website){const u=new URL(s.website);if(!["http:","https:"].includes(u.protocol)||u.username||u.password)return false;}}catch{return false;}
  return typeof s.id==="string"&&/^[\w.-]{1,128}$/.test(s.id)&&text(s.name,160)&&!!s.name.trim()&&text(s.category,80)&&Number.isFinite(s.amount)&&s.amount>=0&&s.amount<=1e9&&["TRY","USD","EUR","GBP"].includes(s.currency)&&["monthly","yearly","weekly","custom"].includes(s.cycle)&&Number.isInteger(s.periodDays)&&s.periodDays>=1&&s.periodDays<=3650&&validDate(s.nextPayment)&&typeof s.autoRenew==="boolean"&&["active","paused","cancelled"].includes(s.status)&&text(s.website,4096)&&text(s.note,2000)&&text(s.icon,16)&&text(s.timezone,100)&&(s.reminderDays===null||Number.isInteger(s.reminderDays)&&s.reminderDays>=0&&s.reminderDays<=365)&&[s.createdAt,s.updatedAt].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=8.64e15);
}
export function subscriptionRule(s:Subscription):Recurrence {return {frequency:s.cycle==="weekly"||s.cycle==="custom"?"daily":"monthly",interval:s.cycle==="yearly"?12:s.cycle==="weekly"?7:s.cycle==="custom"?s.periodDays:1,weekdays:[],dayOfMonth:Number(s.nextPayment.slice(8)),start:s.nextPayment,time:"09:00",timezone:s.timezone,endDate:null,count:null};}
export function paymentOccurrence(s:Subscription,after=Date.now()-1) {return s.autoRenew?nextOccurrence(subscriptionRule(s),after):(()=>{const at=zonedAt(s.nextPayment,"09:00",s.timezone);return at>after?{date:s.nextPayment,at,index:1}:null;})();}
export function subscriptionReminder(s:Subscription,after=Date.now()-1) {
  if(s.status!=="active"||s.reminderDays===null)return null;
  // Search from the payment date's reminder offset, then derive calendar days
  // in the saved zone so daylight saving does not shift the reminder hour.
  let payment=paymentOccurrence(s,after+s.reminderDays*86400000-2*86400000);
  for(let i=0;payment&&i<4;i++) {const date=new Date(Date.parse(payment.date)-s.reminderDays*86400000).toISOString().slice(0,10);const at=zonedAt(date,"09:00",s.timezone);if(at>after)return {at,paymentAt:payment.at};payment=paymentOccurrence(s,payment.at);}
  return null;
}
export function monthlyTotals(entries:Subscription[]):[string,number][] {
  const totals=new Map<string,number>();for(const s of entries.filter(v=>v.status==="active")){const value=s.amount*(s.cycle==="yearly"?1/12:s.cycle==="weekly"?365.2425/7/12:s.cycle==="custom"?365.2425/s.periodDays/12:1);totals.set(s.currency,(totals.get(s.currency)??0)+value);}return [...totals].sort(([a],[b])=>a.localeCompare(b));
}
export const money=(amount:number,currency:string)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency,maximumFractionDigits:2}).format(amount);
export const cycleLabel=(s:Subscription)=>s.cycle==="monthly"?"ay":s.cycle==="yearly"?"yıl":s.cycle==="weekly"?"hafta":`${s.periodDays} gün`;
export const paymentLabel=(s:Subscription)=>new Date((paymentOccurrence(s)?.date??s.nextPayment)+"T12:00:00").toLocaleDateString("tr-TR",{day:"numeric",month:"long"});
