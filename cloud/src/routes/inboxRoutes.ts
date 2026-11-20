import { MAX_ATTACHMENT, RETENTION_SECONDS, exact, id, object, safeAttachment, text, validUrl } from "../../../shared/phone";
import { DESKTOP_ONLINE_THRESHOLD_MS, owner, rate, type RouteContext } from "../http";
import { ApiError, boundedBytes, jsonBody, reply, secure } from "../security";
import type { Actor } from "../types";

export async function handleInboxRoutes(ctx: RouteContext, actor: Actor): Promise<Response | null> {
  const { request, path, now, env } = ctx;

  if (path === "/api/workspaces" && request.method === "GET") {
    return reply({
      workspaces: (await env.DB.prepare("SELECT id,name,icon,description FROM workspace_mirrors ORDER BY name LIMIT 100").all()).results,
    });
  }

  if (path === "/api/workspaces" && request.method === "POST") {
    owner(actor);
    const body = await jsonBody(request);
    if (
      !object(body) ||
      !exact(body, ["workspaces"]) ||
      !Array.isArray(body.workspaces) ||
      body.workspaces.length > 100 ||
      !body.workspaces.every(
        (item) =>
          object(item) &&
          exact(item, ["id", "name", "icon", "description"]) &&
          id(item.id) &&
          text(item.name, 160, true) &&
          text(item.icon, 16) &&
          text(item.description, 2000),
      )
    ) {
      throw new ApiError(400, "Çalışma alanı bilgileri geçersiz.");
    }
    await env.DB.batch([
      env.DB.prepare("DELETE FROM workspace_mirrors"),
      ...body.workspaces.map((item) =>
        env.DB.prepare("INSERT INTO workspace_mirrors(id,name,icon,description) VALUES(?,?,?,?)").bind(
          item.id,
          item.name,
          item.icon,
          item.description,
        ),
      ),
    ]);
    return reply({ ok: true });
  }

  if (path === "/api/commands" && request.method === "POST") {
    if (actor.owner) throw new ApiError(403, "Bu istek telefondan gönderilir.");
    const body = await jsonBody(request);
    if (!object(body) || !exact(body, ["workspaceId", "requestId"]) || !id(body.workspaceId) || !id(body.requestId)) {
      throw new ApiError(400, "Çalışma alanı isteği geçersiz.");
    }
    if (!(await env.DB.prepare("SELECT id FROM workspace_mirrors WHERE id=?").bind(body.workspaceId).first())) {
      throw new ApiError(404, "Çalışma alanı bulunamadı.");
    }
    const previous = await env.DB.prepare("SELECT workspace_id,device_id FROM remote_commands WHERE id=?")
      .bind(body.requestId)
      .first<{ workspace_id: string; device_id: string }>();
    if (previous && (previous.workspace_id !== body.workspaceId || previous.device_id !== actor.id)) {
      throw new ApiError(409, "İstek kimliği daha önce kullanılmış.");
    }
    const pc = await env.DB.prepare("SELECT last_seen FROM desktop_state WHERE id=1").first<{ last_seen: number }>();
    const offline = now - (pc?.last_seen ?? 0) >= DESKTOP_ONLINE_THRESHOLD_MS;
    await env.DB.prepare(
      "INSERT INTO remote_commands(id,kind,workspace_id,created_at,expires_at,queued_offline,device_id) VALUES(?,'launch_workspace',?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
    )
      .bind(body.requestId, body.workspaceId, now, now + 600000, Number(offline), actor.id)
      .run();
    return reply({ ok: true, offline, expiresAt: now + 600000 });
  }

  if (path === "/api/commands" && request.method === "GET") {
    owner(actor);
    return reply({
      commands: (
        await env.DB.prepare(
          "SELECT c.id,c.workspace_id AS workspaceId,c.created_at AS createdAt,c.expires_at AS expiresAt,c.queued_offline AS queuedOffline FROM remote_commands c JOIN devices d ON d.id=c.device_id WHERE c.state='pending' AND c.expires_at>? AND d.revoked_at IS NULL ORDER BY c.created_at LIMIT 10",
        )
          .bind(now)
          .all()
      ).results,
    });
  }

  if (path === "/api/commands/claim" && request.method === "POST") {
    owner(actor);
    const body = await jsonBody(request);
    if (!object(body) || !exact(body, ["id"]) || !id(body.id)) throw new ApiError(400, "İstek geçersiz.");
    const command = await env.DB.prepare(
      "UPDATE remote_commands SET state='claimed' WHERE id=? AND state='pending' AND expires_at>? AND device_id IN (SELECT id FROM devices WHERE revoked_at IS NULL) RETURNING workspace_id AS workspaceId,expires_at AS expiresAt",
    )
      .bind(body.id, now)
      .first();
    if (!command) throw new ApiError(409, "İsteğin süresi dolmuş veya daha önce işlenmiş.");
    return reply(command);
  }

  if (path === "/api/commands/result" && request.method === "POST") {
    owner(actor);
    const body = await jsonBody(request);
    if (!object(body) || !exact(body, ["id", "result"]) || !id(body.id) || !["done", "failed", "cancelled"].includes(String(body.result))) {
      throw new ApiError(400, "İstek sonucu geçersiz.");
    }
    await env.DB.prepare("UPDATE remote_commands SET state=?,result=? WHERE id=? AND state IN ('pending','claimed')")
      .bind(body.result, body.result, body.id)
      .run();
    return reply({ ok: true });
  }

  if (path === "/api/inbox" && request.method === "GET") {
    return reply({
      items: (
        await env.DB.prepare(
          "SELECT id,kind,title,content,mime,size,expires_at AS expiresAt,handled,created_at AS createdAt FROM inbox_items ORDER BY created_at DESC LIMIT 100",
        ).all()
      ).results,
    });
  }

  if (path === "/api/inbox" && request.method === "POST") {
    if (actor.owner) throw new ApiError(403, "Gelenler telefondan gönderilir.");
    const body = await jsonBody(request);
    if (
      !object(body) ||
      !exact(body, ["id", "kind", "title", "content"]) ||
      !id(body.id) ||
      !["text", "link", "ai_prompt"].includes(String(body.kind)) ||
      !text(body.title, 180, true) ||
      !text(body.content, 20000, true) ||
      (body.kind === "link" && !validUrl(body.content))
    ) {
      throw new ApiError(400, "Gönderi bilgileri geçersiz.");
    }
    await env.DB.prepare(
      "INSERT INTO inbox_items(id,kind,title,content,created_at,device_id) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
    )
      .bind(body.id, body.kind, body.title, body.content, now, actor.id)
      .run();
    return reply({ ok: true });
  }

  const inboxMatch = path.match(/^\/api\/inbox\/([\w.-]{1,128})$/);
  if (inboxMatch && ["PATCH", "DELETE", "PUT"].includes(request.method)) {
    const item = await env.DB.prepare("SELECT kv_key, device_id FROM inbox_items WHERE id=?")
      .bind(inboxMatch[1])
      .first<{ kv_key: string | null; device_id: string | null }>();
    if (!item) throw new ApiError(404, "Kayıt bulunamadı.");
    if (request.method === "DELETE") {
      if (!actor.owner && item.device_id !== actor.id) {
        throw new ApiError(403, "Bu gönderiyi sadece oluşturan cihaz veya bilgisayar silebilir.");
      }
      await env.DB.prepare("DELETE FROM inbox_items WHERE id=?").bind(inboxMatch[1]).run();
      if (item.kv_key) await env.ATTACHMENTS.delete(item.kv_key);
      return reply({ ok: true });
    }
    if (request.method === "PUT") {
      if (!actor.owner && item.device_id !== actor.id) {
        throw new ApiError(403, "Bu gönderiyi sadece oluşturan cihaz veya bilgisayar düzenleyebilir.");
      }
      const body = await jsonBody(request);
      if (!object(body) || !text(body.title, 180, true)) throw new ApiError(400, "Gönderi başlığı geçersiz.");
      const newContent = typeof body.content === "string" ? body.content : body.title;
      await env.DB.prepare("UPDATE inbox_items SET title=?, content=? WHERE id=?").bind(body.title, newContent, inboxMatch[1]).run();
      return reply({ ok: true });
    }
    if (request.method === "PATCH") {
      let nextHandled = 1;
      try {
        const body = await jsonBody(request);
        if (object(body) && (body.handled === 0 || body.handled === false)) {
          nextHandled = 0;
        }
      } catch {}
      await env.DB.prepare("UPDATE inbox_items SET handled=? WHERE id=?").bind(nextHandled, inboxMatch[1]).run();
      return reply({ ok: true, handled: nextHandled });
    }
  }

  if (path === "/api/attachments" && request.method === "POST") {
    if (actor.owner) throw new ApiError(403, "Dosyalar telefondan gönderilir.");
    await rate(env, `uploads:${actor.id}`, 20, 86400);
    const name = request.headers.get("X-File-Name") ? decodeURIComponent(request.headers.get("X-File-Name")!) : "";
    const mime = request.headers.get("Content-Type")?.split(";")[0] ?? "";
    const itemId = request.headers.get("X-Request-Id");
    if (!itemId || !id(itemId)) throw new ApiError(400, "Gönderi kimliği geçersiz.");
    if (await env.DB.prepare("SELECT id FROM inbox_items WHERE id=? AND device_id=?").bind(itemId, actor.id).first()) {
      return reply({ ok: true });
    }
    const bytes = await boundedBytes(request, MAX_ATTACHMENT);
    if (!safeAttachment(name, mime, bytes)) throw new ApiError(415, "Bu dosya türü veya içeriği desteklenmiyor.");
    const capacity = await env.DB.prepare("SELECT COALESCE(SUM(size),0) AS used FROM inbox_items WHERE kv_key IS NOT NULL AND expires_at>?")
      .bind(now)
      .first<{ used: number }>();
    if ((capacity?.used ?? 0) + bytes.byteLength > 800 * 1024 * 1024) {
      throw new ApiError(413, "Geçici dosya alanı dolu. Eski gelen dosyalarını kaldırıp tekrar deneyin.");
    }
    const key = `inbox:${crypto.randomUUID()}`;
    await env.ATTACHMENTS.put(key, bytes, { expirationTtl: RETENTION_SECONDS });
    try {
      await env.DB.prepare(
        "INSERT INTO inbox_items(id,kind,title,mime,size,kv_key,expires_at,created_at,device_id) VALUES(?,'file',?,?,?,?,?,?,?)",
      )
        .bind(itemId, name, mime, bytes.byteLength, key, now + RETENTION_SECONDS * 1000, now, actor.id)
        .run();
    } catch {
      await env.ATTACHMENTS.delete(key);
      throw new ApiError(409, "Gönderi kaydedilemedi. Tekrar deneyin.");
    }
    return reply({ ok: true, expiresAt: now + RETENTION_SECONDS * 1000 });
  }

  const download = path.match(/^\/api\/attachments\/([\w.-]{1,128})$/);
  if (download && request.method === "GET") {
    const row = await env.DB.prepare("SELECT title,mime,kv_key,expires_at FROM inbox_items WHERE id=?")
      .bind(download[1])
      .first<{ title: string; mime: string; kv_key: string; expires_at: number }>();
    if (!row || row.expires_at <= now) throw new ApiError(410, "Dosyanın saklama süresi dolmuş.");
    const bytes = await env.ATTACHMENTS.get(row.kv_key, "arrayBuffer");
    if (!bytes) throw new ApiError(410, "Dosya henüz erişilebilir değil veya saklama süresi dolmuş.");
    return secure(
      new Response(bytes, {
        headers: {
          "Content-Type": row.mime,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.title)}`,
        },
      }),
    );
  }

  return null;
}
