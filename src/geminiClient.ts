import { boundedConversation } from "./conversationContext";
import { invoke } from "@tauri-apps/api/core";
import type { AckContext, AckSource } from "./ackIntegration";

export type AiMessage = { role: "user" | "model"; text: string; sources?: AckSource[]; attachments?: { name: string; mime: string; size: number }[] };
export type AiModel = "fast" | "powerful";
export type AiReply = { text: string; action?: { name: string; args: unknown } | null };

const safeErrors = new Set([
  "Eklenen dosyanın süresi doldu. Dosyayı yeniden ekleyin.",
  "Dosya gizli anahtar içeriyor; gönderilmedi.",
  "Metin dosyası UTF-8 olmalı.",
  "Her mesajda en fazla bir dosya gönderin.",
  "Dosya okunamadı.",
  "Windows kimlik bilgilerine erişilemedi.",
  "Gemini API anahtarını Ayarlar bölümünden ekleyin.",
  "Gemini'ye bağlanılamadı. İnternet bağlantınızı kontrol edin.",
  "Geçerli bir Gemini API anahtarı girin.",
  "API anahtarı Windows kimlik bilgilerine kaydedilemedi.",
  "API anahtarı Windows kimlik bilgilerinden silinemedi.",
  "Gemini isteği kabul etmedi. Mesajınızı gözden geçirin.",
  "API anahtarı geçersiz veya bu model için yetkisiz.",
  "Gemini modeli bulunamadı veya bu anahtara açık değil.",
  "Ücretsiz kullanım sınırına ulaşıldı. Daha sonra tekrar deneyin.",
  "Gemini şu anda yanıt vermiyor. Daha sonra tekrar deneyin.",
  "Gemini isteği tamamlanamadı.",
  "Sohbet çok uzun veya mesaj geçersiz. Yeni sohbet başlatın.",
  "Gemini yanıtı okunamadı.",
  "Gemini bu mesaja yanıt üretemedi.",
  "ACKDeck bağlamı çok uzun. Daha dar bir soru sorun.",
  "AI işlem taslağı geçersiz. Hiçbir işlem yapılmadı.",
]);

export function aiErrorMessage(error: unknown): string {
  return typeof error === "string" && safeErrors.has(error)
    ? error
    : "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
}

export const getGeminiKeyStatus = () => invoke<boolean>("gemini_key_status");
export const saveGeminiKey = (apiKey: string) => invoke<void>("save_gemini_key", { apiKey });
export const deleteGeminiKey = () => invoke<void>("delete_gemini_key");
export const testGeminiConnection = (model: AiModel) => invoke<void>("test_gemini_connection", { model });
export const sendGeminiMessage = (messages: AiMessage[], model: AiModel, context: AckContext[] = [], allowActions = false, attachmentIds: string[] = []) =>
  invoke<AiReply>("gemini_chat", { messages: boundedConversation(messages), model, context, allowActions, attachmentIds, localTime: new Date().toLocaleString("sv-SE") + " · UTC offset " + (-new Date().getTimezoneOffset()) + " dakika" });
