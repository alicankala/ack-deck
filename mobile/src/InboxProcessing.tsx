import { ActionMenu } from "../../src/components/ActionMenu";
import { useState, useRef } from "react";
import type { CloudRecord, Mutation, PhoneNote, PhoneProject } from "../../shared/phone";
import { validAttachments, type AttachmentReference } from "../../shared/productivity";
export type SentItem = {
    id: string;
    title: string;
    kind: string;
    content: string;
    mime: string | null;
    size?: number | null;
    handled: number;
};
export function MobileInboxProcessing({ item, records, onSave, onHandled }: {
    item: SentItem;
    records: CloudRecord[];
    onSave: (mutation: Mutation) => Promise<void>;
    onHandled: () => Promise<void>;
}) {
    const [mode, setMode] = useState(""), [title, setTitle] = useState(item.title), [content, setContent] = useState(item.kind === "file" ? "" : item.content), [target, setTarget] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), running = useRef(false), draftId = useRef(crypto.randomUUID());
    const projects = records.filter(r => r.kind === "projects" && !r.deleted), notes = records.filter(r => r.kind === "notes" && !r.deleted);
    async function create() { if (running.current)
        return; running.current = true; setBusy(true); try {
        let mutation: Mutation;
        const attachment: AttachmentReference | undefined = item.kind === "file" ? { id: item.id, name: item.title, mime: item.mime ?? "", size: item.size ?? 0 } : undefined;
        if (attachment && !validAttachments([attachment]))
            throw Error("Dosya bilgisi doğrulanamadı.");
        if (mode === "project") {
            const row = projects.find(r => r.id === target);
            if (!row)
                throw Error("Bir proje seç.");
            const p = row.data as PhoneProject;
            mutation = { mutationId: draftId.current, kind: "projects", id: row.id, baseVersion: row.version, deleted: false, data: { ...p, inboxIds: [...new Set([...p.inboxIds, item.id])] } };
        }
        else if (mode === "task") {
            mutation = { mutationId: draftId.current, kind: "tasks", id: draftId.current, baseVersion: 0, deleted: false, data: { text: title.trim(), completed: false, dueDate: null, dueTime: null, priority: "normal", reminder: false, dueAt: null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, sourceInboxId: item.id } };
        }
        else {
            const row = mode === "append" ? notes.find(r => r.id === target) : undefined;
            if (mode === "append" && !row)
                throw Error("Bir not seç.");
            const previous = row?.data as PhoneNote | undefined;
            const attachments = [...(previous?.attachments ?? []), ...(attachment && !previous?.attachments?.some(a => a.id === item.id) ? [attachment] : [])];
            mutation = { mutationId: draftId.current, kind: "notes", id: row?.id ?? draftId.current, baseVersion: row?.version ?? 0, deleted: false, data: { ...previous, title: previous?.title ?? title.trim(), content: previous ? [previous.content, content].filter(Boolean).join("\n\n") : content, updatedAt: Date.now(), sourceInboxId: previous?.sourceInboxId ?? item.id, ...(attachments.length ? { attachments } : {}) } };
        }
        await onSave(mutation);
        setMode("");
        setError("");
        draftId.current = crypto.randomUUID();
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Kaydedilemedi. İçeriğin burada.");
    }
    finally {
        running.current = false;
        setBusy(false);
    } }
    return <div className="mobile-inbox-actions"><ActionMenu label={item.title + " işlemleri"}>{[["task", "Göreve dönüştür"], ["note", "Nota dönüştür"], ["append", "Mevcut nota ekle"], ["project", "Projeye bağla"]].map(([value, label]) => <button key={value} disabled={busy} onClick={() => { setMode(value); setTarget(""); draftId.current = crypto.randomUUID(); }}>{label}</button>)}<button disabled={busy || !!item.handled} onClick={() => { if (running.current)
        return; running.current = true; setBusy(true); void onHandled().catch(e => setError(e.message)).finally(() => { running.current = false; setBusy(false); }); }}>İşlendi olarak işaretle</button></ActionMenu>{mode && <form className="mobile-processing-form" onSubmit={e => { e.preventDefault(); void create(); }}><strong>{mode === "task" ? "Görev taslağı" : mode === "project" ? "Proje bağlantısı" : "Not taslağı"}</strong>{mode === "append" || mode === "project" ? <label>{mode === "project" ? "Proje" : "Not"}<select required value={target} onChange={e => { setTarget(e.target.value); draftId.current = crypto.randomUUID(); }}><option value="">Seç…</option>{(mode === "project" ? projects : notes).map(r => <option key={r.id} value={r.id}>{r.kind === "projects" ? (r.data as PhoneProject).name : (r.data as PhoneNote).title}</option>)}</select></label> : <label>Başlık<input required value={title} maxLength={160} onChange={e => { setTitle(e.target.value); draftId.current = crypto.randomUUID(); }}/></label>}{mode !== "project" && mode !== "task" && <label>{item.kind === "file" ? "Açıklama" : "İçerik"}<textarea value={content} maxLength={20000} onChange={e => { setContent(e.target.value); draftId.current = crypto.randomUUID(); }}/></label>}{attachmentInfo(item) && mode !== "project" && <small>Orijinal içerik Gönderilenler'de korunur; dosyanın bulut süresi 30 gündür.</small>}<div className="actions"><button disabled={busy}>Kaydet</button><button type="button" disabled={busy} onClick={() => setMode("")}>Vazgeç</button></div></form>}{error && <p className="error" role="alert">{error}</p>}</div>;
}
function attachmentInfo(item: SentItem) { return item.kind === "file"; }
