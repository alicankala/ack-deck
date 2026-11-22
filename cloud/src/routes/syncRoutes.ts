import { exact, id, object, text } from "../../../shared/phone";
import { DESKTOP_ONLINE_THRESHOLD_MS, owner, rate, type RouteContext } from "../http";
import { hasEncryptedGeminiKey } from "../mobileAi";
import { sendNotification } from "../reminders";
import { ApiError, hash, jsonBody, pushEndpoint, randomToken, reply } from "../security";
import { ensureSyncTables, mutate } from "../sync";
import { recordView, type Actor, type RecordRow } from "../types";

function parseJsonSafe<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function tableNameForKind(kind: string): string {
  switch (kind) {
    case "mediaItems":
      return "media_items";
    case "studyAttendance":
      return "study_attendance";
    case "prayerLogs":
      return "prayer_logs";
    case "studyPrograms":
      return "study_programs";
    case "subscriptions":
      return "subscriptions";
    case "projects":
      return "projects";
    default:
      return "records";
  }
}

export async function handleSyncRoutes(ctx: RouteContext, actor: Actor): Promise<Response | null> {
  const { request, url, path, now, env } = ctx;

  if (path === "/api/status" && request.method === "GET") {
    let pc: {
      last_seen: number;
      prayer_config?: string | null;
      study_reminders?: string | null;
      notification_preferences?: string | null;
    } | null = null;
    try {
      pc = await env.DB.prepare(
        "SELECT last_seen, prayer_config, study_reminders, notification_preferences FROM desktop_state WHERE id=1",
      ).first();
    } catch {
      try {
        pc = await env.DB.prepare("SELECT last_seen, prayer_config, study_reminders FROM desktop_state WHERE id=1").first();
      } catch {
        pc = await env.DB.prepare("SELECT last_seen, prayer_config FROM desktop_state WHERE id=1").first();
      }
    }
    const notification = actor.owner
      ? null
      : await env.DB.prepare("SELECT active FROM push_subscriptions WHERE device_id=?").bind(actor.id).first<{ active: number }>();
    let cloudAiUsage = null;
    try {
      const usageRow = await env.DB.prepare("SELECT value FROM app_settings WHERE key='ai_cloud_usage'").first<{ value: string }>();
      cloudAiUsage = parseJsonSafe(usageRow?.value);
    } catch {}
    const aiConfigured = await hasEncryptedGeminiKey(env);
    return reply({
      online: now - (pc?.last_seen ?? 0) < DESKTOP_ONLINE_THRESHOLD_MS,
      notifications: !!notification?.active,
      vapidPublicKey: env.VAPID_PUBLIC_KEY ?? "",
      prayerConfig: parseJsonSafe(pc?.prayer_config),
      studyReminders: parseJsonSafe(pc?.study_reminders),
      notificationPreferences: parseJsonSafe(pc?.notification_preferences),
      cloudAiUsage,
      aiConfigured,
      now,
    });
  }

  if (path === "/api/pair" && request.method === "POST") {
    owner(actor);
    const code = randomToken();
    await env.DB.prepare("INSERT INTO pairing_codes(hash,expires_at) VALUES(?,?)").bind(await hash(code), now + 300000).run();
    return reply({ url: `${url.origin}/#pair=${code}`, code, expiresAt: now + 300000 });
  }

  if (path === "/api/devices" && request.method === "GET") {
    owner(actor);
    return reply({
      devices: (
        await env.DB.prepare(
          "SELECT d.id,d.name,d.last_seen AS lastSeen,p.active AS notifications FROM devices d LEFT JOIN push_subscriptions p ON p.device_id=d.id WHERE d.revoked_at IS NULL ORDER BY d.created_at",
        ).all()
      ).results,
    });
  }

  if (path === "/api/revoke" && request.method === "POST") {
    const body = await jsonBody(request);
    if (!object(body) || !exact(body, ["deviceId"]) || !id(body.deviceId) || (!actor.owner && body.deviceId !== actor.id)) {
      throw new ApiError(400, "Cihaz bilgisi geçersiz.");
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE devices SET revoked_at=? WHERE id=?").bind(now, body.deviceId),
      env.DB.prepare("DELETE FROM push_subscriptions WHERE device_id=?").bind(body.deviceId),
      env.DB.prepare("UPDATE remote_commands SET state='cancelled' WHERE device_id=? AND state='pending'").bind(body.deviceId),
    ]);
    return reply({ ok: true });
  }

  if (path === "/api/me" && request.method === "GET") {
    if (actor.owner) return reply({ name: "ACKDeck" });
    return reply(await env.DB.prepare("SELECT name,id FROM devices WHERE id=?").bind(actor.id).first());
  }

  if (path === "/api/me" && request.method === "POST") {
    const body = await jsonBody(request);
    if (actor.owner || !object(body) || !exact(body, ["name"]) || !text(body.name, 80, true)) {
      throw new ApiError(400, "Cihaz adı geçersiz.");
    }
    await env.DB.prepare("UPDATE devices SET name=? WHERE id=?").bind(body.name, actor.id).run();
    return reply({ ok: true });
  }

  if (path === "/api/push" && request.method === "POST") {
    if (actor.owner) throw new ApiError(403, "Bildirimler telefondan açılır.");
    const body = await jsonBody(request);
    if (
      !object(body) ||
      !exact(body, ["endpoint", "expirationTime", "keys"]) ||
      !text(body.endpoint, 4096, true) ||
      !pushEndpoint(body.endpoint) ||
      !object(body.keys) ||
      !exact(body.keys, ["p256dh", "auth"]) ||
      !text(body.keys.p256dh, 150, true) ||
      !/^[\w-]{87}$/.test(body.keys.p256dh) ||
      !text(body.keys.auth, 40, true) ||
      !/^[\w-]{22}$/.test(body.keys.auth) ||
      (body.expirationTime !== null && typeof body.expirationTime !== "number")
    ) {
      throw new ApiError(400, "Bildirim aboneliği geçersiz.");
    }
    await env.DB.prepare(
      "INSERT INTO push_subscriptions(device_id,subscription,active,updated_at) VALUES(?,?,1,?) ON CONFLICT(device_id) DO UPDATE SET subscription=excluded.subscription,active=1,updated_at=excluded.updated_at",
    )
      .bind(actor.id, JSON.stringify(body), now)
      .run();
    return reply({ ok: true });
  }

  if (["/api/push/test", "/api/push/test-device"].includes(path) && request.method === "POST") {
    let target = actor.id;
    if (path.endsWith("test-device")) {
      owner(actor);
      const body = await jsonBody(request);
      if (!object(body) || !exact(body, ["deviceId"]) || !id(body.deviceId)) {
        throw new ApiError(400, "Cihaz bilgisi geçersiz.");
      }
      target = body.deviceId;
    } else if (actor.owner) {
      throw new ApiError(403, "Test telefondan başlatılır.");
    }
    await rate(env, `push-test:${target}`, 2, 60);
    const sub = await env.DB.prepare(
      "SELECT p.subscription FROM push_subscriptions p JOIN devices d ON d.id=p.device_id WHERE p.device_id=? AND p.active=1 AND d.revoked_at IS NULL",
    )
      .bind(target)
      .first<{ subscription: string }>();
    if (!sub) {
      return reply({ error: "Push aboneliği bulunamadı. Bildirimleri Aç düğmesini kullanın.", code: "PUSH_SUBSCRIPTION_MISSING" }, 400);
    }
    const result = await sendNotification(env, sub.subscription, {
      title: "ACKDeck",
      body: "Telefon bildirimleri hazır.",
      url: "/",
      tag: crypto.randomUUID(),
    });
    if (!result.ok) {
      console.warn(JSON.stringify({ event: "push_rejected", status: result.status }));
      if ([404, 410].includes(result.status)) {
        await env.DB.prepare("UPDATE push_subscriptions SET active=0 WHERE device_id=?").bind(target).run();
        return reply(
          { error: "Bildirim aboneliğinin süresi dolmuş. Bildirimleri yeniden açın.", code: "PUSH_SUBSCRIPTION_EXPIRED" },
          410,
        );
      }
      return reply(
        { error: "Bildirim sunucuya gönderilemedi. Biraz sonra tekrar deneyin.", code: "PUSH_SERVICE_REJECTED" },
        502,
      );
    }
    return reply({ ok: true });
  }

  if (path === "/api/sync" && request.method === "GET") {
    await ensureSyncTables(env);
    const cursor = Number(url.searchParams.get("cursor") ?? "0");
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new ApiError(400, "Eşitleme bilgisi geçersiz.");
    const changes = await env.DB.prepare("SELECT seq,kind,record_id FROM changes WHERE seq>? ORDER BY seq LIMIT 40")
      .bind(cursor)
      .all<{ seq: number; kind: string; record_id: string }>();
    const unique = new Map(changes.results.map((change) => [`${change.kind}:${change.record_id}`, change]));
    const records = await Promise.all(
      [...unique.values()].map((change) =>
        env.DB.prepare(`SELECT * FROM ${tableNameForKind(change.kind)} WHERE kind=? AND id=?`)
          .bind(change.kind, change.record_id)
          .first<RecordRow>(),
      ),
    );
    const views = records.filter((row): row is RecordRow => !!row).map(recordView);
    // Installed 1.0 clients have an exact task/note schema. Keep their original
    // records usable until the user opens the 1.1 desktop/PWA; never flatten a
    // recurring series into a one-shot task or return an unknown record kind.
    const schema = request.headers.get("X-ACKDeck-Schema");
    const stripped = views
      .filter(
        (row) =>
          row.kind !== "projects" &&
          row.kind !== "studyPrograms" &&
          row.kind !== "prayerLogs" &&
          row.kind !== "mediaItems" &&
          row.kind !== "studyAttendance",
      )
      .map((row) => {
        if (row.deleted || row.kind === "subscriptions") return row;
        const { projectId: _project, workspaceId: _space, sourceInboxId: _source, checklist: _checklist, reminderLeadMinutes: _lead, attachments: _attachments, ...data } =
          row.data;
        return { ...row, data };
      });
    const compatible =
      schema === "5"
        ? views
        : schema === "4"
          ? views.filter((row) => row.kind !== "mediaItems" && row.kind !== "studyAttendance")
          : schema === "3"
            ? views.filter(
                (row) =>
                  row.kind !== "studyPrograms" &&
                  row.kind !== "prayerLogs" &&
                  row.kind !== "mediaItems" &&
                  row.kind !== "studyAttendance",
              )
            : schema === "2"
              ? stripped
              : stripped
                  .filter((row) => row.kind !== "subscriptions" && (row.deleted || row.kind !== "tasks" || !row.data?.recurrence))
                  .map((row) => {
                    if (row.kind !== "tasks" || row.deleted) return row;
                    const { recurrence: _rule, occurrenceAt: _occurrence, lastCompletedAt: _completed, snoozedUntil: _snooze, ...data } =
                      row.data;
                    return { ...row, data };
                  });
    return reply({ records: compatible, cursor: changes.results.at(-1)?.seq ?? cursor, more: changes.results.length === 40 });
  }

  if (path === "/api/mutations" && request.method === "POST") {
    const schemaHeader = request.headers.get("X-ACKDeck-Schema");
    const result = await mutate(env, actor, await jsonBody(request), schemaHeader ?? "1");
    if (!["3", "4", "5"].includes(schemaHeader ?? "") && result.record?.data && ["tasks", "notes"].includes(result.record.kind)) {
      const { projectId: _p, workspaceId: _w, sourceInboxId: _s, checklist: _c, reminderLeadMinutes: _r, attachments: _a, ...data } =
        result.record.data as Record<string, unknown>;
      return reply({ ...result, record: { ...result.record, data } });
    }
    return reply(result);
  }

  if (path === "/api/heartbeat" && request.method === "POST") {
    owner(actor);
    const body = await jsonBody(request).catch(() => null);
    if (body && typeof body === "object" && (body as Record<string, unknown>).offline === true) {
      await env.DB.prepare("UPDATE desktop_state SET last_seen=0 WHERE id=1").run();
      return reply({ ok: true });
    }
    const hasPrayer = body && typeof body === "object" && "prayerConfig" in body && (body as any).prayerConfig;
    const hasStudy = body && typeof body === "object" && "studyReminders" in body && Array.isArray((body as any).studyReminders);
    const hasNotif = body && typeof body === "object" && "notificationPreferences" in body && (body as any).notificationPreferences;

    let effectivePrayerObj: Record<string, unknown> | null = null;
    try {
      const existingRow = await env.DB.prepare("SELECT prayer_config FROM desktop_state WHERE id=1").first<{
        prayer_config?: string | null;
      }>();
      const parsed = parseJsonSafe<Record<string, unknown>>(existingRow?.prayer_config);
      if (parsed && typeof parsed === "object") effectivePrayerObj = parsed;
    } catch {}

    let prayerConfigToWrite: string | null = null;
    if (hasPrayer && typeof (body as any).prayerConfig === "object") {
      const incoming = (body as any).prayerConfig as Record<string, unknown>;
      const storedTs = typeof effectivePrayerObj?.updatedAt === "number" ? effectivePrayerObj.updatedAt : 0;
      const incomingTs = typeof incoming.updatedAt === "number" ? incoming.updatedAt : 0;
      if (storedTs > incomingTs) {
        // Cloud (ör. mobil) daha yeni: masaüstünün eski ayarıyla üzerine yazma
        prayerConfigToWrite = null;
      } else {
        effectivePrayerObj = { ...incoming, updatedAt: incomingTs || now };
        prayerConfigToWrite = JSON.stringify(effectivePrayerObj);
      }
    }

    const rawStudy = hasStudy ? (body as { studyReminders: unknown[] }).studyReminders : null;
    const studyReminders = rawStudy && rawStudy.length <= 200 ? JSON.stringify(rawStudy) : null;
    const rawNotif =
      hasNotif && typeof (body as any).notificationPreferences === "object"
        ? JSON.stringify((body as any).notificationPreferences)
        : null;

    if (!prayerConfigToWrite && !studyReminders && !rawNotif) {
      // Lightweight keepalive: zero config rewriting, minimal single-cell last_seen update
      await env.DB.prepare("UPDATE desktop_state SET last_seen=? WHERE id=1").bind(now).run();
    } else {
      try {
        if (prayerConfigToWrite && studyReminders) {
          await env.DB.prepare("UPDATE desktop_state SET last_seen=?, prayer_config=?, study_reminders=? WHERE id=1")
            .bind(now, prayerConfigToWrite, studyReminders)
            .run();
        } else if (prayerConfigToWrite) {
          await env.DB.prepare("UPDATE desktop_state SET last_seen=?, prayer_config=? WHERE id=1")
            .bind(now, prayerConfigToWrite)
            .run();
        } else if (studyReminders) {
          await env.DB.prepare("UPDATE desktop_state SET last_seen=?, study_reminders=? WHERE id=1")
            .bind(now, studyReminders)
            .run();
        } else {
          await env.DB.prepare("UPDATE desktop_state SET last_seen=? WHERE id=1").bind(now).run();
        }
      } catch {
        if (prayerConfigToWrite) {
          await env.DB.prepare("UPDATE desktop_state SET last_seen=?, prayer_config=? WHERE id=1")
            .bind(now, prayerConfigToWrite)
            .run();
        } else {
          await env.DB.prepare("UPDATE desktop_state SET last_seen=? WHERE id=1").bind(now).run();
        }
      }
      if (rawNotif) {
        try {
          await env.DB.prepare("UPDATE desktop_state SET notification_preferences=? WHERE id=1").bind(rawNotif).run();
        } catch {}
      }
    }
    let cloudAiUsage = null;
    try {
      const usageRow = await env.DB.prepare("SELECT value FROM app_settings WHERE key='ai_cloud_usage'").first<{ value: string }>();
      cloudAiUsage = parseJsonSafe(usageRow?.value);
    } catch {}
    return reply({ ok: true, cloudAiUsage, ...(effectivePrayerObj ? { prayerConfig: effectivePrayerObj } : {}) });
  }

  if (path === "/api/study-reminders" && request.method === "POST") {
    const body = await jsonBody(request);
    if (!object(body) || !exact(body, ["studyReminders"]) || !Array.isArray(body.studyReminders) || body.studyReminders.length > 200) {
      throw new ApiError(400, "Ders hatırlatma ayarları geçersiz.");
    }
    const valid = body.studyReminders.every(
      (r: unknown) => object(r) && id(r.id) && (r.leadMinutes === null || [0, 15, 30, 60].includes(Number(r.leadMinutes))),
    );
    if (!valid) throw new ApiError(400, "Ders hatırlatma ayarları geçersiz.");
    await env.DB.prepare("UPDATE desktop_state SET study_reminders=? WHERE id=1").bind(JSON.stringify(body.studyReminders)).run();
    return reply({ ok: true });
  }

  if (path === "/api/prayer-config" && request.method === "POST") {
    const body = await jsonBody(request);
    if (
      !object(body) ||
      !exact(body, ["prayerConfig"]) ||
      !object(body.prayerConfig) ||
      typeof body.prayerConfig.city !== "string" ||
      typeof body.prayerConfig.latitude !== "number" ||
      typeof body.prayerConfig.longitude !== "number"
    ) {
      throw new ApiError(400, "Namaz ayarları geçersiz.");
    }
    const nextPrayerConfig = {
      ...body.prayerConfig,
      updatedAt: typeof body.prayerConfig.updatedAt === "number" ? body.prayerConfig.updatedAt : Date.now(),
    };
    await env.DB.prepare("UPDATE desktop_state SET prayer_config=? WHERE id=1").bind(JSON.stringify(nextPrayerConfig)).run();
    return reply({ ok: true });
  }

  if (path === "/api/match-preferences" && request.method === "POST") {
    const body = await jsonBody(request);
    if (!object(body)) throw new ApiError(400, "Maç bildirim tercihleri geçersiz.");
    const allowedKeys = ["mobileMatches", "matchTeamGalatasaray", "matchTeamTurkey", "matchTeamF1", "matchLeadMinutes"];
    if (!Object.keys(body).every((k) => allowedKeys.includes(k))) throw new ApiError(400, "Geçersiz tercih alanı.");
    if (body.mobileMatches !== undefined && typeof body.mobileMatches !== "boolean") throw new ApiError(400, "Geçersiz değer.");
    if (body.matchTeamGalatasaray !== undefined && typeof body.matchTeamGalatasaray !== "boolean") throw new ApiError(400, "Geçersiz değer.");
    if (body.matchTeamTurkey !== undefined && typeof body.matchTeamTurkey !== "boolean") throw new ApiError(400, "Geçersiz değer.");
    if (body.matchTeamF1 !== undefined && typeof body.matchTeamF1 !== "boolean") throw new ApiError(400, "Geçersiz değer.");
    if (body.matchLeadMinutes !== undefined && (typeof body.matchLeadMinutes !== "number" || ![15, 30, 60].includes(body.matchLeadMinutes))) {
      throw new ApiError(400, "Geçersiz erken uyarı süresi.");
    }
    const cur = await env.DB.prepare("SELECT notification_preferences FROM desktop_state WHERE id=1")
      .first<{ notification_preferences?: string | null }>()
      .catch(() => null);
    const existing = parseJsonSafe<Record<string, unknown>>(cur?.notification_preferences) ?? {};
    const merged = { ...existing, ...body };
    await env.DB.prepare("UPDATE desktop_state SET notification_preferences=? WHERE id=1").bind(JSON.stringify(merged)).run();
    return reply({ ok: true, notificationPreferences: merged });
  }

  return null;
}
