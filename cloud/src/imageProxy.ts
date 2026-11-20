import { ApiError, secure } from "./security";
import { clientIpHash, corsReply, rate, type RouteContext } from "./http";

const MAX_PROXY_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROXY_HOSTS = [
  "m.media-amazon.com",
  "images-na.ssl-images-amazon.com",
  "images-amazon.com",
  "ia.media-imdb.com",
  "imdb.com",
  "static.tvmaze.com",
  "api.tvmaze.com",
  "image.tmdb.org",
  "themoviedb.org",
  "books.google.com",
  "googleusercontent.com",
  "covers.openlibrary.org",
  "openlibrary.org",
  "archive.org",
  "images.igdb.com",
  "steamstatic.com",
  "steampowered.com",
  "akamaihd.net",
  "rawg.io",
  "wikimedia.org",
  "wikipedia.org",
] as const;

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function isAllowedProxyHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_PROXY_HOSTS.some((h) => host === h || host.endsWith("." + h));
}

function isAllowedProxyUrl(target: URL): boolean {
  return (
    target.protocol === "https:" &&
    target.port === "" &&
    !target.username &&
    !target.password &&
    isAllowedProxyHost(target.hostname)
  );
}

async function fetchAllowedImage(startUrl: URL, method: string, timeoutMs = 10_000): Promise<Response> {
  if (!isAllowedProxyUrl(startUrl)) {
    throw new ApiError(403, "İzin verilmeyen görsel kaynağı");
  }
  let currentUrl = startUrl;
  for (let hop = 0; hop <= 2; hop++) {
    let res: Response;
    try {
      res = await fetch(currentUrl.toString(), {
        method,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ApiError(502, "Görsele ulaşılamadı");
    }
    if (!REDIRECT_STATUSES.has(res.status)) return res;
    await res.body?.cancel().catch(() => {});
    if (hop === 2) {
      throw new ApiError(502, "Çok fazla görsel yönlendirmesi.");
    }
    const location = res.headers.get("Location");
    if (!location) {
      throw new ApiError(502, "Geçersiz görsel yönlendirmesi.");
    }
    let nextUrl: URL;
    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      throw new ApiError(502, "Geçersiz görsel yönlendirmesi.");
    }
    if (!isAllowedProxyUrl(nextUrl)) {
      throw new ApiError(403, "İzin verilmeyen görsel yönlendirmesi");
    }
    currentUrl = nextUrl;
  }
  throw new ApiError(502, "Çok fazla görsel yönlendirmesi.");
}

async function boundedImageBytes(response: Response, max = MAX_PROXY_IMAGE_BYTES): Promise<Uint8Array> {
  const rawLength = response.headers.get("content-length");
  if (rawLength !== null) {
    const contentLength = Number(rawLength);
    if (Number.isFinite(contentLength) && contentLength > max) {
      await response.body?.cancel().catch(() => {});
      throw new ApiError(413, "Görsel en fazla 5 MB olabilir.");
    }
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      length += value.byteLength;
      if (length > max) {
        await reader.cancel().catch(() => {});
        throw new ApiError(413, "Görsel en fazla 5 MB olabilir.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return data;
}

export async function handleImageProxy({ request, url, env }: RouteContext): Promise<Response> {
  try {
    await rate(env, `image-proxy:${await clientIpHash(request, env)}`, 80, 60);
    const rawUrl = (url.searchParams.get("url") || "").trim();
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return corsReply({ ok: false, error: "Geçersiz URL" }, 400);
    }

    let imgRes = await fetchAllowedImage(parsed, request.method, 10_000);

    // Steam fallback: if library_600x900.jpg fails, try header.jpg through the same redirect/host checks
    if (!imgRes.ok && parsed.pathname.endsWith("/library_600x900.jpg")) {
      await imgRes.body?.cancel().catch(() => {});
      const fallbackTarget = new URL(parsed.toString());
      fallbackTarget.pathname = fallbackTarget.pathname.replace(/\/library_600x900\.jpg$/, "/header.jpg");
      try {
        const fallbackRes = await fetchAllowedImage(fallbackTarget, request.method, 8_000);
        if (fallbackRes.ok) {
          imgRes = fallbackRes;
        } else {
          await fallbackRes.body?.cancel().catch(() => {});
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 403) throw err;
      }
    }

    if (!imgRes.ok) {
      await imgRes.body?.cancel().catch(() => {});
      throw new ApiError(502, "Görsel indirilemedi");
    }

    const mime = (imgRes.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_IMAGE_MIMES.has(mime)) {
      await imgRes.body?.cancel().catch(() => {});
      throw new ApiError(415, "Desteklenmeyen görsel türü.");
    }

    const bytes = await boundedImageBytes(imgRes, MAX_PROXY_IMAGE_BYTES);
    return secure(
      new Response(request.method === "HEAD" ? null : bytes, {
        status: 200,
        headers: {
          "Content-Type": mime,
          "Cache-Control": "public, max-age=604800",
          "Access-Control-Allow-Origin": "*",
        },
      }),
      false,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      return corsReply({ ok: false, error: err.message }, err.status);
    }
    return corsReply({ ok: false, error: "Görsele ulaşılamadı" }, 502);
  }
}
