import { id, object } from "../../../shared/phone";
import { DESKTOP_ONLINE_THRESHOLD_MS, owner, rate, type RouteContext } from "../http";
import {
  clearEncryptedGeminiKey,
  hasEncryptedGeminiKey,
  runCloudMobileAiChat,
  saveEncryptedGeminiKey,
} from "../mobileAi";
import { ApiError, jsonBody, reply } from "../security";
import { ensureSyncTables } from "../sync";
import type { Actor, Env } from "../types";

function cloudTodayDateKey(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

async function recordCloudAiUsage(env: Env, model: "fast" | "powerful") {
  try {
    const today = cloudTodayDateKey();
    let current = { date: today, fast: 0, powerful: 0 };
    const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key='ai_cloud_usage'").first<{ value: string }>();
    if (row?.value) {
      try {
        const parsed = JSON.parse(row.value);
        if (parsed && parsed.date === today) {
          current = {
            date: today,
            fast: typeof parsed.fast === "number" ? parsed.fast : 0,
            powerful: typeof parsed.powerful === "number" ? parsed.powerful : 0,
          };
        }
      } catch {}
    }
    if (model === "fast") current.fast += 1;
    else current.powerful += 1;
    await env.DB.prepare(
      "INSERT INTO app_settings(key, value, updated_at) VALUES('ai_cloud_usage', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
    )
      .bind(JSON.stringify(current), Date.now())
      .run();
  } catch (err) {
    console.warn("[Cloud AI Usage Record Error]", err);
  }
}

export async function handleAiRoutes(ctx: RouteContext, actor: Actor): Promise<Response | null> {
  const { request, path, now, env } = ctx;

  if (path === "/api/ai/status" && request.method === "GET") {
    const pc = await env.DB.prepare("SELECT last_seen FROM desktop_state WHERE id=1").first<{ last_seen: number }>();
    const configured = await hasEncryptedGeminiKey(env);
    return reply({ configured, desktopOnline: now - (pc?.last_seen ?? 0) < DESKTOP_ONLINE_THRESHOLD_MS });
  }

  if (path === "/api/ai/key" && request.method === "GET") {
    const configured = await hasEncryptedGeminiKey(env);
    return reply({ configured });
  }

  if (path === "/api/ai/key" && (request.method === "POST" || request.method === "DELETE")) {
    owner(actor);
    await ensureSyncTables(env);
    await rate(env, `ai-key:${actor.id}`, 10, 60);
    if (request.method === "DELETE") {
      await clearEncryptedGeminiKey(env);
      return reply({ ok: true, configured: false });
    }
    const body = await jsonBody(request);
    if (!object(body)) throw new ApiError(400, "İstek geçersiz.");
    if (body.clear === true) {
      await clearEncryptedGeminiKey(env);
      return reply({ ok: true, configured: false });
    }
    if (typeof body.apiKey !== "string") throw new ApiError(400, "Gemini API anahtarı girilmedi.");
    await saveEncryptedGeminiKey(env, body.apiKey);
    return reply({ ok: true, configured: true });
  }

  if (path === "/api/ai/chat" && request.method === "POST") {
    if (actor.owner) throw new ApiError(403, "Bu özellik mobil sohbet içindir.");
    await ensureSyncTables(env);
    await rate(env, `ai-chat:${actor.id}`, 20, 60);
    const body = await jsonBody(request);
    if (!object(body)) throw new ApiError(400, "İstek geçersiz.");

    let prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    let history: Array<{ role: "user" | "model"; text: string }> = [];

    if (Array.isArray(body.messages) && body.messages.length > 0) {
      const msgs = body.messages.filter(
        (m: any) => object(m) && (m.role === "user" || m.role === "model") && typeof m.text === "string" && m.text.trim(),
      );
      const lastUser = [...msgs].reverse().find((m: any) => m.role === "user");
      if (lastUser && !prompt) prompt = lastUser.text.trim();
      const lastIdx = msgs.lastIndexOf(lastUser);
      history = (lastIdx >= 0 ? msgs.slice(0, lastIdx) : msgs).slice(-10);
    } else if (Array.isArray(body.history)) {
      history = body.history
        .filter((m: any) => object(m) && (m.role === "user" || m.role === "model") && typeof m.text === "string")
        .slice(-10);
    }

    if (!prompt || prompt.length > 4000) {
      throw new ApiError(400, "Mesaj metni geçersiz.");
    }

    const modelChoice: "fast" | "powerful" = body.model === "powerful" ? "powerful" : "fast";
    const direct = await runCloudMobileAiChat(env, prompt, history, modelChoice);
    if (direct) {
      await recordCloudAiUsage(env, direct.modelTier);
      return reply({ ok: true, mode: "cloud", reply: direct.reply, modelUsed: direct.modelUsed });
    }

    const pc = await env.DB.prepare("SELECT last_seen FROM desktop_state WHERE id=1").first<{ last_seen: number }>();
    const desktopOnline = now - (pc?.last_seen ?? 0) < DESKTOP_ONLINE_THRESHOLD_MS;
    if (!desktopOnline) {
      throw new ApiError(
        400,
        "PC şu an kapalı ve bulut AI anahtarı kayıtlı değil. 7/24 mobil AI kullanmak için bilgisayarında ACKDeck Masaüstü › Ayarlar › Telefon ekranından etkinleştirebilirsin.",
      );
    }

    const queryId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO ai_queries(id, device_id, prompt, history, model, state, created_at, expires_at) VALUES(?, ?, ?, ?, ?, 'pending', ?, ?)",
    )
      .bind(queryId, actor.id, prompt, JSON.stringify(history), modelChoice, now, now + 150_000)
      .run();
    return reply({ ok: true, mode: "relay", queryId });
  }

  const aiQueryMatch = path.match(/^\/api\/ai\/query\/([\w.-]{1,128})$/);
  if (aiQueryMatch && request.method === "GET") {
    const row = await env.DB.prepare("SELECT state, reply, device_id FROM ai_queries WHERE id=?")
      .bind(aiQueryMatch[1])
      .first<{ state: string; reply: string | null; device_id: string }>();
    if (!row || (!actor.owner && row.device_id !== actor.id)) throw new ApiError(404, "Sorgu bulunamadı.");
    return reply({ state: row.state, reply: row.reply });
  }

  if (path === "/api/ai/pending" && request.method === "GET") {
    owner(actor);
    const rows = await env.DB.prepare(
      "SELECT id, prompt, history, model FROM ai_queries WHERE state='pending' AND expires_at>? ORDER BY created_at ASC LIMIT 3",
    )
      .bind(now)
      .all<{ id: string; prompt: string; history: string; model: string }>();
    return reply({ queries: rows.results });
  }

  if (path === "/api/ai/reply" && request.method === "POST") {
    owner(actor);
    await ensureSyncTables(env);
    const body = await jsonBody(request);
    if (!object(body) || !id(body.id) || typeof body.reply !== "string" || body.reply.length > 20000) {
      throw new ApiError(400, "Yanıt bilgileri geçersiz.");
    }
    const nextState = body.failed === true ? "failed" : "done";
    await env.DB.prepare("UPDATE ai_queries SET state=?, reply=? WHERE id=? AND state='pending'")
      .bind(nextState, body.reply, body.id)
      .run();
    return reply({ ok: true });
  }

  return null;
}
