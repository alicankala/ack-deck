import mammoth from "mammoth";
import { jsPDF } from "jspdf";

export type ConverterMode = "file" | "text" | "multi-image";
export type TextConvertType = "md2pdf" | "md2html" | "json2csv" | "csv2json" | "b64enc" | "b64dec";

export interface ConvertedResult {
  fileName: string;
  blob: Blob;
  previewUrl?: string;
  textContent?: string;
  htmlContent?: string;
  fileType: "pdf" | "image" | "text" | "html" | "data";
  originalSize: number;
  newSize: number;
}

export interface ImageItem {
  id: string;
  name: string;
  size: number;
  dataUrl: string;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

export function getAvailableFormats(file: File): { id: string; label: string; icon: string }[] {
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
  return [
    { id: "pdf", label: "PDF Belgesi (.pdf)", icon: "📄" },
    { id: "txt", label: "Metin (.txt)", icon: "📄" },
  ];
}

export function printHtmlDocument(title: string, contentHtml: string): boolean {
  const printWin = window.open("", "_blank");
  if (!printWin) return false;
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
  return true;
}

export async function convertSingleFile(
  selectedFile: File,
  targetFormat: string,
  imageQuality: number,
  imageResizeMax: string,
  onProgress: (msg: string) => void
): Promise<ConvertedResult> {
  const baseName = selectedFile.name.replace(/\.[^/.]+$/, "");
  const ext = selectedFile.name.split(".").pop()?.toLowerCase() || "";

  // 1. DOCX CONVERSIONS
  if (ext === "docx") {
    const arrayBuffer = await selectedFile.arrayBuffer();

    if (targetFormat === "pdf") {
      onProgress("Word belgesi işleniyor ve PDF oluşturuluyor...");
      const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
      const { value: rawText } = await mammoth.extractRawText({ arrayBuffer });

      const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(11);

      const splitLines = doc.splitTextToSize(rawText || " ", 515);
      let cursorY = 45;
      const pageHeight = doc.internal.pageSize.getHeight();

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
      return {
        fileName: `${baseName}.pdf`,
        blob: pdfBlob,
        htmlContent: html,
        textContent: rawText,
        fileType: "pdf",
        originalSize: selectedFile.size,
        newSize: pdfBlob.size,
      };
    }

    if (targetFormat === "html") {
      onProgress("HTML'e dönüştürülüyor...");
      const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
      const fullHtml = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8"/>\n<title>${baseName}</title>\n<style>body{font-family:sans-serif;line-height:1.6;padding:2rem;max-width:800px;margin:auto;}</style>\n</head>\n<body>\n${html}\n</body>\n</html>`;
      const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
      return {
        fileName: `${baseName}.html`,
        blob,
        htmlContent: html,
        fileType: "html",
        originalSize: selectedFile.size,
        newSize: blob.size,
      };
    }

    if (targetFormat === "md") {
      onProgress("Markdown'a dönüştürülüyor...");
      const { value: md } = await mammoth.convertToMarkdown({ arrayBuffer });
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      return {
        fileName: `${baseName}.md`,
        blob,
        textContent: md,
        fileType: "text",
        originalSize: selectedFile.size,
        newSize: blob.size,
      };
    }

    onProgress("Metin çıkarılıyor...");
    const { value: text } = await mammoth.extractRawText({ arrayBuffer });
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    return {
      fileName: `${baseName}.txt`,
      blob,
      textContent: text,
      fileType: "text",
      originalSize: selectedFile.size,
      newSize: blob.size,
    };
  }

  // 2. IMAGE CONVERSIONS
  if (selectedFile.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|gif|svg)$/i.test(selectedFile.name)) {
    if (targetFormat === "pdf") {
      onProgress("Görsel PDF sayfasına yerleştiriliyor...");
      const imgUrl = URL.createObjectURL(selectedFile);
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = imgUrl;
      });

      const doc = new jsPDF({
        unit: "pt",
        format: "a4",
        orientation: img.width > img.height ? "landscape" : "portrait",
      });
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

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

      doc.addImage(dataUrl, "JPEG", posX, posY, targetW, targetH);
      const pdfBlob = doc.output("blob");
      URL.revokeObjectURL(imgUrl);

      return {
        fileName: `${baseName}.pdf`,
        blob: pdfBlob,
        fileType: "pdf",
        originalSize: selectedFile.size,
        newSize: pdfBlob.size,
      };
    }

    onProgress("Görsel işleniyor ve yeniden kodlanıyor...");
    const imgUrl = URL.createObjectURL(selectedFile);
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = imgUrl;
    });

    let w = img.width;
    let h = img.height;

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

    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, mime === "image/x-icon" ? "image/png" : mime, imageQuality);
    });

    URL.revokeObjectURL(imgUrl);

    if (!blob) throw new Error("Görsel dönüştürülemedi.");

    const previewUrl = URL.createObjectURL(blob);
    return {
      fileName: `${baseName}.${targetFormat}`,
      blob,
      previewUrl,
      fileType: "image",
      originalSize: selectedFile.size,
      newSize: blob.size,
    };
  }

  // 3. TEXT & MARKDOWN CONVERSIONS
  if (ext === "txt" || ext === "md") {
    const text = await selectedFile.text();
    if (targetFormat === "pdf") {
      onProgress("PDF belgesi oluşturuluyor...");
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
      return {
        fileName: `${baseName}.pdf`,
        blob: pdfBlob,
        textContent: text,
        fileType: "pdf",
        originalSize: selectedFile.size,
        newSize: pdfBlob.size,
      };
    }

    if (targetFormat === "html") {
      const html = `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"/><title>${baseName}</title><style>body{font-family:sans-serif;line-height:1.6;padding:2rem;max-width:800px;margin:auto;white-space:pre-wrap;}</style></head><body>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</body></html>`;
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      return {
        fileName: `${baseName}.html`,
        blob,
        textContent: text,
        fileType: "html",
        originalSize: selectedFile.size,
        newSize: blob.size,
      };
    }

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    return {
      fileName: `${baseName}.txt`,
      blob,
      textContent: text,
      fileType: "text",
      originalSize: selectedFile.size,
      newSize: blob.size,
    };
  }

  // 4. JSON / CSV CONVERSIONS
  if (ext === "json") {
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
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      return {
        fileName: `${baseName}.csv`,
        blob,
        textContent: csv,
        fileType: "data",
        originalSize: selectedFile.size,
        newSize: blob.size,
      };
    }

    const formatted = JSON.stringify(parsed, null, 2);
    const blob = new Blob([formatted], { type: "text/plain;charset=utf-8" });
    return {
      fileName: `${baseName}.txt`,
      blob,
      textContent: formatted,
      fileType: "text",
      originalSize: selectedFile.size,
      newSize: blob.size,
    };
  }

  if (ext === "csv") {
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
        return {
          fileName: `${baseName}.json`,
          blob,
          textContent: jsonText,
          fileType: "data",
          originalSize: selectedFile.size,
          newSize: blob.size,
        };
      }
    }
  }

  const fallbackText = await selectedFile.text();
  const fallbackBlob = new Blob([fallbackText], { type: "text/plain;charset=utf-8" });
  return {
    fileName: `${baseName}.txt`,
    blob: fallbackBlob,
    textContent: fallbackText,
    fileType: "text",
    originalSize: selectedFile.size,
    newSize: fallbackBlob.size,
  };
}

export function convertTextData(
  val: string,
  textConvertType: TextConvertType
): { textResult: string; pdfBlob: Blob | null } {
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

    return {
      textResult: "PDF başarıyla oluşturuldu! Aşağıdaki indirme butonunu kullanabilirsin.",
      pdfBlob: doc.output("blob"),
    };
  }

  if (textConvertType === "md2html") {
    const html = `<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"/><title>ACK Belge</title><style>body{font-family:system-ui,sans-serif;line-height:1.6;padding:2rem;max-width:800px;margin:auto;}</style></head><body>\n<pre style="white-space:pre-wrap;">${val.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>\n</body></html>`;
    return { textResult: html, pdfBlob: null };
  }

  if (textConvertType === "json2csv") {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object") {
      const headers = Object.keys(parsed[0]);
      const csv = headers.join(",") + "\n" + parsed.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(",")).join("\n");
      return { textResult: csv, pdfBlob: null };
    }
    const csv = "Key,Value\n" + Object.entries(parsed).map(([k, v]) => `"${k}","${String(v)}"`).join("\n");
    return { textResult: csv, pdfBlob: null };
  }

  if (textConvertType === "csv2json") {
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
    return { textResult: JSON.stringify(rows, null, 2), pdfBlob: null };
  }

  if (textConvertType === "b64enc") {
    return { textResult: btoa(unescape(encodeURIComponent(val))), pdfBlob: null };
  }

  return { textResult: decodeURIComponent(escape(atob(val))), pdfBlob: null };
}

export async function combineImagesToPdf(multiImages: ImageItem[]): Promise<Blob> {
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

  return doc.output("blob");
}
