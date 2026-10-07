import { ActionMenu } from "./ActionMenu";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cachePhoneFile, downloadPhoneFile, phoneRequest, phoneAiAttachment } from "../phoneClient";
import type { AiAttachment } from "../aiAttachments";
import { loadNotes, saveNotes, type NoteAttachment } from "../notesStore";
import { validUrl } from "../../shared/phone";
import { EditorDialog } from "./EditorDialog";
import { PhoneMedia } from "./PhoneMedia";
type Inbox = {id:string;kind:string;title:string;content:string;mime:string|null;size:number|null;expiresAt:number|null;handled:number;createdAt:number};
const isAudio = (item:Inbox) => item.mime?.startsWith("audio/");
const fileInfo = (item:Inbox):NoteAttachment => ({id:item.id,name:item.title,mime:item.mime??"",size:item.size??0});
export function PhoneInbox({onAiDraft}:{onAiDraft:(text:string,attachment?:AiAttachment)=>void}) {
  const [items,setItems]=useState<Inbox[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  const [preview,setPreview]=useState<Inbox|null>(null),[draft,setDraft]=useState<Inbox|null>(null),[title,setTitle]=useState(""),[content,setContent]=useState("");
  const operation=useRef(false), noteId=useRef("");
  async function refresh(){if(operation.current)return;operation.current=true;setBusy(true);try{setItems((await phoneRequest<{items:Inbox[]}>("inbox")).items);setError("");}catch{setError("Telefon gelenleri alınamadı. Entegrasyonu ve internet bağlantısını kontrol edin.");}finally{operation.current=false;setBusy(false);}}
  useEffect(()=>{void refresh();},[]);
  async function action(fn:()=>Promise<unknown>){if(operation.current)return;operation.current=true;setBusy(true);setError("");try{await fn();}catch(reason){setError(typeof reason==="string"?reason:reason instanceof Error?reason.message:"Gönderi işlemi tamamlanamadı.");}finally{operation.current=false;setBusy(false);}}
  function addNote(item:Inbox){noteId.current=crypto.randomUUID();setTitle(item.title);setContent(item.kind==="file"?"":item.content);setDraft(item);setError("");}
  function closeDraft(){if(busy)return;if(draft&&(title!==draft.title||content!==(draft.kind==="file"?"":draft.content))&&!window.confirm("Not oluşturulmadan kapatılsın mı?"))return;setDraft(null);}
  async function createNote(event:FormEvent){event.preventDefault();if(!draft)return;const source=draft;await action(async()=>{
    const loaded=loadNotes();if(loaded.error)throw new Error(loaded.error);
    const attachments=source.kind==="file"?[await cachePhoneFile(source.id,source.title)]:undefined;
    // Sync can edit notes while the attachment downloads; reload before saving.
    const latest=loadNotes();if(latest.error)throw new Error(latest.error);
    const note={id:noteId.current,title:title.trim()||"Başlıksız not",content,updatedAt:Date.now(),...(attachments?{attachments}:{})};
    if(!saveNotes([note,...latest.notes.filter(row=>row.id!==note.id)]))throw new Error("Not kaydedilemedi. İçeriğiniz burada korunuyor; tekrar deneyebilirsiniz.");
    setDraft(null);setNotice("Notlar'a eklendi. Başlık ve açıklamayı Notlar'dan düzenleyebilirsiniz.");
  });}
  return <section className="hub-page inbox-page" data-navigation-dirty={busy?"true":undefined}><header className="feature-heading page-header"><div><h1>Gelenler</h1><p>Telefondan gönderdiğiniz içerikleri açın, dinleyin veya notlarınıza ekleyin.</p></div><button className="button button-secondary" disabled={busy} onClick={()=>void refresh()}>Yenile</button></header>
    {error&&!draft&&<p className="feedback error" role="alert">{error}</p>}{notice&&<p className="feedback" role="status">{notice}</p>}{!items.length&&!error&&<p>Gelenler henüz boş.</p>}
    <div className="inbox-grid">{items.map(item=>{const expired=!!item.expiresAt&&item.expiresAt<Date.now();return <article className="surface hub-card inbox-card" key={item.id}>
      <div className="inbox-card-heading"><span className="inbox-kind">{item.kind==="file"?isAudio(item)?"Sesli not":item.mime==="application/pdf"?"PDF":item.mime?.startsWith("image/")?"Fotoğraf":"Dosya":item.kind==="link"?"Bağlantı":item.kind==="ai_prompt"?"ACK AI":"Metin"}</span><span>{item.handled?"İşlendi":"Bekliyor"}</span></div><h2>{item.title}</h2><time>{new Date(item.createdAt).toLocaleString("tr-TR")}</time>
      {item.kind==="file"?<p>{item.size?`${Math.ceil(item.size/1024)} KB · `:""}{expired?"Buluttaki saklama süresi dolmuş.":"Bulutta 30 gün saklanır."}</p>:<p className="phone-inbox-content">{item.content}</p>}
      {preview?.id===item.id&&<PhoneMedia file={fileInfo(item)}/>}
      <div className="hub-actions">{item.kind==="file"?<button className="button button-primary" disabled={busy} onClick={()=>setPreview(preview?.id===item.id?null:item)}>{preview?.id===item.id?"Önizlemeyi kapat":isAudio(item)?"Dinle":"Önizle"}</button>:item.kind==="ai_prompt"?<button className="button button-primary" disabled={busy} onClick={()=>onAiDraft(item.content)}>ACK AI'da aç</button>:item.kind==="link"?<button className="button button-primary" disabled={busy||!validUrl(item.content)} onClick={()=>void action(()=>openUrl(item.content))}>Bağlantıyı aç</button>:<button className="button button-primary" disabled={busy} onClick={()=>void action(async()=>{await navigator.clipboard.writeText(item.content);setNotice("Metin kopyalandı.");})}>Kopyala</button>}
      <ActionMenu label={item.title+" işlemleri"}>
        {item.kind==="file"&&["image/png","image/jpeg","image/webp","application/pdf","text/plain"].includes(item.mime??"")&&!!item.size&&item.size<=8*1024*1024&&(item.mime!=="text/plain"||item.size<=128*1024)&&<button disabled={busy} onClick={()=>void action(async()=>{await cachePhoneFile(item.id,item.title);const attachment=await phoneAiAttachment(item.id);onAiDraft("Bu dosyayı incelememe yardımcı olur musun?",attachment);})}>ACK AI'da aç</button>}
        <button disabled={busy} onClick={()=>addNote(item)}>Notlara ekle</button>
        {item.kind==="file"?<button disabled={busy||expired} onClick={()=>void action(async()=>{if(await downloadPhoneFile(item.id,item.title))setNotice("Dosya bilgisayara kaydedildi.");})}>Bilgisayara kaydet</button>:<><button disabled={busy} onClick={()=>void action(async()=>{await navigator.clipboard.writeText(item.content);setNotice("Kopyalandı.");})}>Kopyala</button>{item.kind!=="ai_prompt"&&<button disabled={busy} onClick={()=>onAiDraft(item.content)}>ACK AI'da aç</button>}</>}
        <button disabled={busy||!!item.handled} onClick={()=>void action(async()=>{await phoneRequest("handled",{id:item.id});setItems(rows=>rows.map(row=>row.id===item.id?{...row,handled:1}:row));})}>İşlendi olarak işaretle</button>
        <button className="danger-action" disabled={busy} onClick={()=>{if(window.confirm("Bu gelen buluttan silinsin mi? Notlara eklenmiş ve bilgisayara kaydedilmiş dosyalar silinmez."))void action(async()=>{await phoneRequest("delete_inbox",{id:item.id});setItems(rows=>rows.filter(row=>row.id!==item.id));if(preview?.id===item.id)setPreview(null);});}}>Bulut kaydını sil</button>
      </ActionMenu></div></article>;})}</div>
    {draft&&<EditorDialog title="Notlara ekle" description={draft.kind==="file"?"Dosyanın kalıcı bir kopyası bu bilgisayardaki nota eklenir. Buluttaki süre dolsa da burada kalır.":"İçeriği yeni bir not olarak kaydedin."} busy={busy} error={error} onClose={closeDraft}><form className="inbox-note-form" onSubmit={event=>void createNote(event)}><label>Not başlığı<input autoFocus value={title} maxLength={160} onChange={event=>setTitle(event.target.value)} disabled={busy}/></label><label>{draft.kind==="file"?"Kısa açıklama":"Not içeriği"}<textarea value={content} maxLength={20000} rows={4} onChange={event=>setContent(event.target.value)} disabled={busy}/></label>{draft.kind==="file"&&<p className="inbox-note-file">Ek: {draft.title}</p>}<div className="editor-actions"><button className="button button-primary" disabled={busy}>{busy?"Ekleniyor…":"Notu oluştur"}</button><button type="button" className="button button-secondary" disabled={busy} onClick={closeDraft}>Vazgeç</button></div></form></EditorDialog>}
  </section>;
}
