import { ApiError, equalSecret, hash, reply } from "./security";
import type { Actor, Env } from "./types";

export const DESKTOP_ONLINE_THRESHOLD_MS = 45_000;

export interface RouteContext {
  request: Request;
  url: URL;
  path: string;
  now: number;
  env: Env;
}

export async function authenticate(request: Request, env: Env): Promise<Actor> {
  const token = request.headers.get("Authorization")?.match(/^Bearer ([\w.-]{32,256})$/)?.[1];
  if (!token) throw new ApiError(401, "Erişim yetkisi bulunamadı.");
  if (env.OWNER_SECRET && (await equalSecret(token, env.OWNER_SECRET))) {
    return { id: "owner", owner: true };
  }
  const device = await env.DB.prepare("SELECT id FROM devices WHERE token_hash=? AND revoked_at IS NULL")
    .bind(await hash(token))
    .first<{ id: string }>();
  if (!device) throw new ApiError(401, "Cihaz erişimi kaldırılmış veya eşleştirme geçersiz.");
  // A throttled last-seen update avoids writes on every API request.
  await env.DB.prepare("UPDATE devices SET last_seen=? WHERE id=? AND last_seen<?")
    .bind(Date.now(), device.id, Date.now() - 60000)
    .run();
  return { id: device.id, owner: false };
}

export function owner(actor: Actor) {
  if (!actor.owner) throw new ApiError(403, "Bu işlem bilgisayardan yapılmalıdır.");
}

export async function rate(env: Env, bucket: string, limit: number, seconds = 60) {
  const now = Date.now();
  const result = await env.DB.prepare(
    "INSERT INTO rate_limits(bucket,count,reset_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN reset_at<? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END RETURNING count",
  )
    .bind(bucket, now + seconds * 1000, now, now)
    .first<{ count: number }>();
  if (!result || result.count > limit) {
    throw new ApiError(429, "Çok sık istek gönderildi. Biraz sonra tekrar deneyin.");
  }
}

export async function clientIpHash(request: Request, env: Env): Promise<string> {
  return hash((request.headers.get("CF-Connecting-IP") ?? "local") + (env.OWNER_SECRET ?? ""));
}

export function corsReply(data: unknown, status = 200): Response {
  const resp = reply(data, status);
  resp.headers.set("Access-Control-Allow-Origin", "*");
  return resp;
}
