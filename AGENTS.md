# ACKDeck — Agent Guidance

## 1. Project Identity & Principles

ACKDeck is a personal, local-first Windows desktop application and companion mobile PWA built with:
- **Desktop:** Tauri 2 + React 19 + TypeScript + Vite + Rust (`src/`, `src-tauri/`)
- **Mobile PWA:** React 19 + TypeScript + Vite (`mobile/`)
- **Cloud / Sync:** Cloudflare Workers + D1 + KV (`cloud/`)

**Active Project Directory:** Work exclusively in the current active project folder (`C:\Users\Alican\Desktop\Projeler\ack-deck\`). The old `kontrol-merkezi` directory is obsolete.
**Session Sync & Worktree Hygiene:** At the start of every session (before reading/planning changes), run `git fetch origin`; if the active workspace/worktree or `C:\Users\Alican\Desktop\Projeler\ack-deck` (`main`) has a clean working tree and is behind `origin/main`, fast-forward (`git merge --ff-only origin/main`) so work always starts on the latest release (if uncommitted changes exist, report first instead of overwriting). Inside worktrees, inspect/reuse junctions to `C:\Users\Alican\Desktop\Projeler\ack-deck\` (`node_modules`, `src-tauri/target`) rather than duplicating multi-GB directories, and delete any leftover empty closed-session worktree folders when unlocked (`git worktree prune`).
**Product Name:** Keep the name **ACKDeck** consistently across UI, window titles, documentation, and package metadata. Tauri identifier: `com.alican.ackdeck`.

**Product Principles:**
- Local-first, lightweight, private, and Windows-focused. Intended for one person.
- No public SaaS bloat, user accounts, analytics, telemetry, or advertising.
- All user-facing text, error messages, and notifications MUST remain in **Turkish**.

---

## 2. Standing Workflow Rule — Canlıya Alma ve Rutinler

> [!IMPORTANT]
> **RUTİNLER VE CANLIYA ALMA DİSİPLİNİ:**
> 1. **Gereksiz Test Tekrarı Yasağı:** Eğer kodda yeni bir değişiklik yapılmadıysa ve ilgili testler bir önceki adımda zaten başarıyla geçmişse, deploy veya release sırasında testleri İKİNCİ KEZ TEKRARLAMA; doğrudan bir sonraki aşamaya geç. Yalnızca kod değiştiyse veya testler henüz koşulmadıysa çalıştır.
> 2. Kullanıcı açıkça **"rutinleri yap"** dediyse: Tüm adımları eksiksiz uygula:
>    - **Testler:** Testleri çalıştır (`tests/`, `mobile/tests/`, `cloud/tests/`) (eğer az önce zaten koşulmadıysa).
>    - **Sürüm Eşitlemesi (Version Bump):** Sürüm yükseltildiğinde 5 dosyada birden eşitlenmelidir: `package.json`, `mobile/package.json`, `cloud/package.json`, `src-tauri/tauri.conf.json` ve **`src-tauri/Cargo.toml`** (Cargo güncellenmezse masaüstü sürüm yanlış görünür).
>      - **Sürüm Numaralandırma Kuralı (Ondalık / Tek Basamaklı İlerleme):** Sürümler daima ondalık sistem gibi tek basamaklı ilerler (`0`dan `9`a kadar):
>        - `X.Y.0` ➔ `X.Y.1` ➔ ... ➔ `X.Y.9` olduktan sonra sonraki sürüm `X.(Y+1).0` olur (Örn: `2.0.9` ➔ `2.1.0` ➔ ... ➔ `2.1.9` ➔ `2.2.0`).
>        - Ortadaki hane de `9`a ulaştığında (Örn: `1.9.9` veya `2.9.9`), sonraki sürüm doğrudan bir üst ana sürüme geçer (`1.9.9` ➔ `2.0.0`, `2.9.9` ➔ `3.0.0`).
>        - Asla `1.9.10` veya `2.0.10` gibi iki basamaklı sürüm numarası kullanılmaz.
>    - **Windows Installer & Release Derleme:**
>      - İmza anahtarı: `$env:TAURI_SIGNING_PRIVATE_KEY = Join-Path $env:USERPROFILE '.tauri/ack-deck-updater.key'` ve `$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''`
>      - `npm run tauri build` ile NSIS ve MSI paketlerini derle.
>      - `node scripts/prepare-update.mjs` ile `latest.json` güncelleme bildirimini oluştur.
>      - `node scripts/verify-release.mjs` ile doğrula.
>      - `gh release create v<sürüm>` ile setup `.exe`, `.exe.sig`, `.msi` ve `latest.json` dosyalarını GitHub Release'e yükle.
>    - **Cloudflare Worker:** `cloud/` dizininde `npx wrangler deploy` ile worker'ı canlıya al.
>    - **Git:** Değişiklikleri anlamlı bir mesajla `git commit` et ve `git push` ile `origin/main`e gönder.
> 3. Kullanıcı açıkça **"mobili canlıya al"** dediyse: YALNIZCA mobil ve bulut testlerini çalıştır (eğer az önce zaten koşulmadıysa) ve Cloudflare Worker'ı doğrudan canlıya al (`wrangler deploy`). Masaüstü release veya genel push yapma.
> 4. Kullanıcı bunlardan birini veya benzerini açıkça **demediği sürece**: Canlıya alma, deployment, git commit veya git push işlemlerini **ASLA kendiliğinden yapma**. Kodları hazırla, testleri doğrula ve kullanıcı talimatını bekle.

---

## 3. Kod Kalitesi & Spagetti Yasağı (Modularity & Clean Code)

> [!WARNING]
> **MONOLİT VE SPAGETTİ KOD YASAĞI:**
> - Kodları asla binlerce satırlık tek parça devasa monolitik dosyalara dönüştürme.
> - Büyük bileşenleri mantıksal alt bileşenlere, CSS'leri modüler parçalara (örneğin `styles/` dizini altına), yardımcı mantıkları `store` veya `shared` modüllerine böl.
> - Kod okunabilirliği ve bakım kolaylığı her zaman korunmalıdır.

---

## 4. AGENTS.md Yalınlık İlkesi (Lean Guidance)

- **Gereksiz Ayrıntı Yasağı:** Gerçekten önemli, kalıcı ve projenin vazgeçilmez kuralları haricinde `AGENTS.md` içerisine geçici yapılacaklar listeleri (roadmap), önemsiz notlar veya geçici loglar ekleme.
- Dosya her promptta okunabilecek kadar kompakt, öz ve yüksek öncelikli kurallardan oluşmalıdır.

---

## 5. Test Dosyaları ve Disk Alanı Disiplini (Storage & Testing Hygiene)

> [!CAUTION]
> **40 GB ŞİŞME VE BÜYÜK DOSYA YASAĞI:**
> Geçmişte yaşanan kontrolsüz disk şişkinliklerini (40 GB'lara varan disk tüketimi) kesinlikle önlemek esastır:
> 1. **Büyük Fikstür Yasağı:** Asla diskte megabaytlarca veya gigabaytlarca yer kaplayan sahte girdiler, dummy blob'lar, devasa tampon bellekler (buffer) veya gereksiz test yığınları oluşturma.
> 2. **Bellek İçi (In-Memory) Mocking:** Testler (`tests/`, `mobile/tests/`, `cloud/tests/`) saf bellek içi mock'lar, sanal VM depolama veya akışlar kullanarak birkaç yüz milisaniyede tamamlanmalıdır.
> 3. **Anında Temizlik (Teardown):** Eğer fiziksel geçici bir dosya oluşturulması zorunluysa, test biter bitmez anında silinmelidir.
> 4. **Kullanıcıya Rapor Zorunluluğu:** Büyük boyutlu bir stres veya kota testi gerekiyorsa, kullanıcıya önceden rapor verilip onay alınmadan asla çalıştırılamaz.
> Ayrıntılar için `TESTING_HYGIENE.md` belgesine bakın.

---

## 6. Powerful Model ("Güçlü Model") & Study Program Kuralları — DO NOT BREAK

`src-tauri/src/gemini.rs`, `src-tauri/src/gemini_tools.rs`, `src/components/AckAi.tsx`, `src/ackActions.ts` veya `src/ackIntegration.ts` dosyalarında yapılacak değişikliklerde şu kurallar **asla bozulamaz**:

1. **`sendGeminiMessage` Asla `withAiTimeout` ile Sarılmayacaktır (`AckAi.tsx`)**:
   - `withAiTimeout` frontend'de 30 saniyelik yerel onay süre aşımı içindir. Rust `gemini_chat` zaten model bazlı ağ bütçesini (`ModelChoice::Powerful` için 120s, `ModelChoice::Fast` için 45s) yönetmektedir. Frontend'de sarmalamak Güçlü Model yanıtlarını erken keser.
2. **Otomatik Hızlı Model Geri Çekilmesini (Fallback) Koru (`gemini.rs`)**:
   - Güçlü Model (`gemini-3.8-flash`) isteği HTTP 5xx, timeout, boş candidate veya geçersiz araç çağrısıyla başarısız olursa, `gemini_chat` kullanıcıya hata dönmeden önce otomatik olarak `FAST_MODEL` (`gemini-3.5-flash-lite`) modeline geçerek isteği tamamlamak zorundadır. Bu blok silinemez.
3. **Düşünmeyen Modelde `thinking_settings` Temiz Tutulmalıdır**:
   - `thinking_settings` yalnızca `gemini-3.*` flash modellerinde `thinkingConfig` ayarlar; `FAST_MODEL` (`gemini-3.5-flash-lite`) modeline geçildiğinde `thinkingConfig` payload'dan kaldırılmalıdır (aksi takdirde API 400 hatası verir).
4. **`maxOutputTokens: 8192` ve Rol Birleştirme (`chat_payload`)**:
   - Düşünce token'larının JSON araç çağrılarını kesmemesi için `maxOutputTokens: 8192` korunmalıdır. Ardışık aynı role sahip mesajlar API kuralı gereği tek bir `contents` elemanında birleştirilmelidir.
5. **Ders Programı Araç Tanımları (`gemini_tools.rs`)**:
   - `create_study_program`, `update_study_program`, `delete_study_program` araçları ACK AI'ın Haftalık Plan üzerinde onay kartıyla işlem yapmasını sağlar. Bu araçlar ve sınır kontrolleri (1..=60 seans, 10..=240 dk) korunmalıdır.
6. **Gemini API Anahtarı Güvenliği**:
   - API anahtarı Windows Credential Manager'da saklanır; asla hardcode edilmez, commit edilmez, localStorage'a konmaz, loglanmaz ve frontend'e geri döndürülmez.

---

## 7. Veri Güvenliği ve Kalıcılık

- Kullanıcı verileri (Görevler, Notlar, Ders Programları, Namaz Kayıtları, Koleksiyon, Abonelikler) implementasyon kolaylığından önemlidir.
- Asla kestirme olarak `localStorage` veya veritabanını sıfırlama (`clear()`).
- Şema değişiklikleri geriye dönük uyumlu (additive/backward-compatible) olmalı, eski kayıtlar korunarak taşınmalıdır.
- Başarısız kurtarma veya geri yükleme işlemlerinde kurtarma kaydı (journal) silinmez, üzerine yazma engellenir.

---

## 8. Mobil PWA ve Senkronizasyon Standartları

1. **iPhone 11 & 350px Kullanılabilir Genişlik Kuralı**:
   - Mobil kart içi usable genişlik 350px'dir. Başlık, sayaç ve butonlar tek bir flex satırına sıkıştırılmamalıdır (taşma ve hizalama bozukluğunu önlemek için 2 satırlı yapı kullanılır).
   - iOS otomatik zoom'unu önlemek için tüm mobil form elemanlarında `font-size: 16px !important` kullanılır; alt sayfalarda `autoFocus` kullanılmaz.
2. **Başlık ve Hava Durumu Düzeni**:
   - Mobil tepe karşılama şeridinde sol tarafta karşılama metni ("İyi günler, Alican"), sağ tarafta hava durumu butonu yer alır; araya ekstra buton konularak hava durumunun görünümü bozulmaz.
3. **Tek Seferlik Otomatik Face ID**:
   - Biyometrik kilit devredeyken açılışta yalnızca 1 kez Face ID sorulur, kullanıcıyı tekrar tekrar onaylamaya zorlayan ayar düğmeleri veya çift prompt bulunmaz.
4. **Altınkalem Yemek Menüsü 2-Kademeli Önbellek**:
   - 1. Kademe: Cloudflare Worker KV `dorm-menu:cache` (3 saat TTL).
   - 2. Kademe: İstemci içi tazelik kontrolü (`isDormMenuFresh()`, 2.5 saat). Kullanıcı günde onlarca kez girse bile dış siteye gereksiz istek gitmez.

---

## 9. Masaüstü Tasarım Dili

- Sakin, göz yormayan koyu antrasit tonlar, hafif mavi vurgular; yerel öncelikli sade ve odaklanmaya uygun arayüz düzeni korunur.
