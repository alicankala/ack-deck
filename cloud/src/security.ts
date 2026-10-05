import { MAX_ATTACHMENT } from "../../shared/phone";
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export const randomToken = () => { const bytes = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); };
export async function hash(value: string) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, "0")).join(""); }
export async function equalSecret(a: string, b: string) { const [x, y] = await Promise.all([hash(a), hash(b)]); let different = 0; for (let i = 0; i < 64; i++) different |= x.charCodeAt(i) ^ y.charCodeAt(i); return different === 0; }
export async function boundedBytes(request: Request, max = 65536): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length")) > max) throw new ApiError(413, max === MAX_ATTACHMENT ? "Dosya en fazla 10 MB olabilir." : "İstek çok büyük.");
  const reader = request.body?.getReader(); if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let length = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength; if (length > max) { await reader.cancel(); throw new ApiError(413, max === MAX_ATTACHMENT ? "Dosya en fazla 10 MB olabilir." : "İstek çok büyük."); } chunks.push(value); } } finally { reader.releaseLock(); }
  const data = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; } return data;
}
export async function jsonBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new ApiError(415, "İstek biçimi desteklenmiyor.");
  try { return JSON.parse(new TextDecoder().decode(await boundedBytes(request))); } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, "İstek okunamadı."); }
}
export function secure(response: Response, api = true) {
  const result = new Response(response.body, response);
  result.headers.set("X-Content-Type-Options", "nosniff"); result.headers.set("Referrer-Policy", "no-referrer"); result.headers.set("X-Frame-Options", "DENY");
  result.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  result.headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)");
  if (api) result.headers.set("Cache-Control", "no-store"); return result;
}
export const reply = (data: unknown, status = 200) => secure(Response.json(data, { status }));
export function pushEndpoint(value: string): boolean {
  try { const url = new URL(value); return url.protocol === "https:" && url.port === "" && !url.username && !url.password && (url.hostname === "web.push.apple.com" || url.hostname.endsWith(".push.apple.com") || url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com" || url.hostname.endsWith(".notify.windows.com")); } catch { return false; }
}
