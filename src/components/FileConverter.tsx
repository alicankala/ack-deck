import { useState, useRef, type ChangeEvent, type DragEvent } from "react";
import mammoth from "mammoth";
import { jsPDF } from "jspdf";

type ConverterMode = "file" | "text" | "multi-image";

interface ConvertedResult {
  fileName: string;
  blob: Blob;
  previewUrl?: string;
  textContent?: string;
  htmlContent?: string;
  fileType: "pdf" | "image" | "text" | "html" | "data";
  originalSize: number;
  newSize: number;
}

interface ImageItem {
  id: string;
  name: string;
  size: number;
  dataUrl: string;
}

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
  const [textConvertType, setTextConvertType] = useState<"md2pdf" | "md2html" | "json2csv" | "csv2json" | "b64enc" | "b64dec">("md2pdf");
  const [textResult, setTextResult] = useState<string>("");
  const [textPdfBlob, setTextPdfBlob] = useState<Blob | null>(null);

  // Multi-image to PDF state
  const [multiImages, setMultiImages] = useState<ImageItem[]>([]);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  // Helper: Format file size
  function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  // Detect available target formats for a file
  function getAvailableFormats(file: File): { id: string; label: string; icon: string }[] {
    const name = file.name.toLowerCase();
    if (name.endsWith(".docx")) {
      return [
        { id: "pdf", label: "PDF Belgesi (.pdf)", icon: "📄" },
        { id: "html", label: "Web Sayfası (.html)", icon: "🌐" },
        { id: "md", label: "Markdown (.md)", icon: "📝" },
        { id: "txt", label: "Düz Metin (.txt)", icon: "📄" },
      ];
    }
    if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|gif|svg)$/i.test(name)) {
      return [
        { id: "pdf", label: "PDF Sayfası (.pdf)", icon: "📄" },
        { id: "png", label: "PNG Resmi (.png)", icon: "🖼️" },
        { id: "jpg", label: "JPG Resmi (.jpg)", icon: "🖼️" },
        { id: "webp", label: "Modern WebP (.webp)", icon: "🌐" },
        { id: "ico", label: "Simge / Icon (.ico)", icon: "🔷" },
      ];
    }
    if (name.endsWith(".txt") || name.endsWith(".md")) {
      return [
        { id: "pdf", label: "PDF Belgesi (.pdf)", icon: "📄" },
        { id: "html", label: "HTML Sayfası (.html)", icon: "🌐" },
        { id: "txt", label: "Düz Metin (.txt)", icon: "📄" },
      ];
    }
    if (name.endsWith(".html") || name.endsWith(".htm")) {
      return [
        { id: "pdf", label: "PDF Belgesi (.pdf)", icon: "📄" },
        { id: "txt", label: "Metin Çıkarımı (.txt)", icon: "📄" },
        { id: "md", label: "Markdown (.md)", icon: "📝" },
      ];
    }
    if (name.endsWith(".json")) {
      return [
        { id: "csv", label: "CSV / Excel Tablosu (.csv)", icon: "📊" },
        { id: "txt", label: "Formatlı Metin (.txt)", icon: "📄" },
      ];
    }
    if (name.endsWith(".csv")) {
      return [
        { id: "json", label: "JSON Verisi (.json)", icon: "🗄️" },
        { id: "txt", label: "Düz Metin (.txt)", icon: "📄" },
      ];
    }
    // Default fallback
    return [
      { id: "pdf", label: "PDF Belgesi (.pdf)", icon: "📄" },
      { id: "txt", label: "Metin (.txt)", icon: "📄" },
    ];
  }

  // Handle single file selected
  function handleFileSelect(file: File) {
    setSelectedFile(file);
    setResult(null);
    setMessage(null);
    const available = getAvailableFormats(file);
    if (available.length > 0) {
      setTargetFormat(available[0].id);
    }
  }

  // Drag and drop handlers
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

  // Download converted file
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

  // Print document (Native Windows PDF Printer support)
  function printDocument(title: string, contentHtml: string) {
    try {
      const printWin = window.open("", "_blank");
      if (!printWin) {
        setMessage({ text: "Yazdırma penceresi açılamadı. Lütfen açılır pencerelere izin verin.", type: "error" });
        return;
      }
      printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8"/>
          <title>${title}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #111; padding: 2.5cm 2cm; margin: 0; }
            h1, h2, h3, h4 { color: #0f172a; margin-top: 1.5em; margin-bottom: 0.5em; }
            p { margin: 0.6em 0; }
            table { border-collapse: collapse; width: 100%; margin: 1em 0; }
            th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
            th { background: #f1f5f9; }
            img { max-width: 100%; height: auto; }
            @page { margin: 1.5cm; size: A4; }
          </style>
        </head>
        <body>
          ${contentHtml}
          <script>
            window.onload = function() { window.focus(); window.print(); };
          </script>
        </body>
        </html>
      `);
      printWin.document.close();
    } catch {
      setMessage({ text: "Yazdırma başlatılamadı.", type: "error" });
    }
  }

  // --- CORE CONVERSION LOGIC ---
  async function performConversion() {
    if (!selectedFile) return;
    setBusy(true);
    setProgressText("Dönüştürülüyor...");
    setMessage(null);

    const baseName = selectedFile.name.replace(/\.[^/.]+$/, "");
    const ext = selectedFile.name.split(".").pop()?.toLowerCase() || "";

    try {
      // 1. DOCX CONVERSIONS
      if (ext === "docx") {
        const arrayBuffer = await selectedFile.arrayBuffer();

        if (targetFormat === "pdf") {
          setProgressText("Word belgesi işleniyor ve PDF oluşturuluyor...");
          const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
          const { value: rawText } = await mammoth.extractRawText({ arrayBuffer });

          // Generate PDF using jsPDF
          const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
          doc.setFont("Helvetica", "normal");
          doc.setFontSize(11);

          // Split raw text into wrapped lines for high reliability
          const splitLines = doc.splitTextToSize(rawText || " ", 515);
          let cursorY = 45;
          const pageHeight = doc.internal.pageSize.getHeight();

          // Title
          doc.setFontSize(16);
          doc.setFont("Helvetica", "bold");
          doc.text(baseName, 40, cursorY);
          cursorY += 28;
          doc.setFontSize(10);
          doc.setFont("Helvetica", "normal");

          for (let i = 0; i < splitLines.length; i++) {
            if (cursorY > pageHeight - 45) {
              doc.addPage();
              cursorY = 45;
            }
            doc.text(splitLines[i], 40, cursorY);
            cursorY += 16;
          }

          const pdfBlob = doc.output("blob");
          setResult({
            fileName: `${baseName}.pdf`,
            blob: pdfBlob,
            htmlContent: html,
            textContent: rawText,
            fileType: "pdf",
            originalSize: selectedFile.size,
            newSize: pdfBlob.size,
          });
        } else if (targetFormat === "html") {
          setProgressText("HTML'e dönüştürülüyor...");
          const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
          const fullHtml = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8"/>\n<title>${baseName}</title>\n<style>body{font-family:sans-serif;line-height:1.6;padding:2rem;max-width:800px;margin:auto;}</style>\n</head>\n<body>\n${html}\n</body>\n</html>`;
          const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
          setResult({
            fileName: `${baseName}.html`,
            blob,
            htmlContent: html,
            fileType: "html",
            originalSize: selectedFile.size,
            newSize: blob.size,
          });
        } else if (targetFormat === "md") {
          setProgressText("Markdown'a dönüştürülüyor...");
          const { value: md } = await mammoth.convertToMarkdown({ arrayBuffer });
          const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
          setResult({
            fileName: `${baseName}.md`,
            blob,
            textContent: md,
            fileType: "text",
            originalSize: selectedFile.size,
            newSize: blob.size,
          });
        } else if (targetFormat === "txt") {
          setProgressText("Metin çıkarılıyor...");
          const { value: text } = await mammoth.extractRawText({ arrayBuffer });
          const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
          setResult({
            fileName: `${baseName}.txt`,
            blob,
            textContent: text,
            fileType: "text",
            originalSize: selectedFile.size,
            newSize: blob.size,
          });
        }
      }

      // 2. IMAGE CONVERSIONS
      else if (selectedFile.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|gif|svg)$/i.test(selectedFile.name)) {
        if (targetFormat === "pdf") {
          setProgressText("Görsel PDF sayfasına yerleştiriliyor...");
          const imgUrl = URL.createObjectURL(selectedFile);
          const img = new Image();
          await new Promise((res, rej) => {
            img.onload = res;
            img.onerror = rej;
            img.src = imgUrl;
          });

          const doc = new jsPDF({ unit: "pt", format: "a4", orientation: img.width > img.height ? "landscape" : "portrait" });
          const pageWidth = doc.internal.pageSize.getWidth();
          const pageHeight = doc.internal.pageSize.getHeight();
          const margin = 20;
          const maxWidth = pageWidth - margin * 2;
          const maxHeight = pageHeight - margin * 2;

          let targetW = img.width;
          let targetH = img.height;
          const ratio = Math.min(maxWidth / targetW, maxHeight / targetH, 1);
          targetW = targetW * ratio;
          targetH = targetH * ratio;

          const posX = (pageWidth - targetW) / 2;
          const posY = (pageHeight - targetH) / 2;

          // Render on canvas to ensure uniform JPEG/PNG data
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

          doc.addImage(dataUrl, "JPEG", posX, posY, targetW, targetH);
          const pdfBlob = doc.output("blob");
          URL.revokeObjectURL(imgUrl);

          setResult({
            fileName: `${baseName}.pdf`,
            blob: pdfBlob,
            fileType: "pdf",
            originalSize: selectedFile.size,
            newSize: pdfBlob.size,
          });
        } else {
          // PNG, JPG, WEBP, ICO
          setProgressText("Görsel işleniyor ve yeniden kodlanıyor...");
          const imgUrl = URL.createObjectURL(selectedFile);
          const img = new Image();
          await new Promise((res, rej) => {
            img.onload = res;
            img.onerror = rej;
            img.src = imgUrl;
          });

          let w = img.width;
          let h = img.height;

          // Handle resizing
          if (imageResizeMax !== "original") {
            const max = parseInt(imageResizeMax, 10);
            if (w > max || h > max) {
              if (w > h) {
                h = Math.round((h * max) / w);
                w = max;
              } else {
                w = Math.round((w * max) / h);
                h = max;
              }
            }
          }

          if (targetFormat === "ico") {
            w = 32;
            h = 32;
          }

          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            if (targetFormat === "jpg") {
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(0, 0, w, h);
            }
            ctx.drawImage(img, 0, 0, w, h);
          }

          let mime = "image/png";
          if (targetFormat === "jpg") mime = "image/jpeg";
          if (targetFormat === "webp") mime = "image/webp";
          if (targetFormat === "ico") mime = "image/x-icon";

          const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, mime === "image/x-icon" ? "image/png" : mime, imageQuality);
          });

          URL.revokeObjectURL(imgUrl);

          if (!blob) throw new Error("Görsel dönüştürülemedi.");

          const previewUrl = URL.createObjectURL(blob);
          setResult({
            fileName: `${baseName}.${targetFormat}`,
            blob,
            previewUrl,
            fileType: "image",
            originalSize: selectedFile.size,
            newSize: blob.size,
          });
        }
      }

      // 3. TEXT & MARKDOWN CONVERSIONS
      else if (ext === "txt" || ext === "md") {
        const text = await selectedFile.text();
        if (targetFormat === "pdf") {
          setProgressText("PDF belgesi oluşturuluyor...");
          const doc = new jsPDF({ unit: "pt", format: "a4" });
          doc.setFont("Helvetica", "normal");
          doc.setFontSize(10);
          const splitLines = doc.splitTextToSize(text, 515);
          let cursorY = 45;
          const pageHeight = doc.internal.pageSize.getHeight();

          doc.setFontSize(15);
          doc.setFont("Helvetica", "bold");
          doc.text(baseName, 40, cursorY);
          cursorY += 25;
          doc.setFontSize(10);
          doc.setFont("Helvetica", "normal");

          for (let i = 0; i < splitLines.length; i++) {
            if (cursorY > pageHeight - 45) {
              doc.addPage();
              cursorY = 45;
            }
            doc.text(splitLines[i], 40, cursorY);
            cursorY += 15;
          }

          const pdfBlob = doc.output("blob");
          setResult({
            fileName: `${baseName}.pdf`,
            blob: pdfBlob,
            textContent: text,
            fileType: "pdf",
            originalSize: selectedFile.size,
            newSize: pdfBlob.size,
          });
        } else if (targetFormat === "html") {
          const html = `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"/><title>${baseName}</title><style>body{font-family:sans-serif;line-height:1.6;padding:2rem;max-width:800px;margin:auto;white-space:pre-wrap;}</style></head><body>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</body></html>`;
          const blob = new Blob([html], { type: "text/html;charset=utf-8" });
          setResult({
            fileName: `${baseName}.html`,
            blob,
            textContent: text,
            fileType: "html",
            originalSize: selectedFile.size,
            newSize: blob.size,
          });
        } else {
          const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
          setResult({
            fileName: `${baseName}.txt`,
            blob,
            textContent: text,
            fileType: "text",
            originalSize: selectedFile.size,
            newSize: blob.size,
          });
        }
      }

      // 4. JSON / CSV CONVERSIONS
      else if (ext === "json") {
        const text = await selectedFile.text();
        const parsed = JSON.parse(text);
        if (targetFormat === "csv") {
          let csv = "";
          if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
            const headers = Object.keys(parsed[0]);
            csv = headers.join(",") + "\n";
            csv += parsed.map(row => headers.map(h => JSON.stringify(row[h] ?? "")).join(",")).join("\n");
          } else {
            csv = "Key,Value\n" + Object.entries(parsed).map(([k, v]) => `"${k}","${String(v)}"`).join("\n");
          }
          // UTF-8 BOM for Microsoft Excel Turkish char compatibility
          const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
          setResult({
            fileName: `${baseName}.csv`,
            blob,
            textContent: csv,
            fileType: "data",
            originalSize: selectedFile.size,
            newSize: blob.size,
          });
        } else {
          const formatted = JSON.stringify(parsed, null, 2);
          const blob = new Blob([formatted], { type: "text/plain;charset=utf-8" });
          setResult({
            fileName: `${baseName}.txt`,
            blob,
            textContent: formatted,
            fileType: "text",
            originalSize: selectedFile.size,
            newSize: blob.size,
          });
        }
      } else if (ext === "csv") {
        const text = await selectedFile.text();
        if (targetFormat === "json") {
          const lines = text.trim().split("\n").filter(Boolean);
          if (lines.length > 0) {
            const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
            const rows = lines.slice(1).map(line => {
              const values = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
              const obj: Record<string, string> = {};
              headers.forEach((h, idx) => {
                obj[h] = values[idx] || "";
              });
              return obj;
            });
            const jsonText = JSON.stringify(rows, null, 2);
            const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
            setResult({
              fileName: `${baseName}.json`,
              blob,
              textContent: jsonText,
              fileType: "data",
              originalSize: selectedFile.size,
              newSize: blob.size,
            });
          }
        }
      }

      setMessage({ text: "Dönüştürme başarıyla tamamlandı!", type: "success" });
    } catch (err) {
      console.error(err);
      setMessage({
        text: `Dönüştürme sırasında hata oluştu: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`,
        type: "error",
      });
    } finally {
      setBusy(false);
      setProgressText("");
    }
  }

  // --- TEXT / CODE CONVERSIONS ---
  function handleTextConvert() {
    const val = textInput.trim();
    if (!val) {
      setMessage({ text: "Dönüştürülecek bir metin veya kod girin.", type: "error" });
      return;
    }

    try {
      if (textConvertType === "md2pdf") {
        const doc = new jsPDF({ unit: "pt", format: "a4" });
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(10);
        const splitLines = doc.splitTextToSize(val, 515);
        let cursorY = 45;
        const pageHeight = doc.internal.pageSize.getHeight();

        for (let i = 0; i < splitLines.length; i++) {
          if (cursorY > pageHeight - 45) {
            doc.addPage();
            cursorY = 45;
          }
          doc.text(splitLines[i], 40, cursorY);
          cursorY += 15;
        }

        const blob = doc.output("blob");
        setTextPdfBlob(blob);
        setTextResult("PDF başarıyla oluşturuldu! Aşağıdaki indirme butonunu kullanabilirsin.");
      } else if (textConvertType === "md2html") {
        const html = `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"/><title>ACK Belge</title><style>body{font-family:system-ui,sans-serif;line-height:1.6;padding:2rem;max-width:800px;margin:auto;}</style></head><body>\n<pre style="white-space:pre-wrap;">${val.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>\n</body></html>`;
        setTextResult(html);
        setTextPdfBlob(null);
      } else if (textConvertType === "json2csv") {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
          const headers = Object.keys(parsed[0]);
          const csv = headers.join(",") + "\n" + parsed.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(",")).join("\n");
          setTextResult(csv);
        } else {
          const csv = "Key,Value\n" + Object.entries(parsed).map(([k, v]) => `"${k}","${String(v)}"`).join("\n");
          setTextResult(csv);
        }
        setTextPdfBlob(null);
      } else if (textConvertType === "csv2json") {
        const lines = val.split("\n").filter(Boolean);
        const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
        const rows = lines.slice(1).map(line => {
          const values = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => {
            obj[h] = values[i] || "";
          });
          return obj;
        });
        setTextResult(JSON.stringify(rows, null, 2));
        setTextPdfBlob(null);
      } else if (textConvertType === "b64enc") {
        const encoded = btoa(unescape(encodeURIComponent(val)));
        setTextResult(encoded);
        setTextPdfBlob(null);
      } else if (textConvertType === "b64dec") {
        const decoded = decodeURIComponent(escape(atob(val)));
        setTextResult(decoded);
        setTextPdfBlob(null);
      }
      setMessage({ text: "İşlem tamamlandı!", type: "success" });
    } catch (err) {
      setMessage({ text: `Hata: ${err instanceof Error ? err.message : "Geçersiz biçim"}`, type: "error" });
    }
  }

  // --- MULTI-IMAGE TO PDF ---
  function handleMultiImageFiles(e: ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    files.forEach(file => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (event) => {
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
      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;

      for (let i = 0; i < multiImages.length; i++) {
        if (i > 0) doc.addPage();
        const item = multiImages[i];

        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = item.dataUrl;
        });

        let targetW = img.width;
        let targetH = img.height;
        const ratio = Math.min(maxWidth / targetW, maxHeight / targetH, 1);
        targetW = targetW * ratio;
        targetH = targetH * ratio;

        const posX = (pageWidth - targetW) / 2;
        const posY = (pageHeight - targetH) / 2;

        doc.addImage(item.dataUrl, "JPEG", posX, posY, targetW, targetH);
      }

      const pdfBlob = doc.output("blob");
      downloadBlob(pdfBlob, `Gorseller-${Date.now()}.pdf`);
      setMessage({ text: `${multiImages.length} görsel tek bir PDF belgesine dönüştürüldü!`, type: "success" });
    } catch (err) {
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
          {/* Sürükle Bırak / Dosya Seçme Alanı */}
          <div
            className={`converter-dropzone ${isDragOver ? "is-dragover" : ""} ${selectedFile ? "has-file" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={(e) => {
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
                    onClick={(e) => {
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

          {/* Hedef Format ve Ayarlar Seçimi */}
          {selectedFile && !result && (
            <div className="converter-options-panel surface" style={{ marginTop: "1rem", padding: "1rem", borderRadius: "0.75rem", border: "1px solid var(--app-border)" }}>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.6rem", color: "var(--app-text)" }}>
                Dönüştürülecek Hedef Format:
              </label>

              <div className="target-format-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(135px, 1fr))", gap: "0.5rem", marginBottom: "1rem" }}>
                {getAvailableFormats(selectedFile).map((fmt) => (
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

              {/* Ek Görsel Ayarları (Eğer resimse) */}
              {(selectedFile.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(selectedFile.name)) && targetFormat !== "pdf" && (
                <div className="image-advanced-settings" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.8rem", padding: "0.75rem", background: "var(--app-field)", borderRadius: "0.5rem", marginBottom: "1rem" }}>
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
                      onChange={(e) => setImageQuality(parseFloat(e.target.value))}
                      style={{ width: "100%", marginTop: "0.3rem" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.78rem", color: "var(--app-secondary)" }}>
                      Maksimum Genişlik:
                    </label>
                    <select
                      value={imageResizeMax}
                      onChange={(e) => setImageResizeMax(e.target.value)}
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

          {/* SONUÇ VE İNDİRME KARTI */}
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

              {/* Önizleme Alanı */}
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
            {[
              { id: "md2pdf", label: "Markdown ➔ PDF" },
              { id: "md2html", label: "Markdown ➔ HTML" },
              { id: "json2csv", label: "JSON ➔ CSV (Excel)" },
              { id: "csv2json", label: "CSV ➔ JSON" },
              { id: "b64enc", label: "Base64 Şifrele" },
              { id: "b64dec", label: "Base64 Çöz" },
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                className={`converter-subtab-btn ${textConvertType === opt.id ? "is-active" : ""}`}
                onClick={() => {
                  setTextConvertType(opt.id as any);
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
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Dönüştürmek istediğin metni, Markdown'ı veya JSON/CSV verisini buraya yapıştır..."
            rows={6}
            style={{ width: "100%", padding: "0.75rem", borderRadius: "0.6rem", background: "var(--app-field)", border: "1px solid var(--app-border)", color: "var(--app-text)", fontFamily: "Consolas, monospace", fontSize: "0.85rem", resize: "vertical", boxSizing: "border-box" }}
          />

          <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.6rem" }}>
            <button
              type="button"
              className="button button-primary"
              onClick={handleTextConvert}
            >
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
                        onClick={(e) => { e.stopPropagation(); moveMultiImage(idx, -1); }}
                        disabled={idx === 0}
                        style={{ border: "none", background: "transparent", color: "var(--app-text)", cursor: "pointer", fontSize: "0.8rem", padding: "0 0.2rem" }}
                        title="Öne taşı"
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeMultiImage(img.id); }}
                        style={{ border: "none", background: "transparent", color: "#ef4444", cursor: "pointer", fontSize: "0.8rem", padding: "0 0.2rem" }}
                        title="Kaldır"
                      >
                        ✕
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); moveMultiImage(idx, 1); }}
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
