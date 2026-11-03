import { useState, useRef, type ChangeEvent, type DragEvent } from "react";
import {
  type ConverterMode,
  type ConvertedResult,
  type ImageItem,
  type TextConvertType,
  formatSize,
  getAvailableFormats,
  printHtmlDocument,
  convertSingleFile,
  convertTextData,
  combineImagesToPdf,
} from "./fileConverterEngine";

export function FileConverter() {
  const [activeMode, setActiveMode] = useState<ConverterMode>("file");
  const [busy, setBusy] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // File mode state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<string>("");
  const [imageQuality, setImageQuality] = useState<number>(0.85);
  const [imageResizeMax, setImageResizeMax] = useState<string>("original");
  const [result, setResult] = useState<ConvertedResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Text/Data mode state
  const [textInput, setTextInput] = useState("");
  const [textConvertType, setTextConvertType] = useState<TextConvertType>("md2pdf");
  const [textResult, setTextResult] = useState<string>("");
  const [textPdfBlob, setTextPdfBlob] = useState<Blob | null>(null);

  // Multi-image to PDF state
  const [multiImages, setMultiImages] = useState<ImageItem[]>([]);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(file: File) {
    setSelectedFile(file);
    setResult(null);
    setMessage(null);
    const available = getAvailableFormats(file);
    if (available.length > 0) {
      setTargetFormat(available[0].id);
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(true);
  }
  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
  }
  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }

  function downloadBlob(blob: Blob, filename: string) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setMessage({ text: `"${filename}" başarıyla indirildi.`, type: "success" });
    } catch {
      setMessage({ text: "Dosya indirme sırasında hata oluştu.", type: "error" });
    }
  }

  function printDocument(title: string, contentHtml: string) {
    if (!printHtmlDocument(title, contentHtml)) {
      setMessage({ text: "Yazdırma penceresi açılamadı. Lütfen açılır pencerelere izin verin.", type: "error" });
    }
  }

  async function performConversion() {
    if (!selectedFile) return;
    setBusy(true);
    setProgressText("Dönüştürülüyor...");
    setMessage(null);
    try {
      const converted = await convertSingleFile(
        selectedFile,
        targetFormat,
        imageQuality,
        imageResizeMax,
        setProgressText
      );
      setResult(converted);
      setMessage({ text: "Dönüştürme başarıyla tamamlandı!", type: "success" });
    } catch (err) {
      setMessage({
        text: `Dönüştürme sırasında hata oluştu: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`,
        type: "error",
      });
    } finally {
      setBusy(false);
      setProgressText("");
    }
  }

  function handleTextConvert() {
    const val = textInput.trim();
    if (!val) {
      setMessage({ text: "Dönüştürülecek bir metin veya kod girin.", type: "error" });
      return;
    }
    try {
      const out = convertTextData(val, textConvertType);
      setTextResult(out.textResult);
      setTextPdfBlob(out.pdfBlob);
      setMessage({ text: "İşlem tamamlandı!", type: "success" });
    } catch (err) {
      setMessage({ text: `Hata: ${err instanceof Error ? err.message : "Geçersiz biçim"}`, type: "error" });
    }
  }

  function handleMultiImageFiles(e: ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    files.forEach(file => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = event => {
        if (event.target?.result) {
          setMultiImages(prev => [
            ...prev,
            {
              id: crypto.randomUUID(),
              name: file.name,
              size: file.size,
              dataUrl: event.target!.result as string,
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function moveMultiImage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= multiImages.length) return;
    const updated = [...multiImages];
    const item = updated.splice(index, 1)[0];
    updated.splice(target, 0, item);
    setMultiImages(updated);
  }

  function removeMultiImage(id: string) {
    setMultiImages(prev => prev.filter(img => img.id !== id));
  }

  async function generateMultiImagePdf() {
    if (multiImages.length === 0) return;
    setBusy(true);
    setProgressText("PDF sayfaları birleştiriliyor...");
    try {
      const pdfBlob = await combineImagesToPdf(multiImages);
      downloadBlob(pdfBlob, `Gorseller-${Date.now()}.pdf`);
      setMessage({ text: `${multiImages.length} görsel tek bir PDF belgesine dönüştürüldü!`, type: "success" });
    } catch {
      setMessage({ text: "PDF oluşturulurken hata oluştu.", type: "error" });
    } finally {
      setBusy(false);
      setProgressText("");
    }
  }

  return (
    <div className="file-converter-widget">
      {/* Üst Sekmeler */}
      <div className="converter-mode-selector" style={{ display: "flex", gap: "0.4rem", marginBottom: "1rem", borderBottom: "1px solid var(--app-border)", paddingBottom: "0.6rem" }}>
        <button
          type="button"
          className={`converter-tab-btn ${activeMode === "file" ? "is-active" : ""}`}
          onClick={() => setActiveMode("file")}
        >
          📁 Dosya & Belge Çevirici
        </button>
        <button
          type="button"
          className={`converter-tab-btn ${activeMode === "text" ? "is-active" : ""}`}
          onClick={() => setActiveMode("text")}
        >
          📝 Metin & Veri
        </button>
        <button
          type="button"
          className={`converter-tab-btn ${activeMode === "multi-image" ? "is-active" : ""}`}
          onClick={() => setActiveMode("multi-image")}
        >
          🖼️ Görsellerden PDF ({multiImages.length})
        </button>
      </div>

      {/* GİZLİLİK VE BİLGİ ROZETİ */}
      <div className="converter-privacy-badge" style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.55rem 0.85rem", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "0.6rem", fontSize: "0.78rem", color: "#34d399", marginBottom: "1rem" }}>
        <span>🔒</span>
        <span><strong>%100 Yerel Dönüştürme:</strong> Dosyaların sunuculara yüklenmez; tüm işlemler doğrudan cihazında tamamlanır.</span>
      </div>

      {/* --- MOD 1: TEKLİ DOSYA DÖNÜŞTÜRÜCÜ --- */}
      {activeMode === "file" && (
        <div className="converter-file-section">
          <div
            className={`converter-dropzone ${isDragOver ? "is-dragover" : ""} ${selectedFile ? "has-file" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={e => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
              accept=".docx,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.svg,.txt,.md,.html,.htm,.json,.csv"
            />

            {!selectedFile ? (
              <div className="dropzone-empty">
                <span className="dropzone-icon">📥</span>
                <strong>Dönüştürmek istediğin dosyayı buraya sürükle veya seç</strong>
                <p>Word (.docx), Resim (.png, .jpg, .webp), Metin (.txt, .md), HTML, JSON, CSV desteklenir.</p>
                <span className="dropzone-btn">Dosya Seç</span>
              </div>
            ) : (
              <div className="dropzone-selected-file">
                <div className="file-info-header">
                  <span className="file-icon-large">
                    {selectedFile.name.endsWith(".docx") ? "📄" : selectedFile.type.startsWith("image/") ? "🖼️" : "📑"}
                  </span>
                  <div className="file-meta">
                    <strong>{selectedFile.name}</strong>
                    <span>Boyut: {formatSize(selectedFile.size)}</span>
                  </div>
                  <button
                    type="button"
                    className="file-remove-btn"
                    onClick={e => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      setResult(null);
                    }}
                    title="Dosyayı kaldır"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>

          {selectedFile && !result && (
            <div className="converter-options-panel surface" style={{ marginTop: "1rem", padding: "1rem", borderRadius: "0.75rem", border: "1px solid var(--app-border)" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.6rem", color: "var(--app-text)" }}>
                Dönüştürülecek Hedef Format:
              </label>

              <div className="target-format-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(135px, 1fr))", gap: "0.5rem", marginBottom: "1rem" }}>
                {getAvailableFormats(selectedFile).map(fmt => (
                  <button
                    key={fmt.id}
                    type="button"
                    className={`target-format-btn ${targetFormat === fmt.id ? "is-selected" : ""}`}
                    onClick={() => setTargetFormat(fmt.id)}
                  >
                    <span>{fmt.icon}</span>
                    <strong>{fmt.label}</strong>
                  </button>
                ))}
              </div>

              {(selectedFile.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(selectedFile.name)) && targetFormat !== "pdf" && (
                <div className="image-advanced-settings" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.8rem", padding: "0.75rem", background: "var(--app-field)", borderRadius: "0.5rem", marginBottom: "1rem" }}>
                  <div>
                    <label style={{ fontSize: "0.78rem", color: "var(--app-secondary)" }}>
                      Kalite: %{Math.round(imageQuality * 100)}
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={imageQuality}
                      onChange={e => setImageQuality(parseFloat(e.target.value))}
                      style={{ width: "100%", marginTop: "0.3rem" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.78rem", color: "var(--app-secondary)" }}>
                      Maksimum Genişlik:
                    </label>
                    <select
                      value={imageResizeMax}
                      onChange={e => setImageResizeMax(e.target.value)}
                      style={{ width: "100%", marginTop: "0.3rem", padding: "0.35rem 0.5rem", borderRadius: "0.4rem", background: "var(--app-surface)", color: "var(--app-text)", border: "1px solid var(--app-border)" }}
                    >
                      <option value="original">Orijinal Boyut</option>
                      <option value="1920">Full HD (1920px)</option>
                      <option value="1280">HD (1280px)</option>
                      <option value="800">Standart (800px)</option>
                      <option value="400">Küçük (400px)</option>
                    </select>
                  </div>
                </div>
              )}

              <button
                type="button"
                className="button button-primary convert-action-btn"
                onClick={performConversion}
                disabled={busy}
                style={{ width: "100%", justifyContent: "center", padding: "0.7rem", fontSize: "0.95rem" }}
              >
                {busy ? progressText || "Dönüştürülüyor..." : `🚀 ${selectedFile.name} ➔ ${targetFormat.toUpperCase()} Dönüştür`}
              </button>
            </div>
          )}

          {result && (
            <div className="converter-result-card surface" style={{ marginTop: "1rem", padding: "1.2rem", borderRadius: "0.85rem", border: "1px solid var(--app-border)", background: "var(--app-field)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.8rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span style={{ fontSize: "1.6rem" }}>✅</span>
                  <div>
                    <strong style={{ fontSize: "1rem", display: "block" }}>{result.fileName}</strong>
                    <span style={{ fontSize: "0.8rem", color: "var(--app-secondary)" }}>
                      {formatSize(result.originalSize)} ➔ <strong>{formatSize(result.newSize)}</strong>
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => downloadBlob(result.blob, result.fileName)}
                  >
                    ⬇️ İndir
                  </button>

                  {result.htmlContent && (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => printDocument(result.fileName, result.htmlContent!)}
                      title="Windows / Sistem PDF Yazıcısıyla Çıktı Al"
                    >
                      🖨️ Yazdır / PDF
                    </button>
                  )}

                  {result.textContent && (
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => {
                        navigator.clipboard.writeText(result.textContent!);
                        setMessage({ text: "Metin panoya kopyalandı!", type: "info" });
                      }}
                    >
                      📋 Kopyala
                    </button>
                  )}

                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => {
                      setResult(null);
                      setSelectedFile(null);
                    }}
                  >
                    🔄 Yeni Dosya
                  </button>
                </div>
              </div>

              <div className="result-preview-box" style={{ marginTop: "0.8rem", padding: "0.75rem", background: "var(--app-surface)", borderRadius: "0.6rem", maxHeight: "250px", overflowY: "auto", border: "1px solid var(--app-border)" }}>
                {result.previewUrl && (
                  <div style={{ textAlign: "center" }}>
                    <img src={result.previewUrl} alt="Dönüştürülen Görsel" style={{ maxWidth: "100%", maxHeight: "220px", borderRadius: "0.4rem" }} />
                  </div>
                )}
                {result.htmlContent && !result.previewUrl && (
                  <div
                    className="html-document-preview"
                    style={{ fontSize: "0.85rem", lineHeight: 1.5, color: "var(--app-text)" }}
                    dangerouslySetInnerHTML={{ __html: result.htmlContent }}
                  />
                )}
                {result.textContent && !result.htmlContent && !result.previewUrl && (
                  <pre style={{ margin: 0, fontSize: "0.8rem", whiteSpace: "pre-wrap", fontFamily: "Consolas, monospace", color: "var(--app-text)" }}>
                    {result.textContent.slice(0, 3000)}
                    {result.textContent.length > 3000 ? "\n\n... (devamı indirilen dosyada)" : ""}
                  </pre>
                )}
                {result.fileType === "pdf" && !result.htmlContent && !result.textContent && (
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--app-secondary)", textAlign: "center" }}>
                    📄 PDF belgesi başarıyla hazırlandı ({formatSize(result.newSize)}). İndir butonuna tıklayarak açabilirsin.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- MOD 2: METİN VE KOD DÖNÜŞTÜRÜCÜ --- */}
      {activeMode === "text" && (
        <div className="converter-text-section">
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            {(
              [
                { id: "md2pdf", label: "Markdown ➔ PDF" },
                { id: "md2html", label: "Markdown ➔ HTML" },
                { id: "json2csv", label: "JSON ➔ CSV (Excel)" },
                { id: "csv2json", label: "CSV ➔ JSON" },
                { id: "b64enc", label: "Base64 Şifrele" },
                { id: "b64dec", label: "Base64 Çöz" },
              ] as { id: TextConvertType; label: string }[]
            ).map(opt => (
              <button
                key={opt.id}
                type="button"
                className={`converter-subtab-btn ${textConvertType === opt.id ? "is-active" : ""}`}
                onClick={() => {
                  setTextConvertType(opt.id);
                  setTextResult("");
                  setTextPdfBlob(null);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <textarea
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            placeholder="Dönüştürmek istediğin metni, Markdown'ı veya JSON/CSV verisini buraya yapıştır..."
            rows={6}
            style={{ width: "100%", padding: "0.75rem", borderRadius: "0.6rem", background: "var(--app-field)", border: "1px solid var(--app-border)", color: "var(--app-text)", fontFamily: "Consolas, monospace", fontSize: "0.85rem", resize: "vertical", boxSizing: "border-box" }}
          />

          <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.6rem" }}>
            <button type="button" className="button button-primary" onClick={handleTextConvert}>
              ⚡ Dönüştür
            </button>
            {textInput && (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setTextInput("");
                  setTextResult("");
                  setTextPdfBlob(null);
                }}
              >
                Temizle
              </button>
            )}
          </div>

          {textResult && (
            <div className="text-result-box surface" style={{ marginTop: "1rem", padding: "1rem", borderRadius: "0.65rem", border: "1px solid var(--app-border)", background: "var(--app-field)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <strong>Çıktı Sonucu:</strong>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  {textPdfBlob && (
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => downloadBlob(textPdfBlob, "Metin-Belgesi.pdf")}
                      style={{ fontSize: "0.78rem", padding: "0.3rem 0.6rem" }}
                    >
                      ⬇️ PDF İndir
                    </button>
                  )}
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(textResult);
                      setMessage({ text: "Panoya kopyalandı!", type: "info" });
                    }}
                    style={{ fontSize: "0.78rem", padding: "0.3rem 0.6rem" }}
                  >
                    📋 Kopyala
                  </button>
                </div>
              </div>
              <pre style={{ margin: 0, maxHeight: "200px", overflowY: "auto", fontSize: "0.8rem", whiteSpace: "pre-wrap", fontFamily: "Consolas, monospace", color: "var(--app-text)", padding: "0.5rem", background: "var(--app-surface)", borderRadius: "0.4rem" }}>
                {textResult}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* --- MOD 3: ÇOKLU GÖRSELDEN PDF --- */}
      {activeMode === "multi-image" && (
        <div className="converter-multi-image-section">
          <div
            className="multi-image-dropzone"
            onClick={() => multiFileInputRef.current?.click()}
            style={{ border: "2px dashed var(--app-border)", padding: "1.25rem", borderRadius: "0.75rem", textAlign: "center", cursor: "pointer", background: "var(--app-field)" }}
          >
            <input
              type="file"
              ref={multiFileInputRef}
              style={{ display: "none" }}
              multiple
              accept="image/*"
              onChange={handleMultiImageFiles}
            />
            <span style={{ fontSize: "2rem", display: "block", marginBottom: "0.3rem" }}>📸</span>
            <strong style={{ fontSize: "0.95rem", display: "block" }}>PDF'e Dönüştürülecek Görselleri Ekle</strong>
            <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "var(--app-secondary)" }}>
              Birden çok görsel veya fotoğraf seçebilirsin. Her biri PDF'te bir sayfa olacaktır.
            </p>
          </div>

          {multiImages.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Yüklenen Görseller ({multiImages.length} adet):
                </span>
                <button
                  type="button"
                  className="dashboard-text-button"
                  onClick={() => setMultiImages([])}
                  style={{ color: "#ef4444", fontSize: "0.78rem" }}
                >
                  Tümünü Temizle
                </button>
              </div>

              <div className="multi-images-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "0.6rem", maxHeight: "240px", overflowY: "auto", padding: "0.5rem", background: "var(--app-field)", borderRadius: "0.6rem", border: "1px solid var(--app-border)" }}>
                {multiImages.map((img, idx) => (
                  <div key={img.id} className="multi-img-card" style={{ position: "relative", background: "var(--app-surface)", borderRadius: "0.5rem", padding: "0.4rem", border: "1px solid var(--app-border)", textAlign: "center" }}>
                    <img src={img.dataUrl} alt={img.name} style={{ width: "100%", height: "80px", objectFit: "cover", borderRadius: "0.3rem", display: "block" }} />
                    <span style={{ display: "block", fontSize: "0.72rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "0.3rem" }} title={img.name}>
                      {idx + 1}. {img.name}
                    </span>
                    <div style={{ display: "flex", justifyContent: "center", gap: "0.3rem", marginTop: "0.3rem" }}>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          moveMultiImage(idx, -1);
                        }}
                        disabled={idx === 0}
                        style={{ border: "none", background: "transparent", color: "var(--app-text)", cursor: "pointer", fontSize: "0.8rem", padding: "0 0.2rem" }}
                        title="Öne taşı"
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          removeMultiImage(img.id);
                        }}
                        style={{ border: "none", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: "0.8rem", padding: "0 0.2rem" }}
                        title="Kaldır"
                      >
                        ✕
                      </button>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          moveMultiImage(idx, 1);
                        }}
                        disabled={idx === multiImages.length - 1}
                        style={{ border: "none", background: "transparent", color: "var(--app-text)", cursor: "pointer", fontSize: "0.8rem", padding: "0 0.2rem" }}
                        title="Arkaya taşı"
                      >
                        ▶
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="button button-primary"
                onClick={generateMultiImagePdf}
                disabled={busy}
                style={{ width: "100%", marginTop: "1rem", justifyContent: "center", padding: "0.7rem", fontSize: "0.95rem" }}
              >
                {busy ? progressText || "İşleniyor..." : `📑 ${multiImages.length} Görseli Tek PDF Olarak İndir`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mesaj Bildirimi */}
      {message && (
        <div
          className={`tool-feedback ${message.type === "success" ? "success" : message.type === "error" ? "error" : ""}`}
          style={{ marginTop: "0.8rem" }}
          role="status"
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
