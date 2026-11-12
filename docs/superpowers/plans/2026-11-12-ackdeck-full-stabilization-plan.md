# ACKDeck Kapsamlı Stabilizasyon, Güvenlik ve Modülerlik Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Git & Deploy Kuralı (`AGENTS.md §2`):** Kullanıcı açıkça *"rutinleri yap"* veya *"mobili canlıya al"* demediği sürece **commit, push, version bump veya wrangler/release deploy adımı çalıştırılmaz**. Her görev sonunda ilgili testler ve tip kontrolleri çalıştırılarak değişiklikler doğrulanır.

**Goal:** `v2.0.6` (`9eec7d4`) tabanı üzerinde tespit edilen tüm kritik bugları (Mobil ↔ Masaüstü AI Relay, Bulut Mobil AI, Mobil 7–12 Haneli PIN kilidi, Yedek `StartPage` & eksik anahtarlar, >160 karakter hatırlatıcı kesilmesi, Komut Paletinin tamamen temizlenmesi), güvenlik sertleştirmelerini (`/api/image-proxy`, `/api/ai/key` owner kilidi, rate limit, CSP, pencere kontrolü), senkronizasyon/dayanıklılık iyileştirmelerini ve açık tema + modülerlik düzenlemelerini tam test kapsamıyla çözmek.

**Architecture:** ACKDeck üç katmanlı yerel-öncelikli bir sistemdir: Masaüstü (`src/`, `src-tauri/src/`), Mobil PWA (`mobile/src/`), ve Cloudflare Worker + D1/KV (`cloud/src/`), ortak saf domain modülleri (`shared/`) üzerinden beslenir. Düzeltmeler sözleşmeleri (Worker API ↔ Desktop/Mobile), doğrulama şemalarını ve UI bileşenlerini kırmadan geriye dönük uyumlu (additive) biçimde hizalar; büyük dosyalar mantıksal alt bileşenlere ve CSS modüllerine bölünür.

**Tech Stack:** TypeScript ~6.0, React 19, Vite 8, Tauri 2 (Rust), Cloudflare Workers + D1 + KV (Miniflare 4), Node built-in `node --test`.

**v2.0.6 Taban Notu:** `eski_sohbet_devam` (`9eec7d4`) birleşimi ile `ActivityOverview` / `activity-goals` zaten `v2.0.5` (`64d3872`) sürümünde kaldırıldığı için bu planda ilgili eski bulgular kapsam dışıdır. Kullanıcı kararları:
- **PIN Kilidi:** Kayıtlı PIN uzunluğu cihazda saklanır, tam uzunluğa ulaşınca otomatik doğrulanır ve açık `✓` (Onayla) tuşu sunulur (legacy uzunluğu bilinmeyen PIN'ler de ilk açılışta desteklenir).
- **Komut Paleti:** Hem yarım kalan global kısayol/ayrı pencere backend'i hem de uygulama içi `Ctrl+K` paleti tamamen temizlenir; proje klasörü/VS Code açma (`openRegisteredProject`) işlevi `src/hubLaunch.ts` içinde korunur, eski yedeklerdeki `paletteShortcut` alanı geriye dönük uyumluluk adına sessizce tolere edilir.
- **Tepsi & Worker:** Masaüstü sistem tepsisine gizlendiğinde (`!visible`) çevrimiçi heartbeat devam eder (yalnız kapanış/geri yüklemede offline olur); `/api/image-proxy` sıkı MIME/redirect/`nosniff`/boyut/rate-limit ile korunur, `/api/ai/key` sadece `owner(actor)` yetkisine kısıtlanır.

---

## Faz 1: Kritik Buglar ve Kırık Özellikler

### Task 1: Mobil ↔ Masaüstü AI Relay Modu ("💻 PC Canlı") Uçtan Uca Onarımı

**Files:**
- Modify: `cloud/src/index.ts`
- Modify: `cloud/src/mobileAi.ts`
- Modify: `src/App.tsx`
- Modify: `mobile/src/MobileAiChat.tsx`
- Test: `cloud/tests/worker.test.mjs`
- Test: `mobile/tests/mobile.test.mjs`

**Kontrat & Kök Neden:**
- `POST /api/ai/chat` Worker'da `expires_at = now + 90_000` iken masaüstü `ModelChoice::Powerful` bütçesi 120s (`gemini.rs`). Süre `now + 150_000` olmalı.
- `GET /api/ai/pending` `{ id, prompt, history (JSON string), model }` döndürüyor; `src/App.tsx:274` içindeki `processMobileRelayQueries` ise `q.messages` bekliyor ve hata durumunda Worker'ın reddettiği (`400`) `{ id, error }` payload'ını gönderiyor. Ayrıca `processingAiIds.current` hiçbir zaman temizlenmiyor.
- `GET /api/ai/query/:id` `{ state: "pending" | "done" | "failed", reply }` döndürüyor; `mobile/src/MobileAiChat.tsx:232-243` `poll.status` / `poll.error` kontrol edip yalnızca `36000` ms bekliyor (`poll.status` hep `undefined`).
- `cloud/src/index.ts:509`: `recordCloudAiUsage(env, direct.modelUsed || modelChoice)` `modelId` string'i (`"gemini-3.5-flash-lite"` vb.) geçirdiği için hem `tsc` hatası veriyor hem de hızlı model çağrılarını bile `powerful` sayacına yazıyor (`index.ts:678`).

- [ ] **Step 1: AI Relay kontratı ve cloud kullanım sayacı için başarısız testi yaz (`cloud/tests/worker.test.mjs`)**

```js
test('mobile AI relay round-trips pending query, error failure reply, and accurate cloud tier counter', async () => {
  // 1. Mobile sends chat when PC is online (recent heartbeat) and no encrypted cloud key exists:
  //    expect mode === 'relay' and queryId defined, expires_at ~ now + 150_000.
  // 2. Desktop fetches GET /api/ai/pending -> receives { id, prompt, history, model }.
  // 3. Desktop replies with failed: true -> POST /api/ai/reply { id, reply: 'Masaüstü hata', failed: true }.
  // 4. Mobile polls GET /api/ai/query/:id -> expects { state: 'failed', reply: 'Masaüstü hata' }.
  // 5. Desktop handles another query and replies { id, reply: 'Yanıt hazır' } -> poll receives { state: 'done', reply: 'Yanıt hazır' }.
});
```

- [ ] **Step 2: Mevcut Worker & Mobile testlerini çalıştırıp yeni testin fail olduğunu gör**

Run: `Push-Location cloud; npm test; Pop-Location`
Expected: Yeni test henüz tam kontratı / 150s TTL / hata akışını doğrulamadan ya da tip hatası yüzünden fail verir (`npm run check` şu an `src/index.ts(509,37)` hatası verir).

- [ ] **Step 3: `cloud/src/mobileAi.ts` dönüş tipini ve `cloud/src/index.ts` relay TTL + sayaç tipini güncelle**

- `cloud/src/mobileAi.ts` içinde `runCloudMobileAiChat` dönüş tipi `{ reply: string; modelUsed: string; modelTier: "fast" | "powerful" } | null` olsun (`modelTier: resolvedModel === POWERFUL_MODEL ? "powerful" : "fast"`).
- `cloud/src/index.ts` satır 509: `await recordCloudAiUsage(env, direct.modelTier);`
- `cloud/src/index.ts` satır 526: `expires_at` değeri `now + 150_000` yap; `POST /api/ai/reply` içinde `UPDATE ai_queries SET state=?, reply=? WHERE id=? AND state='pending'` şeklinde tekilleştir.

- [ ] **Step 4: Masaüstü `src/App.tsx` içindeki `processMobileRelayQueries` fonksiyonunu hizala**

- `GET /api/ai/pending` yanıt tipi `{ id: string; prompt: string; history?: string; messages?: AiMessage[]; model: string }` kabul edilsin.
- Yardımcı saf parse: `parseRelayMessages(q): AiMessage[]` -> `q.messages` dizisi varsa doğrula; yoksa `JSON.parse(q.history || "[]")` içinden geçerli `{ role: "user" | "model", text: string }` öğelerini al ve sonuna `{ role: "user", text: q.prompt }` ekle.
- `modelChoice`: `q.model === "powerful" ? "powerful" : "fast"`.
- Anahtar yokken veya hata oluştuğunda `phoneRequest("ai_reply", { id: q.id, reply: redactSecrets(msg).slice(0, 1000), failed: true })` gönder.
- `try { ... } finally { processingAiIds.current.delete(q.id); }` (aynı `finally` temizliğini hata durumunda `processMobileAiPrompt` için de ekle, başarılı olduğunda `handled` işaretlendiği için güvenli).

- [ ] **Step 5: Mobil `mobile/src/MobileAiChat.tsx` polling mantığını düzelt**

- Polling tipi: `{ state: "pending" | "done" | "failed"; reply?: string | null }`.
- Deadline: `Date.now() + (model === "powerful" ? 140000 : 55000)`.
- `if (poll.state === "done" && typeof poll.reply === "string" && poll.reply.trim()) { persistReply(poll.reply); return; }`
- `if (poll.state === "failed") { throw new Error(poll.reply || "Masaüstü ACK AI yanıt üretemedi."); }`

- [ ] **Step 6: Worker ve Mobil relay parsing davranışı için doğrulama testlerini çalıştır**

Run: `Push-Location cloud; npm test; Pop-Location; Push-Location mobile; npm run build && npm test; Pop-Location`
Expected: PASS (20+ tests pass, yeni relay testi yeşil).

---

### Task 2: 7/24 Bulut Mobil AI Hata/Zaman Dilimi Düzeltmeleri & `shared/` TS Sınırı

**Files:**
- Modify: `cloud/src/mobileAi.ts`
- Modify: `cloud/tsconfig.json`
- Modify: `shared/prayerTimes.ts` (yalnızca saf/tarayıcı kontrolü tip uyumu)
- Modify: `shared/studyAttendance.ts` (yalnızca `typeof Storage` yerine `Pick<Storage, "getItem" | "setItem">`)
- Modify: `shared/weather.ts` (yalnızca `globalThis` üzerinden `localStorage` güvenli erişim)
- Test: `cloud/tests/worker.test.mjs`

**Not:** `cloud/npm run check` (`tsc --noEmit`) şu an `shared/*.ts` içindeki `window` / `localStorage` / `Storage` referansları yüzünden kırılıyor (`cloud/tsconfig.json` `ES2022` `lib` kullandığından DOM tipleri yok). `shared/` içindeki saf yardımcı tipleri DOM'a bağımsız kılmak (`typeof window !== "undefined"` + yapısal storage tipi; `@tauri-apps/api/core` ise Task 8'de `shared/dormMenu.ts` içinden tamamen çıkarılacak) hem `cloud` hem `mobile` hem `root` derlemelerini temizler.

- [ ] **Step 1: `cloud/src/mobileAi.ts` için başarısız test yaz (`cloud/tests/worker.test.mjs`)**

```js
test('cloud mobile AI uses Europe/Istanbul date, keeps JSON context valid under 28KB, and sets thinkingConfig/timeouts correctly', async () => {
  // Verify:
  // 1. Mock clock at 2026-11-11T22:30:00Z (01:30 TR next day) -> contextObj.today === '2026-11-12'.
  // 2. Inject 15 long notes (>2000 chars total > 28KB) -> context JSON passes JSON.parse cleanly and length <= 28000.
  // 3. runCloudMobileAiChat('powerful') sends generationConfig.maxOutputTokens === 8192 and thinkingConfig.thinkingLevel === 'medium';
  //    on HTTP 500 fallback to FAST_MODEL (gemini-3.5-flash-lite), thinkingConfig is omitted.
});
```

- [ ] **Step 2: Testi çalıştırıp fail olduğunu doğrula**

Run: `Push-Location cloud; npm test; Pop-Location`
Expected: FAIL (`today` UTC yüzünden `2026-11-11`, JSON truncate `JSON.parse` fırlatır, `maxOutputTokens` 4096 ve `thinkingConfig` yok).

- [ ] **Step 3: `cloud/src/mobileAi.ts` içinde context builder ve `callGeminiDirect` fonksiyonunu güncelle**

- Export `collectCloudAiContext(env: Env, nowMs = Date.now())` (test edilebilir olsun).
- `today`: `zonedParts(nowMs, "Europe/Istanbul").date` (`../../shared/recurrence`).
- `serializeBoundedContext(payload, maxChars = 28000)`: `JSON.stringify` 28000 karakteri aşarsa önce `notes` içeriklerini kısalt / sayısını azalt, ardından `koleksiyonMedia`, ardından completed `tasks`, ardından `thisWeekStudyAttendance` budanarak daima **geçerli JSON** üret.
- `callGeminiDirect`:
  - `maxOutputTokens: 8192`
  - `if (modelId.startsWith("gemini-3.") && modelId.includes("flash") && !modelId.includes("lite"))` -> `generationConfig.thinkingConfig = { thinkingLevel: "medium" }` (fallback `FAST_MODEL` için eklenmez — `AGENTS.md §6` uyumu).
  - Timeout: `modelId === POWERFUL_MODEL ? 120_000 : 45_000`.

- [ ] **Step 4: `shared/` içindeki DOM tip bağımlılıklarını Workers (`ES2022`) ile uyumlu hale getir (`cloud/tsconfig.json` kapsamını koruyarak)**

- `shared/prayerTimes.ts`, `shared/studyAttendance.ts`, `shared/weather.ts` içinde `Storage` yerine `{ getItem(k: string): string | null; setItem(k: string, v: string): void }` kullan; `window` / `localStorage` yerine `(globalThis as { localStorage?: SimpleStorage }).localStorage` ve unknown `data` kontrolleri ekle. (Task 8'de `dormMenu.ts` temizlenince `cloud/npm run check` sıfır hataya inecek; bu adımda geri kalan dosyaların hatasız olduğunu kontrol et.)

- [ ] **Step 5: Cloud testlerini ve typecheck durumunu doğrula**

Run: `Push-Location cloud; npm test; Pop-Location`
Expected: Yeni `mobileAi` testi dahil tüm Worker testleri PASS.

---

### Task 3: Mobil 4–12 Haneli PIN Kilidi Düzeltmesi (`MobileLockScreen` & `mobileSecurity`)

**Files:**
- Modify: `mobile/src/mobileSecurity.ts`
- Modify: `mobile/src/MobileLockScreen.tsx`
- Modify: `mobile/src/styles/lock-pomodoro.css`
- Test: `mobile/tests/mobile.test.mjs`

**Tasarım (`Kullanıcı Kararı A2`):**
- `MobileSecurityConfig` içine opsiyonel `pinLength?: number` (4..12) eklenir. `setSecurityPasscode(passcode)` yeni PIN'in gerçek uzunluğunu (`passcode.length`) `pinLength` olarak kaydeder.
- `MobileLockScreen` tuş giriş sınırı `8` yerine `12` olur (`pin.length >= 12`).
- Doğrulama kuralları:
  1. **Kayıtlı `pinLength` biliniyorsa (`4..12`):** Kullanıcı tam `pinLength` basamağa ulaşınca otomatik `verifySecurityPasscode(nextPin)` çalışır (ör. 8 haneli PIN'de 6. hanede erken hata atılmaz). Yanlışsa hata + sallanma + deneme sayacı çalışır. Kullanıcı isterse nokta sayısı `pinLength` kadar gösterilir (4–12 arası responsive nokta).
  2. **Legacy kayıt (`pinLength` tanımsızsa, ör. güncelleme öncesi 7–12 haneli PIN konmuşsa):** `nextPin.length >= 4` iken sessizce eşleşirse hemen açılır ve `pinLength` otomatik kaydedilir (legacy backfill); eşleşmezse 12 haneye kadar kullanıcı yazmaya devam edebilir ve **`✓` (Onayla)** butonuna basarak doğrular!
  3. Keypad'de kullanıcı 6+ haneli legacy durumda da normal durumda da açık bir `✓` ("Onayla") düğmesi görebilir (`pin.length >= 4` iken aktif). `biometricsEnabled` varlığında alt satır düzeni bozulmadan `✓` eylemi erişilebilir tutulur (ör. nokta çubuğunun/keypad'in hemen üstü veya tuş grid'inde dengeli `Onayla` aksiyonu; face id/tam metin/tek seferlik prompt testleri korunur!).

- [ ] **Step 1: 8 ve 12 haneli PIN akışları + legacy bilinmeyen uzunluk doğrulaması için test yaz (`mobile/tests/mobile.test.mjs`)**

```js
test('mobile lock screen supports 4 to 12 digit PINs, explicit confirm action, and persists pinLength safely', async () => {
  // 1. Load mobileSecurity -> call setSecurityPasscode('12345678') -> loadSecurityConfig().pinLength === 8
  // 2. Verify MobileLockScreen allows up to 12 digits (no length >= 8 cutoff, no length >= 6 auto-fail)
  //    and renders explicit ✓ / Onayla button for manual/legacy submission.
  // 3. verifySecurityPasscode('12345678') returns true and repairs missing pinLength on legacy configs.
});
```

- [ ] **Step 2: Mevcut `mobile` testini çalıştırıp fail olduğunu doğrula**

Run: `Push-Location mobile; npm test; Pop-Location`
Expected: FAIL (`pinLength` henüz `mobileSecurity.ts` içinde yok, `MobileLockScreen` 8/6 sınırına sahip).

- [ ] **Step 3: `mobile/src/mobileSecurity.ts` güncelle**

- `MobileSecurityConfig` arayüzüne `pinLength?: number` ekle (`loadSecurityConfig` içinde geçerli `4..=12` tamsayıysa oku).
- `setSecurityPasscode(passcode: string)`: `pinLength: passcode.length` kaydet (`4 <= length <= 12`).
- `verifySecurityPasscode(passcode: string)`: doğrulama başarılıysa ve `!cfg.pinLength` ise `{ ...cfg, pinLength: passcode.length }` ile kaydet (böylece tek seferlik legacy açılışta uzunluk onarılır!).
- `disableSecurity()`: `pinLength` alanını temizle.

- [ ] **Step 4: `mobile/src/MobileLockScreen.tsx` ve `mobile/src/styles/lock-pomodoro.css` güncelle**

- `maxDigits = 12`, `expectedLength = config.pinLength && config.pinLength >= 4 && config.pinLength <= 12 ? config.pinLength : null`.
- `verifyAttempt(candidate: string, triggerErrorOnMismatch: boolean)`: eşleşirse kilit aç; eşleşmezse ve `triggerErrorOnMismatch` ise `recordFailedAttempt()` + shake + error temizle.
- `handleNumberPress(digit)`: `if (lockoutSec > 0 || busy || pin.length >= 12) return;`.
  - `expectedLength` varsa: sadece `nextPin.length === expectedLength` olduğunda `verifyAttempt(nextPin, true)` çalıştır!
  - `expectedLength` yoksa (legacy): `nextPin.length >= 4` iken sessiz dene (`verifyAttempt(nextPin, false)`); 12 hanede hâlâ yanlışsa `triggerErrorOnMismatch = true`.
- `handleConfirm()`: `if (pin.length >= 4) void verifyAttempt(pin, true)`.
- Noktalar: `dotCount = expectedLength ?? Math.max(4, Math.min(12, pin.length))`, responsive sarma (`flex-wrap: wrap` veya 7–12 hane için kompakt CSS `.lock-dots-display.is-compact`).
- `Onayla (✓)` butonu: PIN >= 4 olduğunda net `✓ Onayla` aksiyonu (hem Face ID hem Sil hem Onayla tek tuş mesafesinde erişilebilir; `mobile.test.mjs`'deki `performBioAuth`, `autoPromptedRef.current = true` assertion'ları aynen korunur).

- [ ] **Step 5: Build & mobil testleri çalıştır**

Run: `Push-Location mobile; npm run build && npm test; Pop-Location`
Expected: PASS (tüm 23 mobil test yeşil).

---

### Task 4: Yedek `StartPage` Doğrulaması, Eksik `BACKUP_KEYS` & Ayar Arayüzü

**Files:**
- Modify: `src/preferences.ts`
- Modify: `src/backupStore.ts`
- Modify: `src/components/Settings.tsx`
- Test: `tests/core.test.mjs`

**Kontrat & Geriye Uyumluluk (`AGENTS.md §7`):**
- `src/preferences.ts` içinden `START_PAGES = ["home", "tasks", "calendar", "notes", "projects", "ai", "subscriptions", "inbox"] as const` ve `PC_REFRESH_INTERVALS = [2500, 5000, 10000] as const` export edilir; `loadPreferences` legacy `"tools" -> "projects"`, `"archive" -> "home"` normalize edebilir veya `validData` bunları kabul eder.
- `src/backupStore.ts`:
  - `HUB_BACKUP_KEYS` içine eksik yerel ayar/geçmiş anahtarları eklenir (**optional / additive** olduğu için eski v1/v2 yedek dosyaları bunlarsız da `parseBackup`'tan geçer):
    - `prayerConfig: "ack-deck.prayer-config.v1"`
    - `notificationPreferences: "ack-deck.notification-preferences.v1"`
    - `displayScale: "ack-deck.display-scale.v1"`
    - `weatherCity: "ack-deck.weather-city.v1"`
    - `pomodoroHistory: "ack-deck.pomodoro.history.v1"`
  - `validData`: `data.preferences.startPage` için `START_PAGES` + eski yedek uyumu `["tools", "archive"]` kabul edilir; yeni eklenen `HUB_BACKUP_KEYS` alanları varsa kendi şekil doğrulamalarından geçirilir (ve `parseJournal` `allowed` listesi otomatik güncellenir!).
  - Restore sonrasında eski `"tools"` / `"archive"` `startPage` okunursa `loadPreferences` tarafından güvenle `"projects"` / `"home"` olarak açılır.
- `src/components/Settings.tsx`: Genel sekmesine (`Görünüm` kartının içine veya ayrı düzenli satırlara) **"Başlangıç Sayfası"** (`<select>`) ve **"Sistem Durumu Yenileme Hızı"** (`<select>`) kontrolleri eklenir -> `changePreference({ ...preferences, startPage, pcRefreshMs })`.

- [ ] **Step 1: `StartPage` ve eksik `HUB_BACKUP_KEYS` round-trip testi yaz (`tests/core.test.mjs`)**

```js
test('backup validates all modern StartPage values and round-trips local prayer, notification, displayScale, weatherCity, and pomodoroHistory settings', () => {
  const env = setupModules([
    ['ack-deck.preferences.v1', JSON.stringify({ startPage: 'tasks', pcRefreshMs: 5000, theme: 'light' })],
    ['ack-deck.prayer-config.v1', JSON.stringify({ enabled: true, city: 'Karabük', latitude: 41.2, longitude: 32.6, notifyMinutesBefore: 10 })],
    ['ack-deck.notification-preferences.v1', JSON.stringify({ desktopMaster: false, mobileMaster: true })],
    ['ack-deck.display-scale.v1', JSON.stringify('compact')], // verify exact format stored by displayScaleStore!
    ['ack-deck.weather-city.v1', JSON.stringify('İstanbul')],
    ['ack-deck.pomodoro.history.v1', JSON.stringify({ '2026-11-12': 2 })],
  ]);
  const backup = env.load('backupStore');
  const created = backup.createBackup({ closeToTray: false, startInTray: false, autoStart: false }, '2.0.6');
  const parsed = backup.parseBackup(JSON.stringify(created));
  assert.equal(parsed.data.preferences.startPage, 'tasks');
  assert.equal(parsed.data.weatherCity, 'İstanbul');
  assert.deepEqual(parsed.data.pomodoroHistory, { '2026-11-12': 2 });
});
```
*(Uygularken ilk olarak `src/displayScaleStore.ts` ve `src/components/PomodoroTimer.tsx` içindeki exact JSON formatını kontrol edip test + validator şekillerini 100% eşleştir!)*

- [ ] **Step 2: Root testi çalıştırıp fail olduğunu gör**

Run: `node --test tests/core.test.mjs`
Expected: FAIL (`tasks` startPage `validData` tarafından reddedilir).

- [ ] **Step 3: `src/preferences.ts` + `src/backupStore.ts` + `src/components/Settings.tsx` güncelle**

- `src/preferences.ts`: `START_PAGES`, `VALID_START_PAGES`, normalize helper.
- `src/backupStore.ts`: `START_PAGES` + legacy `"tools" | "archive"` desteği ve yeni 5 `HUB_BACKUP_KEYS` alanının güvenli doğrulaması (hatalı tiplerde bile mevcut güvenliği koruyarak; sadece bozuk veriyi reddet).
- `src/components/Settings.tsx`: Başlangıç sayfası + PC yenileme aralığı seçicileri (sade, tek satır CSS uyumlu etiket/select yapısı).

- [ ] **Step 4: Test ve root TS doğrulaması yap**

Run: `node --test tests/core.test.mjs && npx tsc --noEmit`
Expected: PASS.

---

### Task 5: >160 Karakter Görev/Sınav Hatırlatıcı Kırpma & Rust Savunması

**Files:**
- Modify: `src/useReminders.ts`
- Modify: `src-tauri/src/reminders.rs`
- Test: `tests/core.test.mjs`

**Kontrat:**
- Uzun görev/sınav metni `useReminders.ts` içinde tek başına tüm hatırlatıcı listesini çökertmemeli.
- `clampReminderText(raw: string, maxChars = 160): string` trim sonrası `Array.from(trimmed).length > maxChars` ise `Array.from(trimmed).slice(0, maxChars - 1).join("").trimEnd() + "…"` döndürsün; tüm 4 kaynakta (`taskItems`, `studyItems`, `prayerItems`, `subItems`) kullanılsın.
- `src-tauri/src/reminders.rs`: `sanitize_text(&item.text)` (160 karakteri aşan Unicode scalar dizisini güvenli şekilde `159 + '…'` olarak kısalt) uygula ve `validate` yalnızca gerçekten boş id / >512 id / tamamen boş text / taşan timestamp / yinelenen id durumlarını reddetsin — böylece mobilden gelen 2000 karakterlik bir görev asla diğer ders/namaz/abonelik bildirimlerini susturamaz!

- [ ] **Step 1: `pendingReminders` >160 karakter ve `reminders.rs` Rust testi yaz**

- `tests/core.test.mjs`: 250 karakterlik (ve emoji/Unicode içeren) görevin `pendingReminders` çıktısının `Array.from(r.text).length <= 160` ve sonunun `"…"` olduğunu doğrulayan test.
- `src-tauri/src/reminders.rs` (`#[cfg(test)] mod tests`): 200+ karakterli öğe ile `sanitize_and_validate` / `normalize` fonksiyonunun hata vermeden 160 char'a kısaltıp valid diğer öğeleri koruduğunu test et.

- [ ] **Step 2: Testleri çalıştırıp fail olduğunu doğrula**

Run: `node --test tests/core.test.mjs`
Expected: FAIL (şu an `pendingReminders` 250 karakteri olduğu gibi döndürür).

- [ ] **Step 3: `src/useReminders.ts` ve `src-tauri/src/reminders.rs` güncelle**

- `src/useReminders.ts`: `export function clampReminderText(value: string, limit = 160): string` tanımla ve `pendingReminders` + `subItems` içinde uygula (empty guard dahil).
- `src-tauri/src/reminders.rs`: `fn normalize_reminders(mut items: Vec<Reminder>) -> Vec<Reminder>` ile her öğenin `text`'ini 160 karakter sınırı içinde (`chars().take(159)` + `'…'`) kırp ve `sync_task_reminders` içinde `validate(&items)` öncesinde uygula.

- [ ] **Step 4: Node & Cargo testlerini çalıştır**

Run: `node --test tests/core.test.mjs; $env:CARGO_TARGET_DIR='C:\Users\Alican\.gemini\antigravity\worktrees\ack-deck\eski_sohbet_devam\src-tauri\target'; cargo test --manifest-path src-tauri/Cargo.toml reminders`
Expected: PASS.

---

### Task 6: Komut Paletinin Tamamen Kaldırılması (`Ön Yüz + Arka Yüz + Global Kısayol`, Geriye Uyumlu Yedekle)

**Files:**
- Modify: `src/hubLaunch.ts` (`openRegisteredProject` buraya taşınır / ihraç edilir)
- Modify: `src/ackActions.ts` (`openRegisteredProject` import'unu `hubLaunch`'tan alır)
- Delete: `src/commandPalette.ts`, `src/paletteActions.ts`, `src/paletteRows.ts`, `src/usePaletteBridge.ts`, `src/components/LauncherPalette.tsx`, `src/components/PaletteWindow.tsx`
- Modify: `src/backupStore.ts` (`paletteShortcut` artık yeni yedeklerde yazılmaz; eski v1/v2 yedeklerde/journal'da varsa doğrulama tarafından sessizce tolere edilir/atılır)
- Modify: `src/App.css`, `src/desktop-layout.css` (ölü `.command-dialog` / `.standalone-palette` / `.palette-*` CSS sınıfları ve yorumları kaldırılır)
- Delete: `src-tauri/src/palette.rs`, `src-tauri/capabilities/palette.json`
- Modify: `src-tauri/src/lib.rs`, `src-tauri/src/desktop.rs`, `src-tauri/build.rs`, `src-tauri/permissions/desktop.toml`, `src-tauri/Cargo.toml`
- Test: `tests/core.test.mjs`

- [ ] **Step 1: Eski yedeklerin `paletteShortcut` alanı içerse bile geri yüklenebildiğini ve proje başlatmanın çalıştığını test et (`tests/core.test.mjs`)**

```js
test('legacy backups with paletteShortcut parse without error and openRegisteredProject works via hubLaunch without commandPalette', async () => {
  // 1. Create backup JSON containing data.paletteShortcut = 'Ctrl+Space' -> parseBackup succeeds without throwing.
  // 2. createBackup / createFullBackup omit paletteShortcut and never invoke get_palette_shortcut.
  // 3. hubLaunch.openRegisteredProject('p1', 'folder', mockInvoke) triggers open_project_folder cleanly.
});
```

- [ ] **Step 2: Ön yüz ve arka yüz palet dosyalarını ve `tauri-plugin-global-shortcut` bağımlılığını temizle**

- `openRegisteredProject` fonksiyonunu `src/commandPalette.ts` içinden `src/hubLaunch.ts` içine taşı; `src/ackActions.ts` import'unu güncellle (`import { openRegisteredProject } from "./hubLaunch";`).
- Sil: `src/commandPalette.ts`, `src/paletteActions.ts`, `src/paletteRows.ts`, `src/usePaletteBridge.ts`, `src/components/LauncherPalette.tsx`, `src/components/PaletteWindow.tsx`.
- `src/backupStore.ts`: `createFullBackup` içinden `get_palette_shortcut` çağrısını çıkar; `restoreBackup` ve `rollback` içinden `get_palette_shortcut_state` / `set_palette_shortcut` / `restore_unregistered_palette_shortcut` çağrılarını çıkar; `fields(data, ...)` ve `parseJournal` içinde eski `paletteShortcut` / `paletteRegistered` alanlarını kabul etmeye devam et ki eski v1/v2 yedekler kırılmasın (`AGENTS.md §7`).
- `src/App.css` ve `src/desktop-layout.css`: yalnızca palete ait ölü sınıfları (`.command-dialog`, `.standalone-palette`, `.palette-*`) temizle.
- Sil: `src-tauri/src/palette.rs`, `src-tauri/capabilities/palette.json`.
- `src-tauri/src/lib.rs`: `mod palette;` ve tüm `palette::*` handler kayıtlarını kaldır.
- `src-tauri/src/desktop.rs`: `crate::palette::setup(app)?;` ve `if window.label() == "palette"` bloğunu kaldır.
- `src-tauri/build.rs` ve `src-tauri/permissions/desktop.toml`: 8 palet komutunu ve `palette-bridge` iznini kaldır.
- `src-tauri/Cargo.toml`: `tauri-plugin-global-shortcut = "2"` satırını kaldır.

- [ ] **Step 3: Palet referansının kalmadığını, TS/Vite derlemesinin ve Cargo testlerinin geçtiğini doğrula**

Run: `npx tsc --noEmit && node --test tests/core.test.mjs; $env:CARGO_TARGET_DIR='C:\Users\Alican\.gemini\antigravity\worktrees\ack-deck\eski_sohbet_devam\src-tauri\target'; cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS (zero TypeScript errors, all Node + Cargo tests pass).

---

## Faz 2: Güvenlik ve Gizlilik Riskleri

### Task 7: Worker Uçlarının Sertleştirilmesi (`/api/image-proxy`, `/api/dorm-menu?force=1`, `/api/weather`, `/api/ai/key`)

**Files:**
- Modify: `cloud/src/index.ts`
- Test: `cloud/tests/worker.test.mjs`

- [ ] **Step 1: Worker güvenlik regresyon testlerini ekle (`cloud/tests/worker.test.mjs`)**

```js
test('security hardening: non-owner cannot mutate AI key, force dorm-menu/weather are rate-limited, and image-proxy enforces MIME/redirect/nosniff caps', async () => {
  // 1. POST /api/ai/key & DELETE /api/ai/key with paired `phone` token -> HTTP 403! Only `ownerSecret` -> 200!
  // 2. GET /api/image-proxy with upstream returning 'text/html' or 'image/svg+xml' -> rejected (415/502).
  // 3. GET /api/image-proxy with upstream returning HTTP 302 to disallowed host -> rejected (403/502, no open redirect follow).
  // 4. GET /api/image-proxy valid JPEG -> 200 with X-Content-Type-Options === 'nosniff'.
  // 5. GET /api/dorm-menu?force=1 repeated > limit triggers HTTP 429.
});
```

- [ ] **Step 2: Mevcut Worker testlerini çalıştırıp yeni testin fail olduğunu gör**

Run: `Push-Location cloud; npm test; Pop-Location`
Expected: FAIL (`/api/ai/key` phone'a 200 dönüyor, `image-proxy` `text/html` geçiriyor ve `nosniff` eklemiyor).

- [ ] **Step 3: `cloud/src/index.ts` güvenlik sertleştirmelerini uygula**

- `POST /api/ai/key` ve `DELETE /api/ai/key`: satır 461 başına `owner(actor);` ekle (`rate(env, ...)` ile birlikte).
- `/api/dorm-menu`: `rate()` uygula (genel istek örn. 30/60sn, `force=1` için sıkı bucket `dorm-menu-force:${ipHash}` 4/300sn — limit aşımında `429`, yanıt başında `Access-Control-Allow-Origin: *` korunur).
- `/api/weather`: IP hash bazlı `rate(env, ...)` (ör. 60/60sn) ekle.
- `/api/image-proxy`:
  - IP hash bazlı `rate(env, ...)` (80/60sn) ekle.
  - Yardımcı `fetchAllowedImage(targetUrl, allowHosts)` içinde `redirect: "manual"` kullan; 3xx Location varsa yalnızca HTTPS ve `isAllowedProxyHost(locUrl.hostname)` ise en fazla 2 adım takip et, aksi halde reddet (403/502).
  - Yanıt `Content-Type` (`split(";")[0].trim().toLowerCase()`) sadece `image/jpeg`, `image/png`, `image/webp`, `image/avif`, `image/gif` (kesinlikle `image/svg+xml` veya `text/html` DEĞİL) kabul et; yoksa 415/502 döndür.
  - Yanıt boyut sınırı (Content-Length > 5 MB reddet; gerekirse `boundedBytes(imgRes, 5 * 1024 * 1024)` veya stream cap).
  - Son yanıtı `secure(new Response(body, { status: 200, headers }), false)` ile sarmala (`X-Content-Type-Options: nosniff`, `Cache-Control: public, max-age=604800`, `Access-Control-Allow-Origin: *`).

- [ ] **Step 4: Worker testlerini çalıştır**

Run: `Push-Location cloud; npm test; Pop-Location`
Expected: PASS.

---

### Task 8: `shared/dormMenu.ts` Tauri/CSP Sızıntısı, Rust `open_auto_backup_dir` & Güvenilir Sync/Yedek

**Files:**
- Modify: `shared/dormMenu.ts`
- Modify: `src/components/DormMenuCard.tsx`
- Modify: `src/useDormMealReminder.ts`
- Modify: `src-tauri/src/backup.rs`
- Modify: `src-tauri/src/portable_backup.rs`
- Modify: `src/useAutoBackup.ts`
- Modify: `src/usePhoneCompanion.ts`
- Modify: `src/phoneSync.ts`
- Modify: `src-tauri/src/phone.rs`
- Modify: `src-tauri/src/footer_info.rs`
- Modify: `src-tauri/src/prayer_geo.rs`
- Modify: `cloud/tests/worker.test.mjs`
- Test: `tests/core.test.mjs`

- [ ] **Step 1: `dormMenu`, `phoneSync` tek-snapshot ve eksik dosya toleranslı auto-backup testlerini yaz**

- `tests/core.test.mjs`: `dormMenu` içinde `@tauri-apps/api/core` ve doğrudan `altinkalemkarabuk.com` browser fetch URL'sinin olmadığını doğrula; `registerNativeDormFetcher` enjeksiyonuyla masaüstünde native çalıştığını doğrula.
- `cloud/tests/worker.test.mjs`: `worker.test.mjs` migration kurulumuna `0010_notification_preferences.sql` ekle.
- `src-tauri/src/portable_backup.rs`: eksik disk dosyası varken `write_zip_tolerant` ile oluşturulan `.zip` arşivinin başarılı olduğunu ve `open_archive` ile doğrulandığını gösteren Rust `#[test]` ekle.
- `src-tauri/src/phone.rs`: `valid_url` özel `<custom>.workers.dev` URL'lerini kabul eder (`http://`, userinfo, query, non-workers.dev reddedilir).
- `src-tauri/src/footer_info.rs`: TCMB XML parse / partial rates kombinasyonu testi (`build_partial_rates`).

- [ ] **Step 2: Mevcut check/testleri çalıştırıp `cloud npm run check` + yeni test fail'lerini gör**

Run: `node --test tests/core.test.mjs; Push-Location cloud; npm run check; Pop-Location`
Expected: `cloud npm run check` `@tauri-apps/api/core` veya remaining shared errors yüzünden / yeni testlerden fail olur.

- [ ] **Step 3: `shared/dormMenu.ts` Tauri & CSP sızıntısını temizle + masaüstü bağlayıcılarını ekle**

- `shared/dormMenu.ts`: `@tauri-apps/api/core` import'unu VE `https://altinkalemkarabuk.com/...` URL'sini kaldır. `export function registerNativeDormFetcher(fetcher: (() => Promise<string | null>) | null)` ekle; `fetchDormMenu(force)` tanımlıysa önce `nativeDormFetcher()` dener, sonra Worker uçlarını dener (`/api/dorm-menu` ve `https://ack-deck-phone.ack-deck-cloud.workers.dev/api/dorm-menu`).
- `src/components/DormMenuCard.tsx` ve `src/useDormMealReminder.ts`: başlangıçta `isTauri()` ise `registerNativeDormFetcher(() => invoke<string>("fetch_dorm_menu"))` kaydet (tek ortak masaüstü helper'ında toplanabilir: `src/dormMenuDesktop.ts`).

- [ ] **Step 4: Rust güvenli pencere, esnek auto-backup, custom workers.dev, `footer_rates` & UA sürümü**

- `src-tauri/src/backup.rs`: `open_auto_backup_dir(app: tauri::AppHandle, window: tauri::WebviewWindow)` içine `if window.label() != "main" { return Err("Bu işlem ana pencereden yapılmalıdır.".into()); }` ekle.
- `src-tauri/src/portable_backup.rs`:
  - `Manifest` struct'ına `#[serde(default, skip_serializing_if = "Vec::is_empty")] skipped_sources: Vec<String>` ekle; `validate_archive` içinde `sources` + `skipped_sources` ayrık ve birleşimi `refs.keys()` ile eşit olmalı.
  - `write_zip_with_mode(..., tolerate_missing: bool)` yardımcı fonksiyonunu çıkar: `tolerate_missing = true` (`save_auto_backup`) iken kayıp dosya / taşınmış dosya / önbellekte olmayan mobil ek veya `allowed_file` dışındaki dosya yedeği çökertmek yerine `manifest.skipped_sources`'a yazılır (gizli anahtar taraması yine de engellenmeye devam eder!). `save_portable_backup` ise `tolerate_missing = false` ile katı kalır.
- `src/useAutoBackup.ts`:
  - Dinamik sürüm alımı (`getVersion()` from `@tauri-apps/api/app` catch `"2.0.6"` ya da `desktop.version`).
  - Hata durumunda sadece `console.warn` yerine `ack-auto-backup-failed` olayı da yayınla ve yedek başarısını kaydet.
- `src/usePhoneCompanion.ts`:
  - **Tepside çevrimiçi (A4):** `sendHeartbeat(forceOffline = false)` içinde `!visible` kontrolünü kaldır (`if (forceOffline || paused)` sadece offline atsın); `configure()` içinde `heartbeatTimer = setInterval(...)` `visible` koşuluna bağlı olmadan her 20 saniyede çalışsın. (Yalnız kapanırken `send_offline_beacon` ve `paused` restore sırasında offline gider.)
- `src/phoneSync.ts`:
  - `while(more&&pages++<10)` bloğunun dışına çıkamasa bile her gelen `response.records` sayfası (en fazla 40 kayıt) başında `const localRecords = snapshot();` 1 kez çağır ve `apply(record)` sonrası yalnızca değişen `reference` için `localRecords` haritasını güncelle (döngü içi N kez tüm 8 store'u parse etmeyi sonlandır).
- `src-tauri/src/phone.rs`:
  - `valid_url`: `host.ends_with(".workers.dev") && host.len() > ".workers.dev".len() && !host.starts_with('.')` (`ack-deck-phone.ack-deck-cloud.workers.dev` dahil custom workers.dev kabul). Unit testi güncelle.
  - `send_offline_beacon`: çıkışı 1.5sn kilitlememek için `timeout(Duration::from_millis(450))` ve thread üzerinde en fazla kısa bekleme (`join` / `block_on` 450ms kapakla).
- `src-tauri/src/footer_info.rs` & `src-tauri/src/prayer_geo.rs`:
  - `footer_rates`: TCMB XML başarısız olsa bile `gold`, `btc`, `eth`, `xu100` varsa `Rates { date: today_or_empty, rates }` olarak döndür; yalnızca HİÇBİR kaynak dönmezse `Err("Kurlar alınamadı.")` ver.
  - User-Agent: `concat!("ACKDeck/", env!("CARGO_PKG_VERSION"), " (Windows)")` kullan.

- [ ] **Step 5: Tüm katmanları doğrula (`cloud npm run check` SIFIR HATA dahil!)**

Run: `node --test tests/core.test.mjs; Push-Location cloud; npm run check && npm test; Pop-Location; $env:CARGO_TARGET_DIR='C:\Users\Alican\.gemini\antigravity\worktrees\ack-deck\eski_sohbet_devam\src-tauri\target'; cargo test --manifest-path src-tauri/Cargo.toml`
Expected: `cloud npm run check` ZERO errors, ALL Node/Cloud/Rust tests PASS!

---

## Faz 3: Açık Tema (Light Theme) Kontrastları, Rota Temizliği & Modülerlik

### Task 9: Açık Tema Inline Renk Temizliği ve Eski Yönlendirme Temizliği

**Files:**
- Create: `src/components/notificationSettings.css`
- Modify: `src/components/NotificationSettings.tsx`
- Modify: `src/components/DisplayScaleControls.tsx`
- Modify: `mobile/src/MobileSettings.tsx`
- Modify: `mobile/src/MobileMediaAiAssistant.tsx`
- Modify: `mobile/src/MobileMediaTracker.tsx`
- Modify: `mobile/src/SendCard.tsx`
- Modify: `mobile/src/styles/lock-pomodoro.css`
- Modify: `mobile/src/styles/cards-dorm-weather.css`
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/Projects.tsx`

- [ ] **Step 1: Açık tema inline kontrast hatalarının kalmadığını doğrulayan statik kontrol testi ekle (`tests/core.test.mjs` / `mobile/tests/mobile.test.mjs`)**

- `tests/core.test.mjs`: `NotificationSettings.tsx` ve `notificationSettings.css` içinde çıplak `#f1f5f9` / `#a0b2c6` / `color: "#..."` inline karanlık sabitleri yerine semantic CSS değişkenleri (`var(--app-text)`, `var(--app-muted)`, `var(--app-surface)`) kullanıldığını doğrula.
- `mobile/tests/mobile.test.mjs`: `MobileSettings.tsx` PIN modalı, `MobileMediaAiAssistant.tsx` ve `MobileMediaTracker.tsx` içinde çıplak `color: "#fff"` / `#f8fafc` / `#e2e8f0` kalmadığını doğrula.

- [ ] **Step 2: Masaüstü `NotificationSettings` & `DisplayScaleControls` açık tema sınıflarını taşı**

- `src/components/notificationSettings.css`: NotificationSettings kartları, kanal satırları, durum özet şeridi, buton tonları (`--app-surface`, `--app-surface-2`, `--app-text`, `--app-muted`, `--app-border`) hem koyu hem `:root[data-theme="light"]` altında net okunaklı olacak şekilde çıkar.
- `NotificationSettings.tsx` ve `DisplayScaleControls.tsx` içindeki tüm `#f1f5f9`, `#a0b2c6`, `#94a3b8`, `rgba(255,255,255,0.02)` inline stillerini CSS sınıflarına/token'lara çevir.

- [ ] **Step 3: Mobil açık tema inline renklerini semantic CSS değişkenlerine çevir**

- `mobile/src/MobileSettings.tsx` (PIN modalı), `MobileMediaAiAssistant.tsx`, `MobileMediaTracker.tsx`, `SendCard.tsx`: `color: "#fff" | "#f8fafc" | "#e2e8f0" | "#94a3b8"` -> `var(--app-text)` / `var(--app-muted)`; `rgba(255,255,255,0.0x)` -> `var(--app-surface-soft)` / `var(--app-border)` (uygun sınıfları `mobile/src/styles/lock-pomodoro.css` ve `mobile/src/styles/media-ai.css` içine koy, `mobile/src/styles/timeline-settings.css` `[data-theme="light"]` değişkenleriyle uyumlu tut).

- [ ] **Step 4: Eski rota kalıntılarını sadeleştir (`App.tsx`, `Sidebar.tsx`, `navigationHistory.ts`)**

- `"pc"` ve `"archive"` gibi var olmayan ölü sayfa kimlikleri doğrudan `pageViews` haritasında yer almasın; bunun yerine `normalizeRoute(target)` helper'ı yalnızca eski yer imlerinden veya harici çağrılardan gelen `"pc" | "archive" -> "home"`, `"tools" | "workspaces" | "qr" | "ip" | "files" | "speed" -> "projects"` (tool tabını koruyarak) tek noktada dönüştürsün; `Sidebar.tsx` `Page` tipi yalnızca gerçek sayfaları (`"home" | "tasks" | "calendar" | "notes" | "media" | "projects" | "ai" | "subscriptions" | "inbox" | "settings"`) + tools parametresini temiz taşısın (dikkat: `ackActions.ts` ve `nativeNavigation` testleri ile `tools` / `speed` AI yönlendirmesi bozulmadan çalışmalı!).

- [ ] **Step 5: Build & test doğrulaması yap**

Run: `npx tsc --noEmit && node --test tests/core.test.mjs; Push-Location mobile; npm run build && npm test; Pop-Location`
Expected: PASS.

---

### Task 10: Monolit Dosyaların Modüler Bölünmesi (`AGENTS.md §3`)

**Files:**
- Modify & Split:
  - `src/components/NotificationSettings.tsx` -> extract `src/components/NotificationChannelGroup.tsx` & `src/components/NotificationDevicesCard.tsx` (her biri < 260 satır)
  - `src/components/MediaTracker.tsx` -> extract `src/components/MediaFormModal.tsx` & `src/components/MediaDetailModal.tsx` (`MediaTracker.tsx` < 550 satır)
  - `mobile/src/MobileMediaTracker.tsx` -> extract `mobile/src/MobileMediaModals.tsx` (`MobileMediaTracker.tsx` < 550 satır)
  - `mobile/src/main.tsx` -> extract `mobile/src/MobileTodayView.tsx` & `mobile/src/MobilePairingScreen.tsx` & `mobile/src/MobileMoreViews.tsx` (uyarı: `mobile/tests/mobile.test.mjs` `main.tsx` içinde `getUserMedia({audio:true})` ve `prayer-month.css` aradığı için ses kaydı ve CSS importları `main.tsx` içinde korunur, sadece dev JSX/ekran blokları bölünür; hedef `main.tsx` < 550 satır!)
  - `src/styles/media-overview.css` (1417 satır) -> gerekirse `src/styles/media-tracker.css` & `src/styles/media-modals.css` olarak ayırıp `App.tsx`'e import et.

- [ ] **Step 1: Modül bölme sonrası import ve statik sözleşme testlerinin bozulmadığını göz önünde tutarak dosyaları çıkar**

- Önce `NotificationSettings.tsx`, ardından `MediaTracker.tsx`, ardından `MobileMediaTracker.tsx`, son olarak `mobile/src/main.tsx` içindeki JSX görünümlerini sıfır davranış değişikliğiyle alt bileşenlere ayır.

- [ ] **Step 2: Tüm workspace'lerde TypeScript, Vite bundle ve mevcut testleri çalıştır**

Run: `npm run build && node --test tests/*.test.mjs; Push-Location mobile; npm run build && npm test; Pop-Location`
Expected: PASS (hem masaüstü hem mobil `tsc` + `vite build` + `bundle.test.mjs` + tüm unit/integration testler yeşil).

---

## Faz 4: Final Uçtan Uca Doğrulama

### Task 11: Tam Kod Tabanı Doğrulama Kapısı (`verification-before-completion`)

- [ ] **Step 1: Gizli anahtar, encoding ve yapı denetimini çalıştır**

Run: `node scripts/release-audit.mjs`
Expected: `Release audit failures: 0`.

- [ ] **Step 2: Masaüstü TypeScript + Vite build + kök test süiti**

Run: `npm run build && node --test tests/*.test.mjs`
Expected: Exit code 0, sıfır hata/skip.

- [ ] **Step 3: Mobil TypeScript + Vite PWA build + service worker + mobil test süiti**

Run: `Push-Location mobile; npm run build && npm test; Pop-Location`
Expected: Exit code 0, tüm testler PASS.

- [ ] **Step 4: Bulut TypeScript kontrolü (`tsc --noEmit`) + Miniflare Worker test süiti**

Run: `Push-Location cloud; npm run check && npm test; Pop-Location`
Expected: `tsc --noEmit` exit code 0, tüm Worker testleri PASS.

- [ ] **Step 5: Rust `src-tauri` birim testleri & derleme kontrolü**

Run: `$env:CARGO_TARGET_DIR='C:\Users\Alican\.gemini\antigravity\worktrees\ack-deck\eski_sohbet_devam\src-tauri\target'; cargo test --manifest-path src-tauri/Cargo.toml`
Expected: Exit code 0, tüm Rust unit testleri PASS.

- [ ] **Step 6: `git status` ve çalışma alanı temizlik kontrolü (`AGENTS.md §2.4` & `TESTING_HYGIENE.md`)**

Run: `git status --short`
Expected: Yalnızca beklenen kaynak/plan/test dosya değişiklikleri görünür; disk şişiren geçici dosya, `node_modules` artığı veya istenmemiş commit/push bulunmaz.

---

## Review Focus (Öncelikli Hata Sınıfları & Test Kapsamı Özeti)
1. **Eski yedek uyumluluğu:** Eski v1/v2 yedeklerinde `paletteShortcut` veya `"tools"/"archive"` `startPage` varsa restore/parse kırılmamalı (`Task 4` ve `Task 6` testleriyle örtülür).
2. **Eski mobil cihaz PIN migration'ı:** Güncelleme öncesinde 7–12 haneli PIN kaydetmiş (yani `pinLength` kaydedilmemiş) bir kullanıcının PIN'i kilitli kalmamalı; `✓` onayıyla açılıp otomatik `pinLength` onarımı yapılmalı (`Task 3` testiyle örtülür).
3. **Otomatik yedek + taşınabilir geri yükleme uyumu:** Kayıp dosya içeren bir otomatik yedek ZIP'i yalnızca oluşturulmakla kalmayıp `open_archive` doğrulamasından geçip sağlam verileri geri yükleyebilmeli (`Task 8` Rust testiyle örtülür).
4. **AI Relay + Powerful Model süre uyumu:** `ModelChoice::Powerful` (120s) + fallback (45s) toplam süresini aşmamak için Worker `expires_at` (150s) > Mobile polling (140s) > Desktop Gemini bütçesi (`120s`) ilişkisi korunmalı (`Task 1` testiyle örtülür).
5. **Kısmi kur yanıtı:** TCMB çöktüğünde dahi `GRA` / `XU100` / `BTC` / `ETH` verileri kullanıcıya dönmeli (`Task 8` Rust testiyle örtülür).
