import { useEffect, useRef, useState, type Dispatch, type FormEvent, type KeyboardEvent, type SetStateAction } from "react";
import { getSavedAiModel, saveAiModel } from "../aiModelPreference";
import {
  aiErrorMessage,
  getGeminiKeyStatus,
  sendGeminiMessage,
  type AiMessage,
  type AiModel,
} from "../geminiClient";
import { createConfirmation, claimConfirmation, cancelConfirmation, type PendingConfirmation } from "../ackConfirmation";
import { chooseAiAttachment, attachmentError, previewAiImage, pasteAiImage, releaseAiAttachment, type AiAttachment } from "../aiAttachments";
import { withAiTimeout } from "../aiTimeout";
import { localAiDestination } from "../localAiRouting";
import { Icon } from "./Icon";
import { collectAckContext, executeAckAction, proposeAckAction, redactSecrets, SOURCE_LABELS } from "../ackIntegration";
import { isActionRequest, proposalFromTool } from "../ackActions";
import type { NavigationTarget } from "../navigation";
import { takeDashboardPrompt, type AiPromptHandoff } from "../aiPromptHandoff";

type Props = {
  prefill?: { id: string; text: string };
  onPrefillConsumed?: () => void;
  blocked?: boolean;
  onNewChat?: () => void;
  onBusyChange?: (busy: boolean) => void;
  messages: AiMessage[];
  onMessagesChange: Dispatch<SetStateAction<AiMessage[]>>;
  onOpenSettings: () => void;
  onNavigate: (target: NavigationTarget) => void;
  initialPrompt?: AiPromptHandoff;
  onPromptConsumed: (id: string) => void;
};

const starters = [
  { icon: "check", title: "Günümü planla", text: "Bugünkü görevlerim neler?", hint: "Görevlerine birlikte bakalım" },
  { icon: "note", title: "Notlarımı bul", text: "Notlarımı listele.", hint: "Kayıtlarından devam et" },
  { icon: "plus", title: "Bir görev oluştur", text: "Yeni görev: ", hint: "Yapacaklarını sıraya koy" },
  { icon: "spark", title: "Bir fikri geliştir", text: "Şu fikri birlikte geliştirelim: ", hint: "Birlikte düşün, netleştir" },
] as const;

export function AckAi({ messages, onMessagesChange, onOpenSettings, onNavigate, initialPrompt, onPromptConsumed, onNewChat, onBusyChange, blocked = false, prefill, onPrefillConsumed }: Props) {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [draft, setDraft] = useState(prefill?.text ?? initialPrompt?.text ?? "");
  useEffect(() => { if (prefill) { setDraft(prefill.text); onPrefillConsumed?.(); } }, [prefill?.id]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [model, setModel] = useState<AiModel>(getSavedAiModel);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [attachment, setAttachment] = useState<AiAttachment | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState("");
  const [attaching, setAttaching] = useState(false);
  const attachmentRef = useRef<AiAttachment | null>(null);
  attachmentRef.current = attachment;
  useEffect(() => () => { if (attachmentRef.current) void releaseAiAttachment(attachmentRef.current.id).catch(() => {}); }, []);
  async function addAttachment(file?: File) {
    if (sending || attaching || pending) return; setAttaching(true);
    const requestId = generation.current;
    try { const next = file ? await pasteAiImage(file) : await chooseAiAttachment(); if (next) { if (requestId !== generation.current) { await releaseAiAttachment(next.id); return; } if (attachmentRef.current) await releaseAiAttachment(attachmentRef.current.id); setAttachment(next); setAttachmentPreview(""); if (next.mime.startsWith("image/")) { const preview = await previewAiImage(next.id).catch(() => ""); if (requestId === generation.current) setAttachmentPreview(preview); } } }
    catch (reason) { setError(attachmentError(reason)); } finally { setAttaching(false); }
  }
  function removeAttachment() { if (attachment) void releaseAiAttachment(attachment.id).catch(() => {}); setAttachment(null); setAttachmentPreview(""); }
  const actionBusy = useRef(false);
  const sendBusy = useRef(false);
  const generation = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => cancelConfirmation(pending), [pending]);
  const consumedPrompt = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    getGeminiKeyStatus()
      .then((saved) => { if (active) setHasKey(saved); })
      .catch((reason: unknown) => { if (active) setError(aiErrorMessage(reason)); });
    return () => { active = false; generation.current++; };
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [messages, sending]);
  function isLocal(text: string) { try { return !!localAiDestination(text) || !!proposeAckAction(text); } catch { return false; } }
  useEffect(() => {
    if (sendBusy.current || pending) return;
    const text = takeDashboardPrompt(initialPrompt, hasKey || !!(initialPrompt && isLocal(initialPrompt.text)), consumedPrompt);
    if (text !== null) { onPromptConsumed(initialPrompt!.id); void sendText(text); }
  }, [hasKey, initialPrompt?.id]);

  useEffect(() => { onBusyChange?.(sending || attaching); return () => onBusyChange?.(false); }, [sending, attaching, onBusyChange]);

  function newChat() {
    generation.current += 1;
    if (onNewChat) onNewChat(); else onMessagesChange([]);
    setDraft("");
    removeAttachment();
    setError("");
    setSending(false);
    cancelConfirmation(pending); setPending(null);
    sendBusy.current = false;
    if (initialPrompt) { consumedPrompt.current = initialPrompt.id; onPromptConsumed(initialPrompt.id); }
  }

  function chooseModel(choice: AiModel) {
    setModel(choice);
    saveAiModel(choice);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (initialPrompt) { consumedPrompt.current = initialPrompt.id; onPromptConsumed(initialPrompt.id); }
    await sendText(draft.trim());
  }
  async function sendText(text: string) {
    if (!text || sendBusy.current || pending || attaching || blocked) return;
    const requestId = generation.current;
    const next: AiMessage[] = [...messages, { role: "user", text: redactSecrets(text), ...(attachment ? { attachments: [{ name: attachment.name, mime: attachment.mime, size: attachment.size }] } : {}) }];
    onMessagesChange(next);
    setDraft("");
    setError("");
    sendBusy.current = true;
    setSending(true);
    try {
      const destination = !attachment ? localAiDestination(text) : null;
      if (destination) { onMessagesChange([...next, { role: "model", text: "Yerel komut: ilgili sayfa açıldı." }]); onNavigate(destination); return; }
      const proposal = !attachment ? proposeAckAction(text) : null;
      if (proposal) {
        if (proposal.action.type === "navigate") { const result = "ACKDeck sayfası açıldı."; onMessagesChange([...next, { role: "model", text: "Yerel komut: " + result }]); onNavigate({ page: proposal.action.page }); return; }
        setPending(createConfirmation(proposal)); onMessagesChange([...next, { role: "model", text: proposal.question, sources: proposal.action.type === "open_workspace" ? ["workspaces"] : proposal.action.type === "open_shortcut" ? ["shortcuts"] : [] }]); return;
      }
      if (!hasKey) { setError("Gemini API anahtarını Ayarlar bölümünden ekleyin."); return; }
      const { context, warnings } = await collectAckContext(text);
      if (requestId !== generation.current) return;
      const actionRequest = isActionRequest(text);
      const reply = await sendGeminiMessage(next, model, context, actionRequest && !attachment, attachment ? [attachment.id] : []);
      if (requestId === generation.current) {
        removeAttachment();
        const proposal = reply.action ? proposalFromTool(reply.action, text) : null;
        if (proposal?.action.type === "navigate") { await executeAckAction(proposal.action, false, undefined, onNavigate); return; }
        if (proposal) setPending(createConfirmation(proposal));
        onMessagesChange((current) => [...current, { role: "model", text: proposal ? proposal.question : actionRequest ? "Uygulanabilir bir işlem taslağı hazırlanamadı. Hiçbir işlem yapılmadı. Tam kayıt adını ve istediğin değişikliği belirt." : redactSecrets(reply.text), sources: [...new Set(context.map((item) => item.source))] }]);
        if (warnings.length) setError(warnings.join(" "));
      }
    } catch (reason) {
      if (requestId === generation.current) setError(reason instanceof Error && reason.message === "Mesaj çok uzun. Daha kısa bir mesaj yazın." ? reason.message : reason instanceof Error ? "AI işlem taslağı hazırlanamadı. Geçerli kayıt, tarih ve saat bilgisi verin. Hiçbir değişiklik yapılmadı." : aiErrorMessage(reason));
    } finally {
      if (requestId === generation.current) { setSending(false); sendBusy.current = false; }
    }
  }

  async function confirmAction() {
    if (!pending || actionBusy.current) return;
    const requestId = generation.current;
    actionBusy.current = true;
    setSending(true);
    try {
      const approved = claimConfirmation(pending); setPending(null);
      let destination: NavigationTarget | undefined;
      const result = await withAiTimeout(executeAckAction(approved.action, true, undefined, (target) => { destination = target; }, approved.expected));
      if (requestId === generation.current) { onMessagesChange((current) => [...current, { role: "model", text: result }]); setPending(null); if (destination) onNavigate(destination); }
    } catch (reason) {
      if (requestId === generation.current) { setPending(null); setError(reason instanceof Error ? reason.message : "İşlem tamamlanamadı."); }
    } finally {
      actionBusy.current = false;
      if (requestId === generation.current) setSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return <div className="ai-page">
    <header className="feature-heading ai-heading">
      <div className="ai-page-title"><span className="ai-page-mark"><Icon name="spark" size={24}/></span><div><h1>ACK AI</h1><p>Düşün, planla, harekete geç.</p></div></div>
      {!onNewChat && <button className="button button-secondary" type="button" onClick={newChat} disabled={blocked || attaching || actionBusy.current || (messages.length === 0 && !draft && !error)}>
        <Icon name="plus" size={17} /> Yeni sohbet
      </button>}
    </header>
    <section className="ai-panel surface" aria-label="ACK AI sohbeti">
      <div className="ai-messages" aria-live="polite">
        {messages.length === 0 ? <div className="ai-empty">
          <div className="ai-empty-icon"><Icon name="spark" size={28} /></div>
          <h2>Ne yapmak istersin?</h2>
          <p>Gününü planla, bir fikri netleştir ya da kayıtlarınla çalış.</p>
          <div className="ai-starter-grid">{starters.map(starter=><button type="button" className="ai-starter-card" key={starter.title} disabled={blocked || sending || attaching || !!pending} onClick={()=>{setDraft(starter.text);document.getElementById("ai-prompt")?.focus();}}><Icon name={starter.icon} size={22}/><strong>{starter.title}</strong><small>{starter.hint}</small><span aria-hidden="true">↗</span></button>)}</div>
          {hasKey === false && <div className="ai-connect-card"><Icon name="info" size={18}/><div><strong>Yerel komutlar hazır</strong><p>Serbest sohbet için Gemini anahtarını bağla.</p></div><button className="button button-secondary" type="button" onClick={onOpenSettings}>Bağla</button></div>}
        </div> : messages.map((message, index) => <div className={"ai-message " + message.role} key={index}>
          <span className="ai-avatar">{message.role === "user" ? "S" : <Icon name="spark" size={18} />}</span>
          <div className="ai-message-body"><span className="ai-message-label">{message.role === "user" ? "Sen" : "ACK AI"}</span><div className="ai-bubble">{message.text}</div>{message.attachments?.map((file, i) => <small className="ai-source" key={i}>Ek: {file.name} · {file.mime} · {Math.ceil(file.size / 1024)} KB</small>)}{!!message.sources?.length && <small className="ai-source">ACKDeck verileri kullanıldı: {message.sources.map((source) => SOURCE_LABELS[source]).join(", ")}</small>}</div>
        </div>)}
        {pending && <div className="ai-confirm" role="group" aria-label="ACK AI işlem onayı"><p>{pending.question}</p><button className="button button-primary" type="button" onClick={confirmAction} disabled={sending}>{pending.action.type === "open_workspace" ? "Çalışmaya Başla" : "Onayla"}</button><button className="button button-secondary" type="button" onClick={() => { cancelConfirmation(pending); setPending(null); setError(""); onMessagesChange((current) => [...current, { role: "model", text: "İşlem iptal edildi. Değişiklik yapılmadı." }]); }} disabled={sending}>İptal</button></div>}
        {sending && <div className="ai-message model"><span className="ai-avatar"><Icon name="spark" size={18} /></span><div className="ai-message-body"><span className="ai-message-label">ACK AI</span><div className="ai-bubble ai-loading" role="status">{pending ? "İşlem uygulanıyor" : "Yanıt hazırlanıyor"}<span className="loading-dots">...</span></div></div></div>}
        <div ref={bottomRef} />
      </div>
      {error && <div className="ai-error" role="alert"><Icon name="info" size={17} />{error}</div>}
      <form className="ai-composer" onSubmit={send}>
        <div className="ai-attachment-row"><button className="button button-secondary" type="button" disabled={blocked || sending || attaching || !!pending} onClick={() => void addAttachment()}>{attaching ? "Dosya hazırlanıyor..." : "Dosya Ekle"}</button><details className="advanced-fields"><summary>Desteklenen dosyalar</summary><small>PNG, JPEG, WebP, PDF veya UTF-8 TXT · En fazla 8 MB · TXT: 128 KB</small></details>{attachment && <div role="status">{attachmentPreview && <img className="ai-attachment-preview" src={attachmentPreview} alt="Gönderilecek görüntünün önizlemesi" />}<strong>{attachment.name}</strong> · {attachment.mime} · {Math.ceil(attachment.size / 1024)} KB<p>Bu dosya Gemini'ye gönderilecek. Gönder düğmesine basılmadan iletilmez.</p><button type="button" disabled={sending} onClick={removeAttachment}>Dosyayı kaldır</button></div>}</div>
        <label className="sr-only" htmlFor="ai-prompt">ACK AI mesajı</label>
        <textarea id="ai-prompt" value={draft} onChange={(event) => setDraft(event.target.value)} onPaste={event => { const file = Array.from(event.clipboardData.files).find(item => item.type.startsWith("image/")); if (file) { event.preventDefault(); void addAttachment(file); } }} onKeyDown={handleKeyDown} placeholder={pending ? "Önce işlemi onaylayın veya iptal edin" : hasKey ? "Mesajını yaz..." : "Yerel komut yazabilir veya Ayarlar'dan Gemini anahtarı ekleyebilirsin"} maxLength={8000} rows={3} disabled={sending || !!pending} />
        <div className="ai-composer-bottom"><label className="ai-model-picker"><Icon name="spark" size={16}/><span className="sr-only">Yanıt modeli</span><select value={model} onChange={event=>chooseModel(event.target.value as AiModel)} disabled={sending || blocked}><option value="fast">Hızlı model</option><option value="powerful">Güçlü model</option></select></label><button className="button button-primary" type="submit" disabled={blocked || sending || attaching || !!pending || !draft.trim()}>Gönder <Icon name="arrowRight" size={16} /></button></div>
        <div className="ai-composer-help"><small>Enter ile gönder · Shift+Enter ile yeni satır</small><details className="ai-privacy"><summary>Gizlilik ve kullanım</summary><p>Mesajın ve yalnızca ilgili ACKDeck verileri Gemini'ye gönderilir. Seçtiğin dosya yalnız Gönder ile iletilir. İşlemler için onayın istenir; sohbet geçmişi bu bilgisayarda saklanır. Güçlü modelin ücretsiz kotası daha sınırlı olabilir.</p></details></div>
      </form>
    </section>
  </div>;
}
