import { scrubSync } from "../../shared/privacy";
import { tryMergeNoteRecords } from "../../shared/textMerge";
import { validCloudRecord, validMutation, type CloudRecord, type Mutation, type PhoneNote } from "../../shared/phone";
export type MobileState = { taskOrder?: string[]; noteOrder?: string[]; baseNotes?: Record<string, PhoneNote>; syncSchema?: 2 | 3 | 4 | 5; token: string | null; name: string; cursor: number; records: CloudRecord[]; queue: Mutation[]; conflicts: { mutation: Mutation; server: CloudRecord | null }[] };
export const emptyState = (): MobileState => ({token:null,name:"iPhone",cursor:0,records:[],queue:[],conflicts:[]});
function open(): Promise<IDBDatabase> { return new Promise((resolve,reject) => { const request = indexedDB.open("ack-deck-mobile-v1",1); request.onupgradeneeded = () => request.result.createObjectStore("state"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error("Telefon kayıtlarına erişilemedi.")); }); }
export async function readState(): Promise<MobileState> { const db = await open(); try { return await new Promise((resolve,reject) => { const tx = db.transaction("state","readonly"), request = tx.objectStore("state").get("current"); request.onsuccess = () => {const value=request.result??emptyState();if(!value||!Array.isArray(value.records)||!value.records.every(validCloudRecord)||!Array.isArray(value.queue)||!value.queue.every(validMutation)||!Array.isArray(value.conflicts)||!value.conflicts.every((row:MobileState["conflicts"][number])=>row&&validMutation(row.mutation)&&(row.server===null||validCloudRecord(row.server)))||typeof value.name!=="string"||!Number.isSafeInteger(value.cursor)||value.cursor<0||(value.token!==null&&typeof value.token!=="string")||(value.baseNotes!==undefined&&(typeof value.baseNotes!=="object"||value.baseNotes===null||Array.isArray(value.baseNotes)))){reject(new Error("Telefon kayıtları okunamadı. Mevcut veriler korunuyor."));return;}resolve(value);}; request.onerror = () => reject(new Error("Telefon kayıtları okunamadı.")); }); } finally { db.close(); } }
export async function saveState(state: MobileState): Promise<void> { const db = await open(); try { await new Promise<void>((resolve,reject) => { const tx = db.transaction("state","readwrite"); tx.objectStore("state").put(state,"current"); tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(new Error("Kaydedilemedi. Telefon depolaması dolu olabilir.")); }); } finally { db.close(); } }
export function enqueue(state: MobileState, mutation: Mutation): MobileState {
  if (!validMutation(mutation)) throw new Error("Kayıt bilgileri geçersiz.");
  const existing = state.records.find(row => row.kind === mutation.kind && row.id === mutation.id);
  // Serialize edits to a single record; subsequent edits build on the queued version.
  const previous = state.queue.filter(row => row.kind === mutation.kind && row.id === mutation.id).at(-1);
  const version = previous ? previous.baseVersion + 1 : existing?.version ?? 0;
  const next = {...mutation,baseVersion:version};
  const nextBaseNotes =
    mutation.kind === "notes" && !previous && existing && !existing.deleted && existing.data
      ? { ...(state.baseNotes ?? {}), [mutation.id]: existing.data as PhoneNote }
      : state.baseNotes;
  return {...state,...(nextBaseNotes ? { baseNotes: nextBaseNotes } : {}),queue:[...state.queue,next],records:[...state.records.filter(row => row.kind !== next.kind || row.id !== next.id),{kind:next.kind,id:next.id,version:version+1,data:next.data,deleted:next.deleted,updatedAt:Date.now()}]};
}
export async function api<T>(state: MobileState, path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers); if (state.token) headers.set("Authorization",`Bearer ${state.token}`);
  headers.set("X-ACKDeck-Schema","5");
  let response:Response;try{response=await fetch(`/api/${path}`,{...options,headers,cache:"no-store",signal:AbortSignal.timeout(20000)});}catch{throw new Error("Sunucuya ulaşılamadı. İnternet bağlantısını kontrol edin.");}
  let result:T & {error?:string};try{result=await response.json();}catch{throw new Error("Sunucu yanıtı alınamadı. Daha sonra tekrar deneyin.");} if (!response.ok) throw new Error(result.error || "Sunucuya ulaşılamadı."); return result;
}
export const json = (body: unknown): RequestInit => ({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
export async function synchronize(initial: MobileState, request = api, persist = saveState): Promise<MobileState> {
  let state = structuredClone(initial);
  if (!state.token) return state;
  // Re-read previously skipped 1.1 kinds on upgrade, retaining queued edits and
  // their versions. This does not clear or replace the paired device token.
  if(state.syncSchema!==5){state.cursor=0;state.syncSchema=5;}
  let attempts = 0;
  while (state.queue.length && attempts++ < 80) {
    const mutation = state.queue[0];
    const result = await request<{record:CloudRecord|null;conflict?:boolean}>(state,"mutations",json({...mutation,data:scrubSync(mutation.data)}));
    if((result.record!==null&&!validCloudRecord(result.record))||(!result.conflict&&!result.record))throw new Error("Sunucu kayıtları doğrulanamadı.");
    if (result.conflict) {
      const related = state.queue.filter(row => row.kind === mutation.kind && row.id === mutation.id);
      const latestLocal = related.at(-1)!;
      const baseNote = mutation.kind === "notes" ? state.baseNotes?.[mutation.id] : undefined;
      if (
        mutation.kind === "notes" &&
        !latestLocal.deleted &&
        latestLocal.data &&
        result.record &&
        !result.record.deleted &&
        result.record.data &&
        baseNote
      ) {
        const merged = tryMergeNoteRecords(baseNote, latestLocal.data as PhoneNote, result.record.data as PhoneNote);
        if (merged) {
          const mergedMutation: Mutation = {
            mutationId: crypto.randomUUID(),
            kind: "notes",
            id: mutation.id,
            baseVersion: result.record.version,
            data: merged,
            deleted: false,
          };
          state.baseNotes = { ...(state.baseNotes ?? {}), [mutation.id]: result.record.data as PhoneNote };
          state.records = [
            ...state.records.filter(row => row.kind !== "notes" || row.id !== mutation.id),
            { kind: "notes", id: mutation.id, version: result.record.version + 1, data: merged, deleted: false, updatedAt: Date.now() },
          ];
          state.queue = [mergedMutation, ...state.queue.filter(row => row.kind !== mutation.kind || row.id !== mutation.id)];
          await persist(state);
          continue;
        }
      }
      if (state.baseNotes && mutation.id in state.baseNotes) {
        const { [mutation.id]: _removed, ...rest } = state.baseNotes;
        state.baseNotes = rest;
      }
      state.conflicts.push({mutation:latestLocal,server:result.record});
      state.queue = state.queue.filter(row => row.kind !== mutation.kind || row.id !== mutation.id);
    } else {
      state.queue.shift();
      if (mutation.kind === "notes" && state.baseNotes && mutation.id in state.baseNotes && !state.queue.some(r => r.kind === "notes" && r.id === mutation.id)) {
        const { [mutation.id]: _removed, ...rest } = state.baseNotes;
        state.baseNotes = rest;
      }
    }
    await persist(state);
  }
  let more = true, pages = 0;
  while (more && pages++ < 50) {
    const result = await request<{records:CloudRecord[];cursor:number;more:boolean}>(state,`sync?cursor=${state.cursor}`);
    if(!Array.isArray(result.records)||result.records.length>40||!Number.isSafeInteger(result.cursor)||result.cursor<state.cursor||typeof result.more!=="boolean")throw new Error("Sunucu kayıtları doğrulanamadı.");
    for (const record of result.records) {
      if(!validCloudRecord(record))throw new Error("Sunucu kayıtları doğrulanamadı.");
      const conflict=state.conflicts.find(row => row.mutation.kind === record.kind && row.mutation.id === record.id);
      if(conflict){conflict.server=record;continue;}
      state.records = [...state.records.filter(row => row.kind !== record.kind || row.id !== record.id),record];
    }
    state.cursor = result.cursor; more = result.more; await persist(state);
  }
  return state;
}
