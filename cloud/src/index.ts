import { MAX_ATTACHMENT, RETENTION_SECONDS, exact, id, object, safeAttachment, text, validUrl } from "../../shared/phone";
import { ApiError, boundedBytes, equalSecret, hash, jsonBody, pushEndpoint, randomToken, reply, secure } from "./security";
import { mutate } from "./sync";
import { recordView, type Actor, type Env, type RecordRow } from "./types";
import { runReminders, sendNotification, PushFailure } from "./reminders";

async function authenticate(request: Request, env: Env): Promise<Actor> {
  const token = request.headers.get("Authorization")?.match(/^Bearer ([\w.-]{32,256})$/)?.[1];
  if (!token) throw new ApiError(401,"Erişim yetkisi bulunamadı.");
  if (env.OWNER_SECRET && await equalSecret(token,env.OWNER_SECRET)) return { id:"owner",owner:true };
  const device = await env.DB.prepare("SELECT id FROM devices WHERE token_hash=? AND revoked_at IS NULL").bind(await hash(token)).first<{id:string}>();
  if (!device) throw new ApiError(401,"Cihaz erişimi kaldırılmış veya eşleştirme geçersiz.");
  // A throttled last-seen update avoids writes on every API request.
  await env.DB.prepare("UPDATE devices SET last_seen=? WHERE id=? AND last_seen<?").bind(Date.now(),device.id,Date.now()-60000).run();
  return { id:device.id,owner:false };
}
function owner(actor: Actor) { if (!actor.owner) throw new ApiError(403,"Bu işlem bilgisayardan yapılmalıdır."); }
async function rate(env: Env, bucket: string, limit: number, seconds = 60) {
  const now = Date.now();
  const result = await env.DB.prepare("INSERT INTO rate_limits(bucket,count,reset_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN reset_at<? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<? THEN excluded.reset_at ELSE reset_at END RETURNING count").bind(bucket,now+seconds*1000,now,now).first<{count:number}>();
  if (!result || result.count > limit) throw new ApiError(429,"Çok sık istek gönderildi. Biraz sonra tekrar deneyin.");
}
async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url), path = url.pathname, now = Date.now();
  if (url.protocol !== "https:" && !["localhost","127.0.0.1"].includes(url.hostname)) throw new ApiError(400,"Güvenli bağlantı gereklidir.");
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) throw new ApiError(403,"Bu kaynaktan erişime izin verilmiyor.");
  if (!path.startsWith("/api/")) return secure(await env.ASSETS.fetch(request),false);
  if (!env.OWNER_SECRET || env.OWNER_SECRET.length < 32) throw new ApiError(503,"Telefon sunucusu henüz yapılandırılmamış.");
  if (request.method === "OPTIONS") throw new ApiError(403,"Çapraz kaynak erişimi desteklenmiyor.");
  if (path === "/api/pair/exchange" && request.method === "POST") {
    await rate(env,`pair:${await hash((request.headers.get("CF-Connecting-IP") ?? "local") + env.OWNER_SECRET)}`,8);
    const body = await jsonBody(request);
    if (!object(body) || !exact(body,["code","name"]) || !text(body.code,100,true) || !text(body.name,80,true)) throw new ApiError(400,"Eşleştirme bilgileri geçersiz.");
    const deviceId = crypto.randomUUID(), token = randomToken();
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM devices WHERE revoked_at IS NULL").first<{count:number}>();
    if ((count?.count ?? 0) >= 5) throw new ApiError(409,"En fazla 5 cihaz eşleştirilebilir. Önce eski bir cihazın erişimini kaldırın.");
    const codeHash = await hash(body.code);
    // The consuming update and new device insert share one D1 transaction.
    const result = await env.DB.batch([
      env.DB.prepare("UPDATE pairing_codes SET used_at=? WHERE hash=? AND used_at IS NULL AND expires_at>? RETURNING hash").bind(now,codeHash,now),
      env.DB.prepare("INSERT INTO devices(id,name,token_hash,last_seen,created_at) SELECT ?,?,?,?,? WHERE changes()=1").bind(deviceId,body.name,await hash(token),now,now),
    ]);
    if (!result[0].meta.changes) throw new ApiError(400,"Eşleştirme kodu kullanılmış veya süresi dolmuş.");
    return reply({ token, device:{name:body.name} });
  }
  const actor = await authenticate(request,env);
  await rate(env,`api:${actor.id}`,120);
  if (path === "/api/status" && request.method === "GET") {
    const pc = await env.DB.prepare("SELECT last_seen FROM desktop_state WHERE id=1").first<{last_seen:number}>();
    const notification = actor.owner ? null : await env.DB.prepare("SELECT active FROM push_subscriptions WHERE device_id=?").bind(actor.id).first<{active:number}>();
    return reply({ online:now-(pc?.last_seen ?? 0)<150000, notifications:!!notification?.active, vapidPublicKey:env.VAPID_PUBLIC_KEY ?? "", now });
  }
  if (path === "/api/pair" && request.method === "POST") {
    owner(actor); const code = randomToken();
    await env.DB.prepare("INSERT INTO pairing_codes(hash,expires_at) VALUES(?,?)").bind(await hash(code),now+300000).run();
    return reply({ url:`${url.origin}/#pair=${code}`, code, expiresAt:now+300000 });
  }
  if (path === "/api/devices" && request.method === "GET") {
    owner(actor); return reply({ devices:(await env.DB.prepare("SELECT d.id,d.name,d.last_seen AS lastSeen,p.active AS notifications FROM devices d LEFT JOIN push_subscriptions p ON p.device_id=d.id WHERE d.revoked_at IS NULL ORDER BY d.created_at").all()).results });
  }
  if (path === "/api/revoke" && request.method === "POST") {
    const body = await jsonBody(request); if (!object(body) || !exact(body,["deviceId"]) || !id(body.deviceId) || (!actor.owner && body.deviceId !== actor.id)) throw new ApiError(400,"Cihaz bilgisi geçersiz.");
    await env.DB.batch([env.DB.prepare("UPDATE devices SET revoked_at=? WHERE id=?").bind(now,body.deviceId),env.DB.prepare("DELETE FROM push_subscriptions WHERE device_id=?").bind(body.deviceId),env.DB.prepare("UPDATE remote_commands SET state='cancelled' WHERE device_id=? AND state='pending'").bind(body.deviceId)]);
    return reply({ ok:true });
  }
  if (path === "/api/me" && request.method === "GET") { if (actor.owner) return reply({ name:"ACKDeck" }); return reply(await env.DB.prepare("SELECT name,id FROM devices WHERE id=?").bind(actor.id).first()); }
  if (path === "/api/me" && request.method === "POST") {
    const body = await jsonBody(request); if (actor.owner || !object(body) || !exact(body,["name"]) || !text(body.name,80,true)) throw new ApiError(400,"Cihaz adı geçersiz.");
    await env.DB.prepare("UPDATE devices SET name=? WHERE id=?").bind(body.name,actor.id).run(); return reply({ok:true});
  }
  if (path === "/api/push" && request.method === "POST") {
    if (actor.owner) throw new ApiError(403,"Bildirimler telefondan açılır.");
    const body = await jsonBody(request);
    if (!object(body) || !exact(body,["endpoint","expirationTime","keys"]) || !text(body.endpoint,4096,true) || !pushEndpoint(body.endpoint) || !object(body.keys) || !exact(body.keys,["p256dh","auth"]) || !text(body.keys.p256dh,150,true) || !/^[\w-]{87}$/.test(body.keys.p256dh) || !text(body.keys.auth,40,true) || !/^[\w-]{22}$/.test(body.keys.auth) || (body.expirationTime !== null && typeof body.expirationTime !== "number")) throw new ApiError(400,"Bildirim aboneliği geçersiz.");
    await env.DB.prepare("INSERT INTO push_subscriptions(device_id,subscription,active,updated_at) VALUES(?,?,1,?) ON CONFLICT(device_id) DO UPDATE SET subscription=excluded.subscription,active=1,updated_at=excluded.updated_at").bind(actor.id,JSON.stringify(body),now).run(); return reply({ ok:true });
  }
  if (["/api/push/test","/api/push/test-device"].includes(path) && request.method === "POST") {
    let target=actor.id;
    if(path.endsWith("test-device")){owner(actor);const body=await jsonBody(request);if(!object(body)||!exact(body,["deviceId"])||!id(body.deviceId))throw new ApiError(400,"Cihaz bilgisi geçersiz.");target=body.deviceId;}else if(actor.owner)throw new ApiError(403,"Test telefondan başlatılır.");
    await rate(env,`push-test:${target}`,2,60);
    const sub = await env.DB.prepare("SELECT p.subscription FROM push_subscriptions p JOIN devices d ON d.id=p.device_id WHERE p.device_id=? AND p.active=1 AND d.revoked_at IS NULL").bind(target).first<{subscription:string}>();
    if (!sub) return reply({error:"Push aboneliği bulunamadı. Bildirimleri Aç düğmesini kullanın.",code:"PUSH_SUBSCRIPTION_MISSING"},400);
    const result = await sendNotification(env,sub.subscription,{ title:"ACKDeck",body:"Telefon bildirimleri hazır.",url:"/",tag:crypto.randomUUID() });
    if(!result.ok){console.warn(JSON.stringify({event:"push_rejected",status:result.status}));if([404,410].includes(result.status)){await env.DB.prepare("UPDATE push_subscriptions SET active=0 WHERE device_id=?").bind(target).run();return reply({error:"Bildirim aboneliğinin süresi dolmuş. Bildirimleri yeniden açın.",code:"PUSH_SUBSCRIPTION_EXPIRED"},410);}return reply({error:"Bildirim sunucuya gönderilemedi. Biraz sonra tekrar deneyin.",code:"PUSH_SERVICE_REJECTED"},502);}return reply({ok:true});
  }
  if (path === "/api/sync" && request.method === "GET") {
    const cursor = Number(url.searchParams.get("cursor") ?? "0"); if (!Number.isSafeInteger(cursor) || cursor<0) throw new ApiError(400,"Eşitleme bilgisi geçersiz.");
    const changes = await env.DB.prepare("SELECT seq,kind,record_id FROM changes WHERE seq>? ORDER BY seq LIMIT 40").bind(cursor).all<{seq:number;kind:string;record_id:string}>();
    const unique = new Map(changes.results.map(change => [`${change.kind}:${change.record_id}`,change]));
    const records = await Promise.all([...unique.values()].map(change => env.DB.prepare(`SELECT * FROM ${change.kind==="subscriptions"?"subscriptions":"records"} WHERE kind=? AND id=?`).bind(change.kind,change.record_id).first<RecordRow>()));
    const views=records.filter((row):row is RecordRow => !!row).map(recordView);
    // Installed 1.0 clients have an exact task/note schema. Keep their original
    // records usable until the user opens the 1.1 desktop/PWA; never flatten a
    // recurring series into a one-shot task or return an unknown record kind.
    const compatible=request.headers.get("X-ACKDeck-Schema")==="2"?views:views.filter(row=>row.kind!=="subscriptions"&&(row.deleted||row.kind!=="tasks"||!row.data?.recurrence)).map(row=>{
      if(row.kind!=="tasks"||row.deleted)return row;
      const {recurrence:_rule,occurrenceAt:_occurrence,lastCompletedAt:_completed,snoozedUntil:_snooze,...data}=row.data;
      return {...row,data};
    });
    return reply({ records:compatible, cursor:changes.results.at(-1)?.seq ?? cursor, more:changes.results.length===40 });
  }
  if (path === "/api/mutations" && request.method === "POST") return reply(await mutate(env,actor,await jsonBody(request)));
  if (path === "/api/heartbeat" && request.method === "POST") {
    owner(actor); await env.DB.prepare("UPDATE desktop_state SET last_seen=? WHERE id=1").bind(now).run(); return reply({ok:true});
  }
  if (path === "/api/workspaces" && request.method === "GET") return reply({ workspaces:(await env.DB.prepare("SELECT id,name,icon,description FROM workspace_mirrors ORDER BY name LIMIT 100").all()).results });
  if (path === "/api/workspaces" && request.method === "POST") {
    owner(actor); const body = await jsonBody(request);
    if (!object(body) || !exact(body,["workspaces"]) || !Array.isArray(body.workspaces) || body.workspaces.length>100 || !body.workspaces.every(item => object(item) && exact(item,["id","name","icon","description"]) && id(item.id) && text(item.name,160,true) && text(item.icon,16) && text(item.description,2000))) throw new ApiError(400,"Çalışma alanı bilgileri geçersiz.");
    await env.DB.batch([env.DB.prepare("DELETE FROM workspace_mirrors"),...body.workspaces.map(item => env.DB.prepare("INSERT INTO workspace_mirrors(id,name,icon,description) VALUES(?,?,?,?)").bind(item.id,item.name,item.icon,item.description))]); return reply({ok:true});
  }
  if (path === "/api/commands" && request.method === "POST") {
    if (actor.owner) throw new ApiError(403,"Bu istek telefondan gönderilir.");
    const body = await jsonBody(request); if (!object(body) || !exact(body,["workspaceId","requestId"]) || !id(body.workspaceId) || !id(body.requestId)) throw new ApiError(400,"Çalışma alanı isteği geçersiz.");
    if (!await env.DB.prepare("SELECT id FROM workspace_mirrors WHERE id=?").bind(body.workspaceId).first()) throw new ApiError(404,"Çalışma alanı bulunamadı.");
    const previous = await env.DB.prepare("SELECT workspace_id,device_id FROM remote_commands WHERE id=?").bind(body.requestId).first<{workspace_id:string;device_id:string}>();
    if(previous && (previous.workspace_id!==body.workspaceId || previous.device_id!==actor.id))throw new ApiError(409,"İstek kimliği daha önce kullanılmış.");
    const pc = await env.DB.prepare("SELECT last_seen FROM desktop_state WHERE id=1").first<{last_seen:number}>(); const offline = now-(pc?.last_seen ?? 0)>=150000;
    await env.DB.prepare("INSERT INTO remote_commands(id,kind,workspace_id,created_at,expires_at,queued_offline,device_id) VALUES(?,'launch_workspace',?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(body.requestId,body.workspaceId,now,now+600000,Number(offline),actor.id).run();
    return reply({ ok:true,offline, expiresAt:now+600000 });
  }
  if (path === "/api/commands" && request.method === "GET") {
    owner(actor); return reply({commands:(await env.DB.prepare("SELECT c.id,c.workspace_id AS workspaceId,c.created_at AS createdAt,c.expires_at AS expiresAt,c.queued_offline AS queuedOffline FROM remote_commands c JOIN devices d ON d.id=c.device_id WHERE c.state='pending' AND c.expires_at>? AND d.revoked_at IS NULL ORDER BY c.created_at LIMIT 10").bind(now).all()).results});
  }
  if (path === "/api/commands/claim" && request.method === "POST") {
    owner(actor); const body = await jsonBody(request); if (!object(body) || !exact(body,["id"]) || !id(body.id)) throw new ApiError(400,"İstek geçersiz.");
    const command = await env.DB.prepare("UPDATE remote_commands SET state='claimed' WHERE id=? AND state='pending' AND expires_at>? AND device_id IN (SELECT id FROM devices WHERE revoked_at IS NULL) RETURNING workspace_id AS workspaceId,expires_at AS expiresAt").bind(body.id,now).first();
    if (!command) throw new ApiError(409,"İsteğin süresi dolmuş veya daha önce işlenmiş."); return reply(command);
  }
  if (path === "/api/commands/result" && request.method === "POST") {
    owner(actor); const body = await jsonBody(request); if (!object(body) || !exact(body,["id","result"]) || !id(body.id) || !["done","failed","cancelled"].includes(String(body.result))) throw new ApiError(400,"İstek sonucu geçersiz.");
    await env.DB.prepare("UPDATE remote_commands SET state=?,result=? WHERE id=? AND state IN ('pending','claimed')").bind(body.result,body.result,body.id).run(); return reply({ok:true});
  }
  if (path === "/api/inbox" && request.method === "GET") return reply({items:(await env.DB.prepare("SELECT id,kind,title,content,mime,size,expires_at AS expiresAt,handled,created_at AS createdAt FROM inbox_items ORDER BY created_at DESC LIMIT 100").all()).results});
  if (path === "/api/inbox" && request.method === "POST") {
    if (actor.owner) throw new ApiError(403,"Gelenler telefondan gönderilir.");
    const body = await jsonBody(request); if (!object(body) || !exact(body,["id","kind","title","content"]) || !id(body.id) || !["text","link","ai_prompt"].includes(String(body.kind)) || !text(body.title,180,true) || !text(body.content,20000,true) || (body.kind === "link" && !validUrl(body.content))) throw new ApiError(400,"Gönderi bilgileri geçersiz.");
    await env.DB.prepare("INSERT INTO inbox_items(id,kind,title,content,created_at,device_id) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING").bind(body.id,body.kind,body.title,body.content,now,actor.id).run(); return reply({ok:true});
  }
  const inboxMatch = path.match(/^\/api\/inbox\/([\w.-]{1,128})$/);
  if (inboxMatch && ["PATCH","DELETE"].includes(request.method)) {
    owner(actor); const item = await env.DB.prepare("SELECT kv_key FROM inbox_items WHERE id=?").bind(inboxMatch[1]).first<{kv_key:string|null}>();
    if (request.method === "PATCH") await env.DB.prepare("UPDATE inbox_items SET handled=1 WHERE id=?").bind(inboxMatch[1]).run();
    else { await env.DB.prepare("DELETE FROM inbox_items WHERE id=?").bind(inboxMatch[1]).run(); if (item?.kv_key) await env.ATTACHMENTS.delete(item.kv_key); }
    return reply({ok:true});
  }
  if (path === "/api/attachments" && request.method === "POST") {
    if (actor.owner) throw new ApiError(403,"Dosyalar telefondan gönderilir."); await rate(env,`uploads:${actor.id}`,20,86400);
    const name = request.headers.get("X-File-Name") ? decodeURIComponent(request.headers.get("X-File-Name")!) : "";
    const mime = request.headers.get("Content-Type")?.split(";")[0] ?? "", itemId = request.headers.get("X-Request-Id");
    if (!itemId || !id(itemId)) throw new ApiError(400,"Gönderi kimliği geçersiz.");
    if (await env.DB.prepare("SELECT id FROM inbox_items WHERE id=? AND device_id=?").bind(itemId,actor.id).first()) return reply({ok:true});
    const bytes = await boundedBytes(request,MAX_ATTACHMENT);
    if (!safeAttachment(name,mime,bytes)) throw new ApiError(415,"Bu dosya türü veya içeriği desteklenmiyor.");
    const capacity = await env.DB.prepare("SELECT COALESCE(SUM(size),0) AS used FROM inbox_items WHERE kv_key IS NOT NULL AND expires_at>?").bind(now).first<{used:number}>();
    if((capacity?.used??0)+bytes.byteLength>800*1024*1024)throw new ApiError(413,"Geçici dosya alanı dolu. Eski gelen dosyalarını kaldırıp tekrar deneyin.");
    const key = `inbox:${crypto.randomUUID()}`;
    await env.ATTACHMENTS.put(key,bytes,{expirationTtl:RETENTION_SECONDS});
    try { await env.DB.prepare("INSERT INTO inbox_items(id,kind,title,mime,size,kv_key,expires_at,created_at,device_id) VALUES(?,'file',?,?,?,?,?,?,?)").bind(itemId,name,mime,bytes.byteLength,key,now+RETENTION_SECONDS*1000,now,actor.id).run(); } catch { await env.ATTACHMENTS.delete(key); throw new ApiError(409,"Gönderi kaydedilemedi. Tekrar deneyin."); }
    return reply({ok:true,expiresAt:now+RETENTION_SECONDS*1000});
  }
  const download = path.match(/^\/api\/attachments\/([\w.-]{1,128})$/);
  if (download && request.method === "GET") {
    const row = await env.DB.prepare("SELECT title,mime,kv_key,expires_at FROM inbox_items WHERE id=?").bind(download[1]).first<{title:string;mime:string;kv_key:string;expires_at:number}>();
    if (!row || row.expires_at<=now) throw new ApiError(410,"Dosyanın saklama süresi dolmuş.");
    const bytes = await env.ATTACHMENTS.get(row.kv_key,"arrayBuffer"); if (!bytes) throw new ApiError(410,"Dosya henüz erişilebilir değil veya saklama süresi dolmuş.");
    return secure(new Response(bytes,{headers:{"Content-Type":row.mime,"Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(row.title)}`}}));
  }
  throw new ApiError(404,"İşlem bulunamadı.");
}
export default {
  async fetch(request: Request, env: Env) { try { return await handle(request,env); } catch (error) { if(error instanceof PushFailure)return reply({error:error.code.startsWith("VAPID")?"Bildirim sunucusunun anahtar yapılandırması doğrulanamadı.":error.code==="PUSH_ENCRYPTION_FAILED"?"Bildirim şifrelenemedi. Sunucu yapılandırmasını kontrol edin.":"Bildirim sunucusuna ulaşılamadı. Daha sonra tekrar deneyin.",code:error.code},error.status);return reply({error:error instanceof ApiError ? error.message : "İşlem tamamlanamadı. Daha sonra tekrar deneyin."},error instanceof ApiError ? error.status : 500); } },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) { ctx.waitUntil(runReminders(env)); },
};
