import { captureDeleted } from "./trashStore";
import { recordChanges } from "./activityStore";
import { validSubscription, type Subscription } from "../shared/subscriptions";
export const SUBSCRIPTION_KEY="ack-deck.subscriptions.v1";
export type SubscriptionLoad={entries:Subscription[];preserved:unknown[];locked:boolean;warning:string|null};
export function loadSubscriptions():SubscriptionLoad {
  try {const raw=window.localStorage.getItem(SUBSCRIPTION_KEY);if(raw===null)return {entries:[],preserved:[],locked:false,warning:null};const value:unknown=JSON.parse(raw);if(!Array.isArray(value))throw Error();const entries:Subscription[]=[],preserved:unknown[]=[],ids=new Set<string>();for(const row of value){if(validSubscription(row)&&!ids.has(row.id)){entries.push(row);ids.add(row.id);}else preserved.push(row);}return {entries,preserved,locked:false,warning:preserved.length?"Bazı abonelikler okunamadı. Kayıtlar korunuyor.":null};}catch{return {entries:[],preserved:[],locked:true,warning:"Abonelikler okunamadı. Mevcut kayıtlar korunuyor."};}
}
export function saveSubscriptions(entries:Subscription[],loaded=loadSubscriptions()):boolean {if(loaded.locked||!entries.every(validSubscription)||new Set(entries.map(s=>s.id)).size!==entries.length)return false;try {if(!captureDeleted("subscriptions",loaded.entries,entries))return false;window.localStorage.setItem(SUBSCRIPTION_KEY,JSON.stringify([...entries,...loaded.preserved]));recordChanges("subscriptions",loaded.entries,entries);if(typeof Event!=="undefined")window.dispatchEvent?.(new Event("ack-data-changed"));return true;}catch{return false;}}
