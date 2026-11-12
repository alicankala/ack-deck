import { useRef, useState } from "react";
import { MAX_ATTACHMENT } from "../../shared/phone";
import { createAttachmentSender } from "./sendFlow";
import { api, json, type MobileState } from "./store";

type UseMobileSendParams = {
  audio: Blob | null;
  setAudio: (blob: Blob | null) => void;
  stateRef: { current: MobileState };
  lockedRef: { current: boolean };
  sendingRef: { current: boolean };
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setError: (error: string) => void;
  setNotice: (notice: string) => void;
  refresh: (value?: MobileState, silent?: boolean) => Promise<void>;
};

/** Quick-send attachment/voice upload and text/link/AI-prompt inbox relay flows. */
export function useMobileSend({
  audio,
  setAudio,
  stateRef,
  lockedRef,
  sendingRef,
  busy,
  setBusy,
  setError,
  setNotice,
  refresh,
}: UseMobileSendParams) {
  const [sendFeedback, setSendFeedback] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const attachmentSender = useRef<ReturnType<typeof createAttachmentSender> | null>(null);

  if (!attachmentSender.current) {
    attachmentSender.current = createAttachmentSender(async (blob, fileName, id) => {
      if (!navigator.onLine) throw new Error("Dosya göndermek için internet gerekir. İçeriğin burada korunuyor.");
      if (!blob.size || blob.size > MAX_ATTACHMENT) throw new Error("Dosya boş olamaz ve en fazla 10 MB olabilir.");
      await api(stateRef.current, "attachments", {
        method: "POST",
        headers: {
          "Content-Type": blob.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(fileName),
          "X-Request-Id": id,
        },
        body: blob,
      });
    });
  }

  async function upload(blob: Blob, fileName: string): Promise<boolean> {
    if (sendingRef.current || busy || lockedRef.current) return false;
    sendingRef.current = true;
    setBusy(true);
    setError("");
    let success = false;
    try {
      success = await attachmentSender.current!(blob, fileName);
      if (success) {
        setNotice("Dosya gönderildi.");
        setSendFeedback("Dosya bilgisayarına gönderildi. Bulutta 30 gün saklanır.");
        if (blob === audio) setAudio(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dosya gönderilemedi. İçeriğin burada korunuyor; tekrar deneyebilirsin.");
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
    if (success) void refresh();
    return success;
  }

  async function handleSendText(kind: "text" | "link" | "ai_prompt", text: string): Promise<boolean> {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (!navigator.onLine) {
      setError("Bu gönderi için internet gerekir. Metniniz burada korunuyor.");
      return false;
    }
    if (sendingRef.current || busy || lockedRef.current) return false;
    sendingRef.current = true;
    setBusy(true);
    setError("");
    try {
      const id = crypto.randomUUID();
      const firstLine = trimmed.split("\n")[0].slice(0, 100);
      const itemTitle =
        kind === "link"
          ? trimmed.slice(0, 100)
          : firstLine || (kind === "ai_prompt" ? "ACK AI İstemi" : "Metin Notu");
      await api(stateRef.current, "inbox", json({ id, kind, title: itemTitle, content: trimmed }));
      setNotice("Gönderildi.");
      setSendFeedback(
        kind === "ai_prompt"
          ? "ACK AI görevi bilgisayarına gönderildi."
          : kind === "link"
          ? "Bağlantı bilgisayarına gönderildi."
          : "Metin bilgisayarına gönderildi."
      );
      void refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gönderilemedi.");
      return false;
    } finally {
      sendingRef.current = false;
      setBusy(false);
    }
  }

  return {
    sendFeedback,
    setSendFeedback,
    selectedFile,
    setSelectedFile,
    upload,
    handleSendText,
  };
}
