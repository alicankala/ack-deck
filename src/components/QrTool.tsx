import { useRef, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { toCanvas } from "qrcode";
import { Icon } from "./Icon";

export function QrTool() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [text, setText] = useState("");
  const [generated, setGenerated] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    if (!value) { setMessage("QR kodu için metin veya URL girin."); return; }
    if (!canvasRef.current) return;
    setBusy(true);
    setMessage("");
    try {
      await toCanvas(canvasRef.current, value, { width: 320, margin: 3, errorCorrectionLevel: "M", color: { dark: "#111820", light: "#ffffffff" } });
      setGenerated(value);
    } catch {
      setGenerated("");
      setMessage("Bu metin için QR kodu oluşturulamadı. Daha kısa bir metin deneyin.");
    } finally {
      setBusy(false);
    }
  }

  async function savePng() {
    const canvas = canvasRef.current;
    if (!canvas || !generated || generated !== text.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const path = await save({ title: "QR kodunu kaydet", defaultPath: "ACKDeck-QR.png", filters: [{ name: "PNG", extensions: ["png"] }] });
      if (!path) return;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("PNG oluşturulamadı.");
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      await invoke("save_qr_png", { path, bytes });
      setMessage("QR kodu PNG olarak kaydedildi.");
    } catch {
      setMessage("PNG kaydedilemedi. Başka bir konum deneyin.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="qr-page">
    <header className="feature-heading"><h1>QR Oluşturucu</h1><p>Metin veya URL'yi bilgisayarında QR koda dönüştür.</p></header>
    <div className="qr-layout">
      <form className="qr-input-card surface" onSubmit={generate}>
        <label htmlFor="qr-text">Metin veya URL</label>
        <textarea id="qr-text" value={text} onChange={(event) => { setText(event.target.value); setMessage(""); }} placeholder="QR'a dönüştürülecek metni yaz..." rows={7} maxLength={1500} />
        <p>QR kodu oluşturmak için internet bağlantısı kullanılmaz.</p>
        <button className="button button-primary" type="submit" disabled={busy}>QR Oluştur <Icon name="arrowRight" size={16} /></button>
      </form>
      <section className="qr-output-card surface" aria-label="QR kod önizlemesi">
        <h2>Önizleme</h2>
        <div className="qr-preview">{!generated && <span>QR kodu burada görünecek</span>}<canvas ref={canvasRef} role="img" aria-label="Oluşturulan QR kodu" style={{ display: generated ? "block" : "none" }} /></div>
        {generated && generated !== text.trim() && <p className="qr-changed">Metin değişti. Kaydetmeden önce yeniden QR oluştur.</p>}
        <button className="button button-secondary" type="button" onClick={savePng} disabled={busy || !generated || generated !== text.trim()}>PNG Olarak Kaydet</button>
      </section>
    </div>
    {message && <div className={"tool-feedback " + (message.includes("kaydedildi") ? "success" : "error")} role="status">{message}</div>}
  </div>;
}
