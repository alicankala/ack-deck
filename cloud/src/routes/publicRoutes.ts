import { findMenuForDate, turkeyDateKey, type DormMenuRecord } from "../../../shared/dormMenu";
import { exact, object, text } from "../../../shared/phone";
import { lookupTurkeyCity } from "../../../shared/prayerTimes";
import { weatherDescription, weatherSymbol } from "../../../shared/weather";
import { handleImageProxy } from "../imageProxy";
import { clientIpHash, corsReply, rate, type RouteContext } from "../http";
import { getMatchesWithCache } from "../matches";
import { fetchImdbRating, searchPublicMedia } from "../mediaSearch";
import { ApiError, hash, jsonBody, randomToken, reply } from "../security";

async function handleMatches(ctx: RouteContext): Promise<Response> {
  const { request, url, now, env } = ctx;
  const force = url.searchParams.get("force") === "1";
  try {
    const ipHash = await clientIpHash(request, env);
    await rate(env, `matches:${ipHash}`, 30, 60);
    if (force) await rate(env, `matches-force:${ipHash}`, 4, 300);
  } catch (err) {
    if (err instanceof ApiError) return corsReply({ ok: false, error: err.message }, err.status);
    throw err;
  }
  const payload = await getMatchesWithCache(env.ATTACHMENTS, force, now);
  return corsReply({ ok: true, ...payload });
}

async function handleDormMenu(ctx: RouteContext): Promise<Response> {
  const { request, url, now, env } = ctx;
  const force = url.searchParams.get("force") === "1";
  try {
    const ipHash = await clientIpHash(request, env);
    await rate(env, `dorm-menu:${ipHash}`, 30, 60);
    if (force) await rate(env, `dorm-menu-force:${ipHash}`, 4, 300);
  } catch (err) {
    if (err instanceof ApiError) return corsReply({ ok: false, error: err.message }, err.status);
    throw err;
  }
  try {
    const cached = (await env.ATTACHMENTS.get("dorm-menu:cache", "json")) as {
      fetchedAt: number;
      records: any[];
    } | null;

    // 3-hour cache TTL when today's menu is present; shorter cooldown after 12:30 when missing
    const todayKey = turkeyDateKey(new Date(now));
    const todayPublishMs = Date.parse(`${todayKey}T12:30:00+03:00`);
    const cachedMenu =
      cached && Array.isArray(cached.records)
        ? findMenuForDate(cached.records as DormMenuRecord[], todayKey)
        : null;
    const hasTodayMenu = Boolean(
      cachedMenu &&
        !cachedMenu.isFallback &&
        cachedMenu.date?.trim().startsWith(todayKey) &&
        cachedMenu.dinnerDishes.length > 0,
    );
    const cacheTtlMs = hasTodayMenu
      ? 3 * 3600 * 1000
      : !Number.isNaN(todayPublishMs) && now >= todayPublishMs && (cached?.fetchedAt ?? 0) < todayPublishMs
        ? 0
        : 15 * 60 * 1000;

    if (
      !force &&
      cached &&
      Array.isArray(cached.records) &&
      cached.records.length > 0 &&
      now - cached.fetchedAt < cacheTtlMs
    ) {
      return corsReply({ ok: true, records: cached.records, cached: true });
    }

    const res = await fetch("https://altinkalemkarabuk.com/icerik/icerik.json", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (res.ok) {
      const json = (await res.json()) as any;
      const records = json?.records ?? json?.menu?.kayitlar ?? [];
      if (records.length > 0) {
        try {
          await env.ATTACHMENTS.put(
            "dorm-menu:cache",
            JSON.stringify({ fetchedAt: now, records }),
            { expirationTtl: 86400 },
          );
        } catch {}
      }
      return corsReply({ ok: true, records });
    } else if (cached && Array.isArray(cached.records) && cached.records.length > 0) {
      return corsReply({ ok: true, records: cached.records, cached: true });
    }
  } catch {
    try {
      const cached = (await env.ATTACHMENTS.get("dorm-menu:cache", "json")) as {
        fetchedAt: number;
        records: any[];
      } | null;
      if (cached && Array.isArray(cached.records) && cached.records.length > 0) {
        return corsReply({ ok: true, records: cached.records, cached: true });
      }
    } catch {}
  }
  return corsReply({ ok: false, records: [] });
}

async function handleMediaSearch({ request, url, env }: RouteContext): Promise<Response> {
  const type = url.searchParams.get("type") || "movie";
  const q = url.searchParams.get("q") || "";
  if (!["movie", "series", "book", "game"].includes(type) || q.trim().length < 2) {
    return corsReply({ ok: true, results: [] });
  }
  try {
    await rate(env, `media-search:${await clientIpHash(request, env)}`, 40, 60);
    const results = await searchPublicMedia(type, q);
    return corsReply({ ok: true, results });
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) return corsReply({ ok: false, error: err.message }, 429);
    return corsReply({ ok: false, results: [] });
  }
}

async function handleMediaRating({ request, url, env }: RouteContext): Promise<Response> {
  const imdbId = (url.searchParams.get("imdbId") || "").trim();
  if (!/^tt\d{5,12}$/.test(imdbId)) {
    return corsReply({ ok: false, error: "Geçersiz IMDb ID" }, 400);
  }
  try {
    await rate(env, `media-rating:${await clientIpHash(request, env)}`, 60, 60);

    const cacheKey = `imdb-rating:${imdbId}`;
    const cached = await env.ATTACHMENTS.get(cacheKey);
    if (cached) {
      const ratingNum = parseFloat(cached);
      if (!isNaN(ratingNum) && ratingNum > 0) {
        return corsReply({ ok: true, imdbId, rating: ratingNum, cached: true });
      }
    }

    const rating = await fetchImdbRating(imdbId);
    if (typeof rating === "number" && rating > 0) {
      await env.ATTACHMENTS.put(cacheKey, String(rating), { expirationTtl: 14 * 86400 });
      return corsReply({ ok: true, imdbId, rating, cached: false });
    }

    return corsReply({ ok: false, imdbId, rating: null });
  } catch (err) {
    if (err instanceof ApiError && err.status === 429) return corsReply({ ok: false, error: err.message }, 429);
    return corsReply({ ok: false, imdbId, rating: null });
  }
}

export async function handleCorsPublicRoutes(ctx: RouteContext): Promise<Response | null> {
  const { path, request } = ctx;
  if (path === "/api/matches" && request.method === "GET") return handleMatches(ctx);
  if (path === "/api/dorm-menu" && request.method === "GET") return handleDormMenu(ctx);
  if (path === "/api/media-search" && request.method === "GET") return handleMediaSearch(ctx);
  if (path === "/api/media-rating" && request.method === "GET") return handleMediaRating(ctx);
  if (path === "/api/image-proxy" && (request.method === "GET" || request.method === "HEAD")) {
    return handleImageProxy(ctx);
  }
  return null;
}

export async function handleWeatherRoute({ request, url, env }: RouteContext): Promise<Response | null> {
  if (url.pathname !== "/api/weather" || request.method !== "GET") return null;
  await rate(env, `weather:${await clientIpHash(request, env)}`, 60, 60);
  const query = url.searchParams.get("city") || "Karabük";
  const cityData = lookupTurkeyCity(query) || { city: query, lat: 41.20488, lng: 32.62768 };
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${cityData.lat}&longitude=${cityData.lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&hourly=temperature_2m,weather_code&forecast_hours=24&timezone=auto`,
    );
    if (res.ok) {
      const data = (await res.json()) as any;
      const current = data.current;
      if (current) {
        const temp = Math.round(Number(current.temperature_2m) * 10) / 10;
        const code = Number(current.weather_code);
        const apparentTemperature =
          current.apparent_temperature !== undefined ? Math.round(Number(current.apparent_temperature) * 10) / 10 : temp;
        const humidity = current.relative_humidity_2m !== undefined ? Math.round(Number(current.relative_humidity_2m)) : undefined;
        const windSpeed = current.wind_speed_10m !== undefined ? Math.round(Number(current.wind_speed_10m)) : undefined;
        const tempMax = Array.isArray(data.daily?.temperature_2m_max)
          ? Math.round(Number(data.daily.temperature_2m_max[0]))
          : undefined;
        const tempMin = Array.isArray(data.daily?.temperature_2m_min)
          ? Math.round(Number(data.daily.temperature_2m_min[0]))
          : undefined;
        const hourly = Array.isArray(data.hourly?.time)
          ? data.hourly.time.slice(0, 12).map((t: string, idx: number) => ({
              time: t.slice(11, 16),
              temperature: Math.round(Number(data.hourly.temperature_2m[idx])),
              code: Number(data.hourly.weather_code[idx]),
            }))
          : [];
        return reply({
          city: cityData.city,
          temperature: temp,
          code,
          desc: weatherDescription(code),
          symbol: weatherSymbol(code),
          apparentTemperature,
          humidity,
          windSpeed,
          tempMax,
          tempMin,
          hourly,
        });
      }
    }
  } catch {}
  return reply({
    city: cityData.city,
    temperature: 14,
    code: 1,
    desc: "Az bulutlu",
    symbol: "🌤️",
  });
}

export async function handlePairExchangeRoute({ request, path, now, env }: RouteContext): Promise<Response | null> {
  if (path !== "/api/pair/exchange" || request.method !== "POST") return null;
  await rate(env, `pair:${await hash((request.headers.get("CF-Connecting-IP") ?? "local") + env.OWNER_SECRET)}`, 8);
  const body = await jsonBody(request);
  if (!object(body) || !exact(body, ["code", "name"]) || !text(body.code, 100, true) || !text(body.name, 80, true)) {
    throw new ApiError(400, "Eşleştirme bilgileri geçersiz.");
  }
  const deviceId = crypto.randomUUID();
  const token = randomToken();
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM devices WHERE revoked_at IS NULL").first<{ count: number }>();
  if ((count?.count ?? 0) >= 5) {
    throw new ApiError(409, "En fazla 5 cihaz eşleştirilebilir. Önce eski bir cihazın erişimini kaldırın.");
  }
  const codeHash = await hash(body.code);
  // The consuming update and new device insert share one D1 transaction.
  const result = await env.DB.batch([
    env.DB.prepare("UPDATE pairing_codes SET used_at=? WHERE hash=? AND used_at IS NULL AND expires_at>? RETURNING hash").bind(
      now,
      codeHash,
      now,
    ),
    env.DB.prepare("INSERT INTO devices(id,name,token_hash,last_seen,created_at) SELECT ?,?,?,?,? WHERE changes()=1").bind(
      deviceId,
      body.name,
      await hash(token),
      now,
      now,
    ),
  ]);
  if (!result[0].meta.changes) throw new ApiError(400, "Eşleştirme kodu kullanılmış veya süresi dolmuş.");
  return reply({ token, device: { name: body.name } });
}
