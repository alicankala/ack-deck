import { nextOccurrence, validDate, zonedAt, zonedParts, type Recurrence } from "./recurrence";
export type Subscription = { id:string; name:string; category:string; amount:number; currency:"TRY"|"USD"|"EUR"|"GBP"; cycle:"monthly"|"yearly"|"weekly"|"custom"; periodDays:number; nextPayment:string; autoRenew:boolean; status:"active"|"paused"|"cancelled"; website:string; note:string; icon:string; reminderDays:number|null; reminderTime?:string; timezone:string; createdAt:number; updatedAt:number };
export const subscriptionFields=["id","name","category","amount","currency","cycle","periodDays","nextPayment","autoRenew","status","website","note","icon","reminderDays","timezone","createdAt","updatedAt"];
export const validReminderTime=(v:unknown):v is string=>typeof v==="string"&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
export const effectiveReminderTime=(s:Pick<Subscription,"reminderTime">)=>validReminderTime(s.reminderTime)?s.reminderTime:"09:00";
export function validSubscription(value:unknown):value is Subscription {
  if(!value||typeof value!=="object"||Array.isArray(value))return false; const s=value as Subscription;
  const keysWithoutOptional=Object.keys(s).filter(k=>k!=="reminderTime").sort().join();
  if(keysWithoutOptional!==[...subscriptionFields].sort().join())return false;
  if(s.reminderTime!==undefined&&!validReminderTime(s.reminderTime))return false;
  const text=(v:unknown,max:number)=>typeof v==="string"&&v.length<=max&&!/AIza[\w-]{20,}/.test(v);
  try {new Intl.DateTimeFormat("tr",{timeZone:s.timezone});if(s.website){const u=new URL(s.website);if(!["http:","https:"].includes(u.protocol)||u.username||u.password)return false;}}catch{return false;}
  return typeof s.id==="string"&&/^[\w.-]{1,128}$/.test(s.id)&&text(s.name,160)&&!!s.name.trim()&&text(s.category,80)&&Number.isFinite(s.amount)&&s.amount>=0&&s.amount<=1e9&&["TRY","USD","EUR","GBP"].includes(s.currency)&&["monthly","yearly","weekly","custom"].includes(s.cycle)&&Number.isInteger(s.periodDays)&&s.periodDays>=1&&s.periodDays<=3650&&validDate(s.nextPayment)&&typeof s.autoRenew==="boolean"&&["active","paused","cancelled"].includes(s.status)&&text(s.website,4096)&&text(s.note,2000)&&text(s.icon,16)&&text(s.timezone,100)&&(s.reminderDays===null||Number.isInteger(s.reminderDays)&&s.reminderDays>=0&&s.reminderDays<=365)&&[s.createdAt,s.updatedAt].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=8.64e15);
}
export function subscriptionRule(s:Subscription):Recurrence {return {frequency:s.cycle==="weekly"||s.cycle==="custom"?"daily":"monthly",interval:s.cycle==="yearly"?12:s.cycle==="weekly"?7:s.cycle==="custom"?s.periodDays:1,weekdays:[],dayOfMonth:Number(s.nextPayment.slice(8)),start:s.nextPayment,time:effectiveReminderTime(s),timezone:s.timezone,endDate:null,count:null};}
export function paymentOccurrence(s:Subscription,after=Date.now()-1) {return s.autoRenew?nextOccurrence(subscriptionRule(s),after):(()=>{const at=zonedAt(s.nextPayment,effectiveReminderTime(s),s.timezone);return at>after?{date:s.nextPayment,at,index:1}:null;})();}
export function subscriptionReminder(s:Subscription,after=Date.now()-1) {
  if(s.status!=="active"||s.reminderDays===null)return null;
  const time=effectiveReminderTime(s);
  // Search from the payment date's reminder offset, then derive calendar days
  // in the saved zone so daylight saving does not shift the reminder hour.
  let payment=paymentOccurrence(s,after+s.reminderDays*86400000-2*86400000);
  for(let i=0;payment&&i<4;i++) {const date=new Date(Date.parse(payment.date)-s.reminderDays*86400000).toISOString().slice(0,10);const at=zonedAt(date,time,s.timezone);if(at>after)return {at,paymentAt:payment.at};payment=paymentOccurrence(s,payment.at);}
  return null;
}
export function monthlyEquivalent(s:Subscription):number {
  return s.amount*(s.cycle==="yearly"?1/12:s.cycle==="weekly"?365.2425/7/12:s.cycle==="custom"?365.2425/s.periodDays/12:1);
}
export function monthlyTotals(entries:Subscription[]):[string,number][] {
  const totals=new Map<string,number>();for(const s of entries.filter(v=>v.status==="active")){totals.set(s.currency,(totals.get(s.currency)??0)+monthlyEquivalent(s));}return [...totals].sort(([a],[b])=>a.localeCompare(b));
}
export function yearlyTotals(entries:Subscription[]):[string,number][] {
  return monthlyTotals(entries).map(([currency,amount])=>[currency,amount*12]);
}
export const money=(amount:number,currency:string)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency,maximumFractionDigits:2}).format(amount);
export const moneyRounded=(amount:number,currency:string)=>new Intl.NumberFormat("tr-TR",{style:"currency",currency,maximumFractionDigits:0}).format(Math.round(amount));
export const cycleLabel=(s:Subscription)=>s.cycle==="monthly"?"ay":s.cycle==="yearly"?"yıl":s.cycle==="weekly"?"hafta":`${s.periodDays} gün`;
export const cycleAdjective=(s:Subscription)=>s.cycle==="monthly"?"Aylık":s.cycle==="yearly"?"Yıllık":s.cycle==="weekly"?"Haftalık":`${s.periodDays} günde bir`;
export const paymentLabel=(s:Subscription,now=Date.now())=>new Date((paymentOccurrence(s,now-1)?.date??s.nextPayment)+"T12:00:00").toLocaleDateString("tr-TR",{day:"numeric",month:"long"});
export const paymentShortLabel=(s:Subscription,now=Date.now())=>new Date((paymentOccurrence(s,now-1)?.date??s.nextPayment)+"T12:00:00").toLocaleDateString("tr-TR",{day:"numeric",month:"short"});

export function daysUntilPayment(s:Subscription,now=Date.now()):number|null {
  if(s.status!=="active")return null;
  const occ=paymentOccurrence(s,now-1);
  if(!occ)return null;
  let today:string;
  try {today=zonedParts(now,s.timezone).date;}catch{today=new Date(now).toISOString().slice(0,10);}
  return Math.max(0,Math.round((Date.parse(occ.date)-Date.parse(today))/86400000));
}

export function paymentCountdownLabel(s:Subscription,now=Date.now()):string|null {
  const days=daysUntilPayment(s,now);
  if(days===null)return null;
  if(days===0)return "Bugün";
  if(days===1)return "Yarın";
  return `${days} gün kaldı`;
}

const SHARE_PALETTE=["#38bdf8","#34d399","#a78bfa","#fbbf24","#f472b6"];

export type SubscriptionShare = {
  id:string;
  name:string;
  compactName:string;
  percent:number;
  exactPercent:number;
  color:string;
  currency:string;
};

function compactServiceName(name:string):string {
  const trimmed=name.trim();
  if(trimmed.length<=10)return trimmed;
  const firstWord=trimmed.split(/\s+/)[0]??trimmed;
  return firstWord.length<=11?firstWord:trimmed.slice(0,10)+"…";
}

export function subscriptionShares(entries:Subscription[],maxSegments=4):SubscriptionShare[] {
  const active=entries.filter(s=>s.status==="active"&&monthlyEquivalent(s)>0);
  if(!active.length)return [];
  const byCurrency=new Map<string,Subscription[]>();
  for(const s of active){
    const list=byCurrency.get(s.currency)??[];
    list.push(s);
    byCurrency.set(s.currency,list);
  }
  const [,primaryGroup]=[...byCurrency.entries()].sort((a,b)=>{
    if(b[1].length!==a[1].length)return b[1].length-a[1].length;
    const sumA=a[1].reduce((acc,x)=>acc+monthlyEquivalent(x),0);
    const sumB=b[1].reduce((acc,x)=>acc+monthlyEquivalent(x),0);
    return sumB-sumA;
  })[0]!;
  const currency=primaryGroup[0]!.currency;
  const sorted=[...primaryGroup].sort((a,b)=>monthlyEquivalent(b)-monthlyEquivalent(a));
  const sum=sorted.reduce((acc,s)=>acc+monthlyEquivalent(s),0);
  if(sum<=0)return [];

  const slices:{id:string;name:string;compactName:string;amount:number}[]=
    sorted.length<=maxSegments
      ? sorted.map(s=>({id:s.id,name:s.name,compactName:compactServiceName(s.name),amount:monthlyEquivalent(s)}))
      : [
          ...sorted.slice(0,maxSegments-1).map(s=>({id:s.id,name:s.name,compactName:compactServiceName(s.name),amount:monthlyEquivalent(s)})),
          {
            id:"__other__",
            name:`Diğer (${sorted.length-(maxSegments-1)})`,
            compactName:"Diğer",
            amount:sorted.slice(maxSegments-1).reduce((acc,s)=>acc+monthlyEquivalent(s),0),
          },
        ];

  const exacts=slices.map(s=>(s.amount/sum)*100);
  const rounded=exacts.map(v=>Math.floor(v));
  let remainder=100-rounded.reduce((a,b)=>a+b,0);
  const order=exacts
    .map((v,i)=>({i,frac:v-Math.floor(v)}))
    .sort((a,b)=>b.frac-a.frac);
  for(let k=0;k<order.length&&remainder>0;k++,remainder--){
    rounded[order[k]!.i]!+=1;
  }

  return slices.map((s,idx)=>({
    id:s.id,
    name:s.name,
    compactName:s.compactName,
    percent:rounded[idx]!,
    exactPercent:exacts[idx]!,
    color:SHARE_PALETTE[idx%SHARE_PALETTE.length]!,
    currency,
  }));
}

export function moveSubscriptionItem<T extends {id:string}>(items:readonly T[],fromId:string,toIndex:number):T[] {
  const fromIndex=items.findIndex(item=>item.id===fromId);
  if(fromIndex===-1||toIndex<0||toIndex>=items.length||fromIndex===toIndex)return [...items];
  const next=[...items];
  const [moved]=next.splice(fromIndex,1);
  next.splice(toIndex,0,moved!);
  return next;
}
