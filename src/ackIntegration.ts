import { buildIntelligenceContext, loadInboxIndex } from "./productIntelligence";
import { loadSubscriptions } from "./subscriptionStore";
import { loadActivity } from "./activityStore";
import { paymentOccurrence } from "../shared/subscriptions";
import { redactSecrets, safeAiContext } from "./privacy";
export { redactSecrets } from "./privacy";
export { proposeAckAction, executeAckAction } from "./ackActions";
export type { AckAction, AckProposal } from "./ackActions";
import { withAiTimeout } from "./aiTimeout";
import { invoke } from "@tauri-apps/api/core";
import { filterTasks, localDateKey, loadTasks } from "./taskStore";
import { loadProjectSnapshot } from "./projectStore";
import { loadNotes } from "./notesStore";
import { loadArchive } from "./archiveStore";
import { loadSpeedResult } from "./speedTestStore";
import { searchLocal } from "./localSearch";
import { loadPreferences } from "./preferences";
import { getSavedAiModel } from "./aiModelPreference";
import { loadWorkspaces, loadShortcuts } from "./workHubStore";
import { resolveRecents } from "./recentStore";
import { loadUsage, rankMatch } from "./usageStore";

export type AckSource = "tasks" | "projects" | "notes" | "archive" | "files" | "speed" | "pc" | "ip" | "settings" | "workspaces" | "shortcuts" | "recent" | "pinned" | "inbox" | "subscriptions" | "activity";
export type AckContext = { source: AckSource; data: string };
export function contextReferences(context: AckContext[]): { source: string; id: string; label: string }[] {
  const result: { source: string; id: string; label: string }[] = [];
  for (const item of context) {
    if (!["tasks", "projects", "notes", "archive", "files", "shortcuts", "workspaces", "recent", "pinned", "inbox", "subscriptions"].includes(item.source)) continue;
    try {
      const value: unknown = JSON.parse(item.data);
      if (!Array.isArray(value)) continue;
      for (const row of value) {
        const source = ["recent", "pinned"].includes(item.source) ? row.source : item.source;
        const page = source === "shortcuts" ? "files" : source;
        if (!["tasks", "projects", "notes", "archive", "files", "workspaces", "inbox", "subscriptions"].includes(page) || typeof row.id !== "string" || !/^[a-zA-Z0-9_.-]{1,128}$/.test(row.id)) continue;
        const label = row.title ?? row.text ?? row.name;
        if (typeof label !== "string" || result.some(r => r.source === page && r.id === row.id)) continue;
        result.push({ source: page, id: row.id, label: redactSecrets(label).slice(0,200) });
        if (result.length === 20) return result;
      }
    } catch { /* A bounded or unavailable context has no invented references. */ }
  }
  return result;
}
export const SOURCE_LABELS: Record<AckSource, string> = { tasks: "Görevler", projects: "Projeler", notes: "Notlar", archive: "Arşiv", files: "Dosya bilgileri", speed: "Son hız testi", pc: "PC Durumu", ip: "IP bilgileri", settings: "Yerel tercihler", workspaces: "Çalışma Alanları", shortcuts: "Kısayollar", recent: "Son Kullanılanlar", pinned: "Sabitlenenler", inbox:"Gelenler",subscriptions:"Abonelikler",activity:"Çalışma geçmişi ve plan" };
export const normalizeAckText = (text: string) => text.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/ı/g, "i");

export function planAckSources(text: string): AckSource[] {
  const value = normalizeAckText(text);
  const sources: AckSource[] = [];
  if (/\bgorev|yapilacak|\bbugun (?:ne yapmam gerekiyor|ne var)/.test(value)) sources.push("tasks");
  if (/\bproje/.test(value)) sources.push("projects");
  if (/\bnot(?:lar|um|un|u|a|ta|larda|$)|notlarim/.test(value)) sources.push("notes");
  if (/arsiv/.test(value)) sources.push("archive");
  if (/\bdosya|\bklasor/.test(value) && !sources.includes("projects")) sources.push("files");
  if (/hiz testi|indirme hiz|yukleme hiz|son hiz/.test(value)) sources.push("speed");
  if (/\bpc\b|bilgisayar.*(?:durum|nasil|kullanim)|\bcpu\b|\bram\b|disk.*(?:durum|bos|alan|kullanim)/.test(value)) sources.push("pc");
  if (/\bip\b|ag gecidi|ag adaptor/.test(value)) sources.push("ip");
  if (/ayar|tercih/.test(value)) sources.push("settings");
  if (/calisma alan|calismas|calismalar/.test(value)) sources.push("workspaces");
  if (/kisayol/.test(value)) sources.push("shortcuts");
  if (/en son.*(?:ugras|calis|ac|kullan)|son kullanilan|nerede kalmistim/.test(value)) sources.push("recent");
  if (/sabitlen|sik kullan/.test(value)) sources.push("pinned");
  if (/abonelik|odeme|yenileme/.test(value)) sources.push("subscriptions");
  if (/gelen|gonderilen/.test(value)) sources.push("inbox");
  return sources;
}

const stopWords = new Set("ben benim bana ne neler nasil hakkinda ilgili kaydetmisim var mi bir bu su o bugun bugunku yarin yarinki kayit kayitlar arsiv arsivim not notlar notlarim proje projesi projeler gorev gorevler gorevlerim aciklama goster listele soyle bilgisi bilgi ve ile icin hangi dosya dosyalar lutfen kaydetmis kaydettim oncelik onemli tarih saat hatirlatma tamamlanmis".split(" "));
function searchTerms(text: string): string[] {
  return normalizeAckText(text).split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !stopWords.has(word) &&
    !/^(?:notlar|projeler|gorevler|dosyalar|kayitlar|arsiv)(?:im|imi|imda|imde|imdeki|imdan|lar|larim|larimi|de|deki)?$/.test(word) &&
    !/^(?:ozetle|ozet|oku|okur|misin|icerik|icerigi|iceriklerini|icerikleri)$/.test(word));
}
function matching<T>(items: T[], query: string, text: (item: T) => string): T[] {
  const terms = searchTerms(query);
  return (terms.length ? items.filter((item) => terms.some((term) => normalizeAckText(text(item)).includes(term))) : items).slice(0, 8);
}
function requireReadable<T>(loaded: { locked?: boolean; error?: string | null; entries?: T[]; warning?: string | null }): void {
  if (loaded.locked || loaded.error) throw new Error("unreadable local source");
}

export const ackReadTools = {
  get_subscriptions: (query:string) => {const loaded=loadSubscriptions();requireReadable(loaded);const matches=loaded.entries.filter(s=>normalizeAckText(query).includes(normalizeAckText(s.name)));return (matches.length?matches:loaded.entries).slice(0,8).map(s=>({id:s.id,name:s.name,nextPayment:paymentOccurrence(s,Date.now()-1)?.date??s.nextPayment,status:s.status,amount:s.amount,currency:s.currency,cycle:s.cycle,reminderDays:s.reminderDays}));},
  get_inbox: () => {const entries=loadInboxIndex();if(entries===null)throw new Error("Inbox metadata not loaded");return entries.slice(0,12);},
  get_activity: () => {const loaded=loadActivity();requireReadable(loaded);return loaded.entries.slice(0,20);},
  search_workspaces: (query: string) => { const loaded = loadWorkspaces(); requireReadable(loaded); const terms = hubTerms(query); return loaded.entries.filter(v => !terms.length || terms.some(term => normalizeAckText(v.name + " " + v.description).includes(term))).slice(0, 8).map(v => ({ id: v.id, name: v.name, description: v.description.slice(0, 500), items: v.items.map(item => ({ name: item.name, type: item.type === "project" ? "project" : item.saved.kind })), lastUsedAt: v.lastUsedAt, useCount: v.useCount })); },
  search_shortcuts: (query: string) => { const loaded = loadShortcuts(); requireReadable(loaded); const terms = hubTerms(query); return loaded.entries.filter(v => !terms.length || terms.some(term => normalizeAckText(v.name + " " + v.description + " " + v.target).includes(term))).slice(0, 8).map(v => ({ id: v.id, name: v.name, type: v.type, target: v.target, description: v.description.slice(0, 500) })); },
  get_recent_items: () => resolveRecents(8).map(v => ({ source: v.source, id: v.id, name: v.title, lastUsedAt: v.usedAt })),
  get_pinned_items: () => { const loaded = loadUsage(); requireReadable(loaded); const records = [...loadWorkspaces().entries.map(v => ({ source: "workspaces", id: v.id, name: v.name })), ...loadShortcuts().entries.map(v => ({ source: "shortcuts", id: v.id, name: v.name })), ...loadProjectSnapshot().entries.map(v => ({ source: "projects", id: v.id, name: v.name })), ...loadNotes().notes.map(v => ({ source: "notes", id: v.id, name: v.title })), ...loadArchive().entries.map(v => ({ source: "archive", id: v.id, name: v.title }))]; return loaded.entries.filter(v => v.pinned || v.useCount > 0).sort((a, b) => rankMatch("", "", "", b) - rankMatch("", "", "", a)).slice(0, 8).flatMap(v => { const record = records.find(r => r.id === v.id && r.source === v.source); return record ? [{ ...record, pinned: v.pinned, useCount: v.useCount, lastUsedAt: v.lastUsedAt }] : []; }); },
  get_tasks: (query = "") => { const value = loadTasks(); requireReadable(value); const normalized = normalizeAckText(query), today = /bugun/.test(normalized); const entries = today ? filterTasks(value.entries, "today", localDateKey()) : value.entries; return matching(entries, /\bbugun (?:ne yapmam gerekiyor|ne var)/.test(normalized) ? "" : query, (item) => item.text).slice(0, 8); },
  get_projects: (query: string) => { const value = loadProjectSnapshot(); requireReadable(value); return matching(value.entries, query, (item) => item.name + " " + item.description).map(({id,name,description,nextStep,workspaceId})=>({id,name,description,nextStep,workspaceId})); },
  get_notes: (query: string) => { const value = loadNotes(); requireReadable(value); const id=query.match(/Not ID:\s*([a-zA-Z0-9_.-]{1,128})/i)?.[1]; const detailed = !!id || searchTerms(query).length > 0 || /ozet|\boku\b|icerik/.test(normalizeAckText(query)); const notes=id?value.notes.filter(n=>n.id===id):matching(value.notes, query, (item) => item.title + " " + item.content); return notes.map((item) => ({ id: item.id, title: item.title, updatedAt: item.updatedAt, ...(detailed ? { content: item.content.slice(0, 1200),contentTruncated:item.content.length>1200 } : {}) })); },
  get_archive_entries: (query: string) => { const value = loadArchive(); requireReadable(value); const detailed = searchTerms(query).length > 0; return matching(value.entries, query, (item) => item.title + " " + item.description + " " + item.tags.join(" ") + " " + item.category).map((item) => ({ ...item, description: detailed ? item.description.slice(0, 1200) : "" })); },
  get_files: (query: string) => { const value = loadShortcuts(); requireReadable(value); return matching(value.entries.filter(v => v.type === "file" || v.type === "folder"), query, (item) => item.name + " " + item.target).map(v => ({ id: v.id, name: v.name, path: v.target, kind: v.type })); },
  get_last_speed_test: () => loadSpeedResult(),
  get_pc_status: () => invoke("pc_status"),
  get_ip_info: async (query: string) => ({ local: await invoke("local_ip_info"), ...(/genel|public|dis ip/.test(normalizeAckText(query)) ? { publicIp: await invoke("public_ip_info") } : {}) }),
  get_settings: () => ({ ...loadPreferences(), aiModel: getSavedAiModel() }),
};
type ReadTools = typeof ackReadTools;
function hubTerms(text: string) { return searchTerms(text).filter(term => !/^(?:calisma|alan|alanlar|alanlarim|calismalar|calismalarim|kisayol|kisayollar|kisayollarim|neler|ac|acil|sabit|sik|kullanilan)$/.test(term)); }

export async function collectAckContext(text: string, tools: ReadTools = ackReadTools): Promise<{ context: AckContext[]; warnings: string[] }> {
  if (tools === ackReadTools && /ilgili ne kaydet|hakkinda ne kaydet|ne kaydetmisim/.test(normalizeAckText(text))) {
    const query = searchTerms(text).join(" ");
    if (query) {
      const { results, warnings } = searchLocal(query, ["projects", "tasks", "notes", "archive", "workspaces", "shortcuts"], 8);
      const groups = new Map<AckSource, unknown[]>();
      for (const result of results) {
        const record = { ...result.record } as Record<string, unknown>;
        if (result.source === "projects") delete record.folderPath;
        if (typeof record.content === "string") record.content = snippet(record.content, query);
        if (typeof record.description === "string") record.description = snippet(record.description, query);
        groups.set(result.source, [...(groups.get(result.source) ?? []), record]);
      }
      if (!groups.size) groups.set("projects", []);
      return { context: [...groups].map(([source, records]) => ({ source, data: redactSecrets(JSON.stringify(safeAiContext(records))).slice(0, 4000) })), warnings };
    }
  }
  const intelligence=tools===ackReadTools?buildIntelligenceContext(text):null;
  if(intelligence)return {context:[{source:"activity",data:JSON.stringify(safeAiContext(JSON.parse(intelligence.text)))}],warnings:[]};
  const sources = planAckSources(text);
  const context: AckContext[] = []; const warnings: string[] = [];
  let budget = 16000;
  if (sources.length > 6) warnings.push("Bir mesajda en fazla altı veri kaynağı kullanılabilir. Daha dar bir soru sorun.");
  for (const source of sources.slice(0, 6)) {
    try {
      let data: unknown;
      switch (source) {
        case "subscriptions": data=await tools.get_subscriptions(text);break;
        case "inbox": data=await tools.get_inbox();break;
        case "activity": data=await tools.get_activity();break;
        case "workspaces": data = await tools.search_workspaces(text); break;
        case "shortcuts": data = await tools.search_shortcuts(text); break;
        case "recent": data = await tools.get_recent_items(); break;
        case "pinned": data = await tools.get_pinned_items(); break;
        case "tasks": data = await tools.get_tasks(text); break;
        case "projects": {
          data = await tools.get_projects(text);
          // Only matching project records may bring matching notes/archive snippets.
          if (Array.isArray(data) && data.length && /ne kaydet|hakkinda|ilgili/.test(normalizeAckText(text))) {
            for (const project of data.slice(0, 2)) {
              const query = project.name;
              try { context.push({ source: "notes", data: redactSecrets(JSON.stringify(safeAiContext(await tools.get_notes(query)))).slice(0, 2000) }); } catch { warnings.push("İlgili notlara erişemedim."); }
              try { context.push({ source: "archive", data: redactSecrets(JSON.stringify(safeAiContext(await tools.get_archive_entries(query)))).slice(0, 2000) }); } catch { warnings.push("İlgili arşiv kayıtlarına erişemedim."); }
              budget -= 4000;
            }
          }
          break;
        }
        case "notes": data = await tools.get_notes(text); break;
        case "archive": data = await tools.get_archive_entries(text); break;
        case "files": data = await tools.get_files(text); break;
        case "speed": data = await tools.get_last_speed_test(); break;
        case "pc": data = await withAiTimeout(Promise.resolve(tools.get_pc_status()), 5000); break;
        case "ip": data = await withAiTimeout(Promise.resolve(tools.get_ip_info(text)), 5000); break;
        case "settings": data = await tools.get_settings(); break;
      }
      const serialized = redactSecrets(JSON.stringify(safeAiContext(data)) ?? "null");
      if (budget > 0) { context.push({ source, data: serialized.slice(0, Math.min(6000, budget)) }); budget -= Math.min(serialized.length, 6000); }
    } catch { warnings.push(SOURCE_LABELS[source] + " bilgilerine şu anda erişemedim."); }
  }
  return { context, warnings };
}
function snippet(text: string, query: string): string { const term = searchTerms(query)[0]; const at = term ? normalizeAckText(text).indexOf(term) : 0; return text.slice(Math.max(0, at - 160), Math.max(0, at - 160) + 1200); }
