import { invoke } from "@tauri-apps/api/core";
export type AiAttachment = { id: string; name: string; mime: string; size: number };
export const chooseAiAttachment = () => invoke<AiAttachment | null>("choose_ai_attachment");
export const releaseAiAttachment = (id: string) => invoke<void>("release_ai_attachment", { id });
export async function pasteAiImage(file: File): Promise<AiAttachment> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error("PNG, JPEG veya WebP görüntüsü en fazla 8 MB olabilir.");
  return invoke<AiAttachment>("paste_ai_image", { mime: file.type, bytes: Array.from(new Uint8Array(await file.arrayBuffer())) });
}

export const previewAiImage = (id: string) => invoke<string>("preview_ai_image", { id });

export function attachmentError(reason: unknown): string { const text = reason instanceof Error ? reason.message : reason; return typeof text === "string" && ["Dosya desteklenmiyor veya 8 MB sınırını aşıyor. PNG, JPEG, WebP, PDF veya UTF-8 TXT seçin.", "Metin dosyası en fazla 128 KB olabilir. İlgili bölümü ayrı bir dosya olarak ekleyin.", "PNG, JPEG veya WebP görüntüsü en fazla 8 MB olabilir.", "Önce eklenen dosyayı kaldırın.", "Dosya seçilemedi.", "Dosya okunamadı.", "Bu dosya türü desteklenmiyor.", "Dosya bilgisi alınamadı.", "Yalnızca görüntü yapıştırılabilir."].includes(text) ? text : "Dosya eklenemedi. Desteklenen bir dosya seçip yeniden deneyin."; }
