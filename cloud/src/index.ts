import { authenticate, rate, type RouteContext } from "./http";
import { PushFailure, runReminders } from "./reminders";
import { handleAiRoutes } from "./routes/aiRoutes";
import { handleInboxRoutes } from "./routes/inboxRoutes";
import { handleCorsPublicRoutes, handlePairExchangeRoute, handleWeatherRoute } from "./routes/publicRoutes";
import { handleSyncRoutes } from "./routes/syncRoutes";
import { ApiError, reply, secure } from "./security";
import type { Env } from "./types";

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const now = Date.now();
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new ApiError(400, "Güvenli bağlantı gereklidir.");
  }

  const ctx: RouteContext = { request, url, path, now, env };

  const corsPublicResponse = await handleCorsPublicRoutes(ctx);
  if (corsPublicResponse) return corsPublicResponse;

  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) throw new ApiError(403, "Bu kaynaktan erişime izin verilmiyor.");
  if (!path.startsWith("/api/")) return secure(await env.ASSETS.fetch(request), false);

  const weatherResponse = await handleWeatherRoute(ctx);
  if (weatherResponse) return weatherResponse;

  if (!env.OWNER_SECRET || env.OWNER_SECRET.length < 32) {
    throw new ApiError(503, "Telefon sunucusu henüz yapılandırılmamış.");
  }
  if (request.method === "OPTIONS") throw new ApiError(403, "Çapraz kaynak erişimi desteklenmiyor.");

  const pairExchangeResponse = await handlePairExchangeRoute(ctx);
  if (pairExchangeResponse) return pairExchangeResponse;

  const actor = await authenticate(request, env);
  if (path !== "/api/heartbeat" && request.method !== "GET") {
    await rate(env, `api:${actor.id}`, 120);
  }

  const syncResponse = await handleSyncRoutes(ctx, actor);
  if (syncResponse) return syncResponse;

  const aiResponse = await handleAiRoutes(ctx, actor);
  if (aiResponse) return aiResponse;

  const inboxResponse = await handleInboxRoutes(ctx, actor);
  if (inboxResponse) return inboxResponse;

  throw new ApiError(404, "İşlem bulunamadı.");
}

export default {
  async fetch(request: Request, env: Env) {
    try {
      return await handle(request, env);
    } catch (error) {
      if (error instanceof PushFailure) {
        return reply(
          {
            error: error.code.startsWith("VAPID")
              ? "Bildirim sunucusunun anahtar yapılandırması doğrulanamadı."
              : error.code === "PUSH_ENCRYPTION_FAILED"
                ? "Bildirim şifrelenemedi. Sunucu yapılandırmasını kontrol edin."
                : "Bildirim sunucusuna ulaşılamadı. Daha sonra tekrar deneyin.",
            code: error.code,
          },
          error.status,
        );
      }
      return reply(
        { error: error instanceof ApiError ? error.message : "İşlem tamamlanamadı. Daha sonra tekrar deneyin." },
        error instanceof ApiError ? error.status : 500,
      );
    }
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runReminders(env));
  },
};
