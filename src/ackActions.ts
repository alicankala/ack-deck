import { offerUndo } from "./recordUndo";
import { parseSmartCapture } from "../shared/smartCapture";
import { validLinks, validChecklist } from "../shared/productivity";
import { validRecurrence } from "../shared/recurrence";
import { saveProjects } from "./projectStore";
import { completeOccurrence } from "../shared/recurrence";
import { invoke } from "@tauri-apps/api/core";
import { loadTasks, saveTasks, isTask, localDateKey, validTaskDate, validTaskTime, type Task } from "./taskStore";
import { loadNotes, saveNotes } from "./notesStore";
import { ARCHIVE_CATEGORIES, loadArchive, saveArchive, type ArchiveCategory } from "./archiveStore";
import { loadProjectSnapshot } from "./projectStore";
import { normalizeSearch } from "./localSearch";
import { openRegisteredProject } from "./commandPalette";
import { redactSecrets } from "./privacy";
import type { NavigationTarget } from "./navigation";
import type { Page } from "./components/Sidebar";
import { loadWorkspaces, loadShortcuts } from "./workHubStore";
import { launchWorkspace, launchShortcut } from "./hubLaunch";
type TaskPatch = Partial<Pick<Task, "text" | "dueDate" | "dueTime" | "priority" | "reminder" | "checklist" | "projectId" | "workspaceId" | "sourceInboxId" | "reminderLeadMinutes" | "recurrence" | "occurrenceAt" | "timezone">>;
type ArchivePatch = { title?: string; category?: ArchiveCategory; description?: string; date?: string | null; tags?: string[] };
export type AckAction =
  | {type:"batch";actions:AckAction[]}
  | {type:"create_tasks";texts:string[];projectId?:string|null}
  | ({ type: "create_task"; text: string } & TaskPatch) | ({ type: "update_task"; taskId: string } & TaskPatch)
  | { type: "complete_task" | "delete_task"; taskId: string }
  | { type: "create_note"; title: string; content: string; projectId?:string|null; workspaceId?:string|null } | { type: "update_note"; noteId: string; title?: string; content?: string; projectId?:string|null; workspaceId?:string|null } | { type: "delete_note"; noteId: string }
  | ({ type: "create_archive"; title: string; category: ArchiveCategory; description: string } & ArchivePatch) | ({ type: "update_archive"; archiveId: string } & ArchivePatch) | { type: "delete_archive"; archiveId: string }
  | {type:"update_project";projectId:string;nextStep?:string;workspaceId?:string|null;inboxIds?:string[];}
  | { type: "open_project"; projectId: string; mode: "folder" | "vscode" } | { type: "open_workspace"; workspaceId: string } | { type: "open_shortcut"; shortcutId: string } | { type: "navigate"; page: Page } | { type: "start_speed_test" };
export type AckProposal = { action: AckAction; question: string; expected?: string };
const pages: Page[] = ["home", "tasks", "ai", "projects", "workspaces", "notes", "tools", "qr", "ip", "files", "speed", "pc", "archive", "settings", "inbox", "subscriptions", "calendar"];
const shapes: Record<AckAction["type"], string[]> = {
  batch:["actions"], create_tasks:["texts","projectId"],
  create_task: ["text", "dueDate", "dueTime", "priority", "reminder", "checklist", "projectId", "workspaceId", "sourceInboxId", "reminderLeadMinutes", "recurrence", "occurrenceAt", "timezone"], update_task: ["taskId", "text", "dueDate", "dueTime", "priority", "reminder", "checklist", "projectId", "workspaceId", "reminderLeadMinutes", "recurrence", "occurrenceAt", "timezone"], complete_task: ["taskId"], delete_task: ["taskId"],
  create_note: ["title", "content", "projectId", "workspaceId"], update_note: ["noteId", "title", "content", "projectId", "workspaceId"], delete_note: ["noteId"],
  create_archive: ["title", "category", "description", "date", "tags"], update_archive: ["archiveId", "title", "category", "description", "date", "tags"], delete_archive: ["archiveId"],
  update_project: ["projectId", "nextStep", "workspaceId", "inboxIds"], open_project: ["projectId", "mode"], navigate: ["page"], start_speed_test: [],
  open_workspace: ["workspaceId"], open_shortcut: ["shortcutId"],
};
const invalid = () => { throw new Error("AI işlem bilgileri geçersiz. Hiçbir değişiklik yapılmadı."); };
export function validateAckAction(value: unknown): AckAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const item = value as Record<string, unknown>, type = item.type as AckAction["type"];
  if(type==="batch"){if(Object.keys(item).some(k=>!["type","actions"].includes(k))||!Array.isArray(item.actions)||item.actions.length<1||item.actions.length>8||item.actions.some(a=>!a||typeof a!=="object"||!["create_task","create_tasks","update_task","complete_task","create_note","update_note","update_project","create_archive"].includes(String(a.type))))return invalid();return {type:"batch",actions:item.actions.map(validateAckAction)};}
  if (!Object.prototype.hasOwnProperty.call(shapes, type) || Object.keys(item).some((key) => key !== "type" && !shapes[type].includes(key))) return invalid();
  const string = (key: string, max: number, required = false, nonempty = false) => { const value = item[key]; if (value === undefined && !required) return; if (typeof value !== "string" || value.length > max || (nonempty && !value.trim()) || redactSecrets(value) !== value) invalid(); };
  for (const key of ["taskId", "noteId", "archiveId", "shortcutId"]) if (shapes[type].includes(key)) string(key, 512, true, true);
  if (!validLinks(item)) invalid();
  if(type==="create_tasks"&&(!Array.isArray(item.texts)||item.texts.length<1||item.texts.length>8||!item.texts.every(v=>typeof v==="string"&&v.trim()&&v.length<=160&&redactSecrets(v)===v)))invalid();
  if ((type === "create_task" || type === "create_tasks" || type === "update_task" || type === "create_note" || type === "update_note") && item.projectId && !loadProjectSnapshot().entries.some(p=>p.id===item.projectId)) throw new Error("Proje bulunamadı.");
  if ((type === "create_task" || type === "update_task" || type === "create_note" || type === "update_note" || type === "update_project") && item.workspaceId && !loadWorkspaces().entries.some(w=>w.id===item.workspaceId)) throw new Error("Çalışma alanı bulunamadı.");
  if (type === "open_project" || type === "update_project") string("projectId",128,true,true);
  if (type === "open_workspace") string("workspaceId",128,true,true);
  if (type === "update_project") {string("nextStep",500);if(item.inboxIds!==undefined&&(!Array.isArray(item.inboxIds)||item.inboxIds.length>200||!item.inboxIds.every(id=>typeof id==="string"&&/^[a-zA-Z0-9_.-]{1,128}$/.test(id))))invalid();}
  if (type.includes("task") && type!=="create_tasks") {
    if(item.checklist!==undefined&&!validChecklist(item.checklist))invalid();
    if(item.recurrence!=null&&!validRecurrence(item.recurrence))invalid();
    string("text", 160, type === "create_task", true);
    if (item.dueDate !== undefined && item.dueDate !== null && !validTaskDate(item.dueDate)) invalid();
    if (item.dueTime !== undefined && item.dueTime !== null && !validTaskTime(item.dueTime)) invalid();
    if (item.priority !== undefined && item.priority !== "normal" && item.priority !== "important") invalid();
    if (item.reminder !== undefined && typeof item.reminder !== "boolean") invalid();
    if (type === "create_task" && !isTask({ ...item, id: "validation", completed: false })) invalid();
  }
  if (type.includes("note")) { string("title", 160, type === "create_note", true); string("content", 30000, type === "create_note"); }
  if (type.includes("archive")) {
    string("title", 160, type === "create_archive", true); string("description", 20000, type === "create_archive");
    if ((type === "create_archive" || item.category !== undefined) && !ARCHIVE_CATEGORIES.includes(item.category as ArchiveCategory)) invalid();
    if (item.date !== undefined && item.date !== null && !validTaskDate(item.date)) invalid();
    if (item.tags !== undefined && (!Array.isArray(item.tags) || item.tags.length > 50 || !item.tags.every((tag) => typeof tag === "string" && tag.length <= 100 && redactSecrets(tag) === tag))) invalid();
  }
  if (type.startsWith("update_") && Object.keys(item).length <= 2) invalid();
  if (type === "open_project" && item.mode !== "folder" && item.mode !== "vscode") invalid();
  if (type === "navigate" && !pages.includes(item.page as Page)) invalid();
  return item as AckAction;
}
function patch<T extends object>(action: T, keys: string[]): Record<string, unknown> { return Object.fromEntries(Object.entries(action).filter(([key, value]) => keys.includes(key) && value !== undefined)); }
function currentRecord(action: AckAction): unknown {
  if(action.type==="batch")return action.actions.map(currentRecord);
  if (action.type === "open_workspace") { const loaded = loadWorkspaces(), item = loaded.entries.find(v => v.id === action.workspaceId); if (loaded.locked || !item) throw new Error("Çalışma alanı bulunamadı."); const projects = loadProjectSnapshot(); if (projects.locked && item.items.some(v => v.type === "project")) throw new Error("Proje bilgilerine şu anda erişemedim."); return { ...item, resolvedProjects: item.items.filter(v => v.type === "project").map(v => projects.entries.find(project => project.id === v.projectId) ?? { missing: v.projectId }) }; }
  if ("shortcutId" in action) { const loaded = loadShortcuts(), item = loaded.entries.find(v => v.id === action.shortcutId); if (loaded.locked || !item) throw new Error("Kısayol bulunamadı."); return item; }
  if ("taskId" in action) { const loaded = loadTasks(); if (loaded.locked) throw new Error("Görev bilgilerine şu anda erişemedim."); const item = loaded.entries.find((task) => task.id === action.taskId); if (!item) throw new Error("Görev artık bulunamıyor."); const { remindedFor: _, ...stable } = item; return stable; }
  if ("noteId" in action) { const loaded = loadNotes(); if (loaded.error) throw new Error("Not bilgilerine şu anda erişemedim."); const item = loaded.notes.find((note) => note.id === action.noteId); if (!item) throw new Error("Not artık bulunamıyor."); return item; }
  if ("archiveId" in action) { const loaded = loadArchive(); if (loaded.locked) throw new Error("Arşiv bilgilerine şu anda erişemedim."); const item = loaded.entries.find((entry) => entry.id === action.archiveId); if (!item) throw new Error("Arşiv kaydı artık bulunamıyor."); return item; }
  if (action.type === "open_project" || action.type === "update_project") { const loaded = loadProjectSnapshot(); if (loaded.locked) throw new Error("Proje bilgilerine şu anda erişemedim."); const item = loaded.entries.find((project) => project.id === action.projectId); if (!item || action.type === "open_project" && !item.folderPath) throw new Error("Proje klasörü bulunamadı."); return item; }
  return undefined;
}
export function prepareAckProposal(input: unknown): AckProposal {
  const action = validateAckAction(input);
  if(action.type==="batch"){const proposals=action.actions.map(prepareAckProposal);return {action,question:"Önerilen işlemler\n"+proposals.map((p,i)=>`${i+1}. ${p.question}`).join("\n\n"),expected:JSON.stringify(currentRecord(action))};}
  const current = currentRecord(action) as Record<string, unknown> | undefined;
  const expected = current ? JSON.stringify(current) : undefined;
  let question = "İşlem onaylansın mı?";
  if(action.type==="create_tasks")question="Bu görevler oluşturulsun mu?\n"+action.texts.map(t=>"• "+t).join("\n");
  else if (action.type === "create_task" || action.type === "update_task") {
    const candidate = { ...(current ?? {}), ...patch(action, shapes.create_task) };
    if (!isTask({ ...candidate, id: "preview", completed: false })) invalid();
    question = (action.type === "create_task" ? "Yeni görev oluşturulsun mu?" : "Görev güncellensin mi?") + "\n" + candidate.text + "\nTarih: " + (candidate.dueDate ?? "Tarihsiz") + " · Saat: " + (candidate.dueTime ?? "Yok") + "\nProje: " + (loadProjectSnapshot().entries.find(p=>p.id===candidate.projectId)?.name ?? "Projesiz") + " · Checklist: " + ((candidate.checklist as unknown[]|undefined)?.length??0) + " adım · Hatırlatma: " + (candidate.reminder ? `${candidate.reminderLeadMinutes??0} dakika önce` : "Kapalı") + ((candidate.checklist as {text:string}[]|undefined)?.map(c=>"\n☐ "+c.text).join("")??"");
  } else if (action.type === "complete_task" || action.type === "delete_task") question = String(current?.text) + "\nGörev " + (action.type === "delete_task" ? "silinsin mi?" : "tamamlandı işaretlensin mi?");
  else if (action.type.includes("note")) question = (action.type === "delete_note" ? "Not silinsin mi?" : action.type === "create_note" ? "Yeni not oluşturulsun mu?" : "Not güncellensin mi?" + ("content" in action ? " İçeriğin tamamı aşağıdaki metinle değiştirilecek." : "")) + "\n" + String((action as { title?: string }).title ?? current?.title) + ("content" in action ? "\n" + action.content : "");
  else if (action.type.includes("archive")) {
    const candidate = { ...(current ?? {}), ...patch(action, shapes.create_archive) };
    question = (action.type === "delete_archive" ? "Arşiv kaydı silinsin mi? İlişkili gerçek dosya silinmez." : action.type === "create_archive" ? "Yeni arşiv kaydı oluşturulsun mu?" : "Arşiv kaydı güncellensin mi?") + "\n" + candidate.title + "\nKategori: " + candidate.category + "\n" + (candidate.description ?? "") + "\nTarih: " + (candidate.date ?? "Yok") + "\nEtiketler: " + ((candidate.tags as string[] | undefined)?.join(", ") ?? "Yok");
  }
  else if (action.type === "update_project") question = String(current?.name)+" projesi güncellensin mi?\nSıradaki adım: "+(action.nextStep??current?.nextStep??"Yok")+"\nÇalışma alanı: "+(action.workspaceId??current?.workspaceId??"Yok");
  else if (action.type === "open_project") question = String(current?.name) + " projesini " + (action.mode === "vscode" ? "VS Code'da" : "Explorer'da") + " açayım mı?";
  else if (action.type === "open_workspace") question = String(current?.name) + " çalışma alanı açılsın mı?\nAçılacaklar:\n" + (loadWorkspaces().entries.find(v => v.id === action.workspaceId)?.items.map(v => "• " + v.name).join("\n") || "Henüz öğe eklenmedi.");
  else if (action.type === "open_shortcut") question = String(current?.name) + " kısayolu açılsın mı?\n" + String(current?.target);
  else if (action.type === "start_speed_test") question = "Hız testi ağ trafiği kullanır. Başlatılsın mı?";
  else if (action.type === "navigate") question = "ACKDeck sayfası açılsın mı?";
  return { action, question: redactSecrets(question), expected };
}
export function proposalFromTool(call: { name: string; args: unknown }, userText: string, now = new Date()): AckProposal {
  if (!call || typeof call.name !== "string" || !call.args || typeof call.args !== "object" || Array.isArray(call.args) || "type" in call.args) invalid();
  const input = { ...(call.args as Record<string, unknown>), type: call.name };
  if(call.name==="plan_actions"){const args=call.args as {actions?:{name:string;args:unknown}[]};if(!Array.isArray(args.actions)||args.actions.length<1||args.actions.length>8)invalid();return prepareAckProposal({type:"batch",actions:args.actions!.map(c=>{if(c.name==="plan_actions")return invalid();const {name,args:nested,...flat}=c as {name:string;args?:unknown;[key:string]:unknown};return proposalFromTool({name,args:nested??flat},userText,now).action;})});}
  if (call.name === "create_task" || call.name === "update_task") Object.assign(input, parseTemporal(userText, now));
  return prepareAckProposal(input);
}
export function parseTemporal(text: string, now = new Date()): TaskPatch {
  const normalized = normalizeSearch(text), result: TaskPatch = {};
  if (/\byarin\b/.test(normalized)) { const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); result.dueDate = localDateKey(tomorrow); }
  else if (/\bbugun\b/.test(normalized)) result.dueDate = localDateKey(now);
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/), dotted = text.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
  if (iso) result.dueDate = iso[1]; else if (dotted) result.dueDate = `${dotted[3]}-${dotted[2]}-${dotted[1]}`;
  const time = normalized.match(/\bsaat\s+(\d{1,2})(?::(\d{2}))?/) ?? normalized.match(/\b(\d{1,2}):(\d{2})/);
  if (time) result.dueTime = time[1].padStart(2, "0") + ":" + (time[2] ?? "00");
  if (/\bonemli\b/.test(normalized)) result.priority = "important";
  if (/\bnormal\b/.test(normalized)) result.priority = "normal";
  if (/hatirlat/.test(normalized)) result.reminder = !/hatirlat.*(?:kapat|kaldir|iptal)/.test(normalized);
  return result;
}
export const isActionRequest = (text: string) => /\b(?:ekle|olustur|duzenle|degistir|tamamla|sil|ac|git|baslat)\b|hatirlat|internetimi test et/.test(normalizeSearch(text));
export function proposeAckAction(text: string, now = new Date()): AckProposal | null {
  const normalized = normalizeSearch(text);
  const capture=parseSmartCapture(text,loadProjectSnapshot().entries,now);
  if(capture){const {kind,...fields}=capture;return prepareAckProposal(kind==="note"?{type:"create_note",...fields}:{type:"create_task",...fields});}
  const nextStep=text.match(/^(.+?)\s+projesinin\s+sıradaki\s+adımını\s*(?:değiştir|yap)\s*:\s*(.+)$/iu);if(nextStep){const matches=loadProjectSnapshot().entries.filter(p=>normalizeSearch(p.name)===normalizeSearch(nextStep[1]));if(matches.length===1)return prepareAckProposal({type:"update_project",projectId:matches[0].id,nextStep:nextStep[2]});}
  const nav: [RegExp, Page][] = [[/\bqr\b.*(?:ac|git)/, "qr"], [/notlara git/, "notes"], [/ayarlari ac|ayarlara git/, "settings"], [/arsivi ac|arsive git/, "archive"], [/gorevlere git/, "tasks"], [/ana sayfa.*(?:ac|git)/, "home"]];
  for (const [pattern, page] of nav) if (pattern.test(normalized)) return prepareAckProposal({ type: "navigate", page });
  if (/internetimi test et|hiz testini baslat|hiz testi baslat/.test(normalized)) return prepareAckProposal({ type: "start_speed_test" });
  if (/\bac\b|acar misin/.test(normalized)) {
    if (!/\bproje/.test(normalized)) {
      const workspaces = loadWorkspaces(), workspaceMatches = workspaces.locked ? [] : workspaces.entries.filter(v => normalized.includes(normalizeSearch(v.name)));
      if (workspaceMatches.length === 1) return prepareAckProposal({ type: "open_workspace", workspaceId: workspaceMatches[0].id });
      const shortcuts = loadShortcuts(), shortcutMatches = shortcuts.locked ? [] : shortcuts.entries.filter(v => normalized.includes(normalizeSearch(v.name)));
      if (shortcutMatches.length === 1) return prepareAckProposal({ type: "open_shortcut", shortcutId: shortcutMatches[0].id });
    }
    const loaded = loadProjectSnapshot(); const matches = loaded.locked ? [] : loaded.entries.filter((project) => normalized.includes(normalizeSearch(project.name)));
    if (matches.length === 1 && matches[0].folderPath) return prepareAckProposal({ type: "open_project", projectId: matches[0].id, mode: /vs\s*code|vscode/.test(normalized) ? "vscode" : "folder" });
  }
  if (/gorev/.test(normalized) && !/(?:gorevi|gorevini|gorevlerime|gorev listeme|gorevlere|gorev olarak)\s+ekle[.!]?$/.test(normalized) && /tamamla|tamamlandi|sil|duzenle|degistir|hatirlat|oncelik|tarih|saat/.test(normalized)) {
    const loaded = loadTasks(), matches = loaded.locked ? [] : loaded.entries.filter((task) => normalized.includes(normalizeSearch(task.text)));
    if (matches.length === 1) {
      if (/tamamla|tamamlandi/.test(normalized)) return prepareAckProposal({ type: "complete_task", taskId: matches[0].id });
      if (/\bsil\b/.test(normalized)) return prepareAckProposal({ type: "delete_task", taskId: matches[0].id });
      const changes = parseTemporal(text, now), replacement = text.match(/(?:düzenle|değiştir)\s*:\s*(.+)$/iu);
      if (replacement) changes.text = replacement[1];
      if (Object.keys(changes).length) return prepareAckProposal({ type: "update_task", taskId: matches[0].id, ...changes });
    }
  }
  const create = text.match(/^(.+?)\s+(?:görevlerime|görev listeme|görevlere|görev olarak|görevi|görevini)\s+ekle[.!]?$/iu) ?? text.match(/^(?:yeni\s+)?görev(?: ekle| oluştur)?\s*:\s*(.+)$/iu) ?? text.match(/^(.+?)\s+hatırlat[.!]?$/iu);
  if (create) {
    let title = create[1].trim().replace(/^["“]|["”]$/g, "").replace(/(?:mayı|meyi)$/iu, "");
    title = title.replace(/\b[Yy]ar[ıi]n\b|\b[Bb]ugün\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{2}\.\d{2}\.\d{4}\b/gu, "").replace(/\bsaat\s+\d{1,2}(?::\d{2})?(?:['’]?(?:te|ta|de|da|e|a))?|\b\d{1,2}:\d{2}(?:['’]?(?:te|ta|de|da|e|a))?/giu, "").trim();
    return prepareAckProposal({ type: "create_task", text: title, ...parseTemporal(text, now) });
  }
  const newNote = text.match(/^yeni not(?: oluştur)?\s*:\s*([^|]+)\|\s*([\s\S]*)$/iu);
  if (newNote) return prepareAckProposal({ type: "create_note", title: newNote[1].trim(), content: newNote[2].trim() });
  const newArchive = text.match(/^yeni arşiv kaydı\s*:\s*([^|]+)\|\s*([^|]*)(?:\|\s*(.+))?$/iu);
  if (newArchive) return prepareAckProposal({ type: "create_archive", title: newArchive[1].trim(), description: newArchive[2].trim(), category: newArchive[3]?.trim() ?? "Diğer" });
  if (/not.*(?:duzenle|sil)|arsiv.*(?:duzenle|sil)/.test(normalized)) {
    if (/not/.test(normalized)) { const loaded = loadNotes(), matches = loaded.error ? [] : loaded.notes.filter((note) => note.title && normalized.includes(normalizeSearch(note.title))); if (matches.length === 1) { if (/\bsil\b/.test(normalized)) return prepareAckProposal({ type: "delete_note", noteId: matches[0].id }); const replacement = text.match(/düzenle\s*:\s*([\s\S]+)$/iu); if (replacement) return prepareAckProposal({ type: "update_note", noteId: matches[0].id, content: replacement[1] }); } }
    else { const loaded = loadArchive(), matches = loaded.locked ? [] : loaded.entries.filter((entry) => normalized.includes(normalizeSearch(entry.title))); if (matches.length === 1) { if (/\bsil\b/.test(normalized)) return prepareAckProposal({ type: "delete_archive", archiveId: matches[0].id }); const replacement = text.match(/düzenle\s*:\s*([\s\S]+)$/iu); if (replacement) return prepareAckProposal({ type: "update_archive", archiveId: matches[0].id, description: replacement[1] }); } }
  }
  return null;
}
export async function executeAckAction(input: AckAction, confirmed: boolean, native = invoke, navigate?: (target: NavigationTarget) => void, expected?: string): Promise<string> {
  const action = validateAckAction(input);
  if (action.type !== "navigate" && confirmed !== true) throw new Error("İşlem için kullanıcı onayı gerekli.");
  const current = currentRecord(action);
  if (expected !== undefined && JSON.stringify(current) !== expected) throw new Error("Kayıt onay beklerken değişti. İşlemi yeniden hazırlayın.");
  if(action.type==="batch"){let count=0;try{for(const child of action.actions){await executeAckAction(child,true,native,navigate);count++;}}catch{throw new Error(`${count} işlem uygulandı; kalan işlemler uygulanmadı. Kayıtları kontrol ederek yeniden taslak hazırlayın.`);}return `${count} onaylanmış işlem uygulandı.`;}
  if(action.type==="create_tasks"){const loaded=loadTasks(),tasks=action.texts.map(text=>({id:crypto.randomUUID(),text,completed:false,projectId:action.projectId}));if(!saveTasks([...tasks,...loaded.entries],loaded))throw new Error("Görevler kaydedilemedi.");return `${tasks.length} görev oluşturuldu.`;}
  if (action.type === "navigate" || action.type === "start_speed_test") {
    if (!navigate) throw new Error("ACKDeck sayfası açılamadı.");
    navigate(action.type === "navigate" ? { page: action.page } : { page: "speed", intent: "start-speed" });
    return action.type === "navigate" ? "ACKDeck sayfası açıldı." : "Hız testi sayfası açıldı; onayladığın ölçüm başlatılacak.";
  }
  if(action.type === "update_project"){const loaded=loadProjectSnapshot();if(!saveProjects(loaded.entries.map(p=>p.id===action.projectId?{...p,...patch(action,["nextStep","workspaceId","inboxIds"])}:p),loaded))throw new Error("Proje kaydedilemedi.");return "Proje güncellendi.";}
  if (action.type === "open_project") { await openRegisteredProject(action.projectId, action.mode, native); return "Kayıtlı proje " + (action.mode === "vscode" ? "VS Code'da" : "Explorer'da") + " açıldı."; }
  if (action.type === "open_workspace") { const snapshot = expected ?? JSON.stringify(current); const result = await launchWorkspace(action.workspaceId, native, () => { if (JSON.stringify(currentRecord(action)) !== snapshot) throw new Error("Onaylanan hedef değişti. Yeniden onay gerekli."); }); return result.errors.length ? `${result.opened} öğe açıldı. ${result.errors.join(" ")}` : result.opened ? "Çalışma alanı açıldı." : "Çalışma alanında açılacak öğe yok. Hiçbir öğe açılmadı."; }
  if (action.type === "open_shortcut") { await launchShortcut(action.shortcutId, native); return "Kayıtlı kısayol açıldı."; }
  if (action.type.includes("task")) {
    const loaded = loadTasks(); if (loaded.locked) throw new Error("Görev bilgilerine şu anda erişemedim.");
    let entries = loaded.entries;
    if (action.type === "create_task") entries = [{ id: crypto.randomUUID(), completed: false, priority: "normal", reminder: false, ...patch(action, shapes.create_task) } as Task, ...entries];
    else if (action.type === "delete_task") entries = entries.filter((task) => task.id !== action.taskId);
    else if (action.type === "complete_task") entries = entries.map((task) => task.id === action.taskId && !task.completed ? completeOccurrence(task) : task);
    else if (action.type === "update_task") entries = entries.map((task) => task.id === action.taskId ? { ...task, ...patch(action, shapes.create_task) } : task);
    if (!saveTasks(entries, loaded)) throw new Error("Görev kaydedilemedi."); if(action.type==="delete_task"&&current)offerUndo({source:"tasks",record:current as Task}); return "Görev işlemi tamamlandı.";
  }
  if (action.type.includes("note")) {
    const loaded = loadNotes(); if (loaded.error) throw new Error("Not bilgilerine şu anda erişemedim."); let notes = loaded.notes;
    if (action.type === "create_note") notes = [{ id: crypto.randomUUID(), title: action.title, content: action.content, ...patch(action,["projectId","workspaceId"]), updatedAt: Date.now() }, ...notes];
    else if (action.type === "update_note") notes = notes.map((note) => note.id === action.noteId ? { ...note, ...patch(action, ["title", "content", "projectId", "workspaceId"]), updatedAt: Date.now() } : note);
    else if (action.type === "delete_note") notes = notes.filter((note) => note.id !== action.noteId);
    if (!saveNotes(notes)) throw new Error("Not kaydedilemedi."); if(action.type==="delete_note"&&current)offerUndo({source:"notes",record:current as import("./notesStore").Note}); return "Not işlemi tamamlandı.";
  }
  const loaded = loadArchive(); if (loaded.locked) throw new Error("Arşiv bilgilerine şu anda erişemedim."); let entries = loaded.entries;
  if (action.type === "create_archive") entries = [{ id: crypto.randomUUID(), title: action.title, category: action.category, description: action.description, date: action.date ?? null, tags: action.tags ?? [], file: null, createdAt: Date.now(), updatedAt: Date.now() }, ...entries];
  else if (action.type === "update_archive") entries = entries.map((entry) => entry.id === action.archiveId ? { ...entry, ...patch(action, shapes.create_archive), updatedAt: Date.now() } : entry);
  else if (action.type === "delete_archive") entries = entries.filter((entry) => entry.id !== action.archiveId);
  if (!saveArchive(entries, loaded)) throw new Error("Arşiv kaydı kaydedilemedi."); if(action.type==="delete_archive"&&current)offerUndo({source:"archive",record:current as import("./archiveStore").ArchiveEntry}); return "Arşiv işlemi tamamlandı. Gerçek dosyalar değiştirilmedi.";
}
