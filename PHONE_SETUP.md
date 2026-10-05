# ACKDeck Mobile kurulumu

ACKDeck Mobile, iPhone Ana Ekranına eklenen bir PWA'dır. App Store uygulaması, ntfy veya Apple Developer üyeliği gerekmez. iPhone Web Push için iOS 16.4 veya üzeri ve Ana Ekrandan açılan web uygulaması gerekir. [Apple/WebKit açıklaması](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

## Bu bilgisayardaki dağıtım

Mobil adres: **https://ack-deck-phone.ack-deck-cloud.workers.dev**

Worker, D1/KV binding'leri, iki production migration, dakikalık Cron ve dört Worker secret kuruldu. Masaüstü Telefon ekranında bu adres varsayılan olarak hazırdır. Sahip anahtarı Windows Credential Manager'dadır; tekrar oluşturmanız gerekmez. İlk görev/not yüklemesi için uygulamadaki açık onay hâlâ gerekir. Bu bilgisayarda aşağıdaki altyapı kurulumunu yeniden çalıştırmayın; doğrudan **3. Masaüstü ve iPhone eşleştirme** adımına geçin.

Canlı API doğrulaması güvenli araçla tekrarlanabilir:

```powershell
cargo run --manifest-path src-tauri/Cargo.toml --bin phone-owner-setup -- --verify https://ack-deck-phone.ack-deck-cloud.workers.dev
```

Bu kontrol yalnızca kimlik doğrulama/VAPID hazırlığını raporlar; anahtarı göstermez, görevleri yüklemez veya telefona bildirim göndermez.

Ücretli ürün/plan değişikliği veya billing işlemi yapılmadı. OAuth oturumu hesap aboneliklerini okumaya yetkili olmadığından mevcut hesabın Free/Paid etiketi API üzerinden doğrulanamadı (403). Cloudflare panelinde Workers planının Free olduğunu kontrol edin; Paid yükseltmesini kabul etmeyin.

## 1. Cloudflare Free hesabı ve dağıtım

Cloudflare **Free** hesabı kullanın. Kart, plan yükseltme veya ücretli ürün istenirse ilerlemeyin. R2 kullanılmaz. Ücretsiz kota aşımı servis kesintisine yol açabilir; otomatik ücretli yükseltme yapılmaz.

Proje kökünden:

```powershell
npm ci --prefix mobile
npm ci --prefix cloud
npm run build --prefix mobile
cd cloud
npx wrangler whoami
npx wrangler login
npx wrangler d1 create ack-deck-phone
npx wrangler kv namespace create ATTACHMENTS
```

Oturum zaten açıksa `login` gerekmez. Tarayıcıda Cloudflare hesabınızı yetkilendirin; API token veya gizli anahtarı sohbet/source code içine yazmayın.

İki oluşturma komutunun döndürdüğü **gizli olmayan** D1 `database_id` ve KV `id` değerlerini `cloud/wrangler.jsonc` içindeki sıfırlardan oluşan yer tutucularla değiştirin. Binding adları `DB` ve `ATTACHMENTS` kalsın.

```powershell
npx wrangler d1 migrations apply ack-deck-phone --local
npx wrangler d1 migrations apply ack-deck-phone --remote
npm run deploy
```

İlk dağıtımda API, sahip anahtarı kurulana kadar kapalıdır. CLI'nin gösterdiği `https://ack-deck-phone.<hesabınız>.workers.dev` adresini saklayın. Özel domain gerekmez. Worker, mobil statik dosyaları, aynı-origin `/api/*` ve dakikalık Cron'u birlikte sunar.

## 2. Gizli anahtarları güvenli hazırlama

`cloud` klasöründe, kendi iletişim adresinizle:

```powershell
node scripts/vapid-setup.mjs mailto:adresiniz@example.com
```

Bu araç VAPID anahtarlarını bellekte üretir ve `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` değerlerini Wrangler secrets ile kaydeder. Gizli anahtarı ekrana/dosyaya yazmaz. Mevcut VAPID özel anahtarı varsa telefon aboneliklerini bozmamak için değiştirmez.

Proje köküne dönüp Windows'ta:

```powershell
cd ..
cargo run --manifest-path src-tauri/Cargo.toml --bin phone-owner-setup
```

Araç güçlü bir sahip anahtarını Windows Credential Manager'a kaydeder ve aynı değeri Worker'ın `OWNER_SECRET` secret'ına gönderir. Anahtar frontend'e, localStorage'a veya yedeğe girmez. Mevcut sahip anahtarı varsa yeniden kullanılır. Gemini anahtarına dokunulmaz. Bu komutu yalnızca kendi Windows hesabınızda, doğru Worker yapılandırmasıyla çalıştırın.

## 3. Masaüstü ve iPhone eşleştirme

1. `npm run tauri dev` ile ACKDeck'i açın.
2. **Ayarlar → Telefon** altında Worker HTTPS adresini yazın.
3. **Telefon entegrasyonunu etkinleştir** ve ardından ilk görev/not yüklemesinin açıklamasını okuyup **Onayla ve Etkinleştir** seçin.
4. **Telefon Eşleştir** ile beş dakika geçerli, tek kullanımlık QR/kod oluşturun.
5. iPhone Safari'de mobil adresi açın; paylaşım menüsünden **Ana Ekrana Ekle** seçin.
6. Ana Ekrandaki ACKDeck Mobile'ı açın ve masaüstündeki alternatif kodu girin. Safari'deki eşleştirme kodu Ana Ekran uygulamasına taşınmazsa yeni kod oluşturabilirsiniz.
7. Mobil **Ayarlar → Bildirimleri Aç**, ardından **Test Bildirimi Gönder** seçin. Bildirim izni yalnızca düğmeye dokununca istenir.

En fazla beş etkin cihaz eşleştirilebilir. Telefona ayrı, kaldırılabilir cihaz token'ı verilir; sunucu token'ın yalnızca hash'ini tutar. Token mobil IndexedDB'de saklanır; telefonunuzu ve Ana Ekran uygulaması erişimini koruyun.

## Günlük kullanım ve sınırlar

- **Bugün:** geciken, bugünkü ve yakın görevler; ekleme, düzenleme, tamamlama, yeniden açma ve erteleme. Notlar mevcut masaüstü notlarıyla eşitlenir.
- **Gelenler:** metin, http/https link, fotoğraf/PDF/ses dosyası ve ACK AI'a mesaj bırakma. Mikrofon yalnızca **Sesli Not** seçilince açılır; kayıt en fazla iki dakikadır ve gönder düğmesine kadar telefonda bekler.
- Dosyalar en fazla **10 MB**, geçici bulut saklama **30 gün**. PNG/JPEG/WebP/HEIC, PDF, MP4/MP3/OGG/WebM/WAV ses ve düz metin desteklenir; çalıştırılabilir dosyalar/script'ler reddedilir. Geçici toplam alan 800 MB ile sınırlıdır. KV yayılımı nedeniyle yeni dosyanın indirilmesi kısa süre gecikebilir.
- Masaüstü Gelenler dosyayı yalnızca sizin seçtiğiniz yere kaydeder; dosya/link kendiliğinden açılmaz ve ACK AI'a gönderilmez. **ACK AI'da Aç** yalnızca mesaj kutusunu doldurur; Gemini için ayrıca **Gönder** gerekir.
- Geçici internet kesintisinde görev/notlar IndexedDB kuyruğunda tutulur ve bağlantı dönünce eşitlenir. Dosya/Link/Gelenler gönderileri internet gerektirir. Metin formu hata halinde korunur. PWA kabuğu ilk çevrimiçi açılıştan sonra önbelleğe alınır.
- Çakışmada iki sürüm korunur; kullanıcı yerel veya bulut sürümünü seçer. Silmeler tombstone kullanır; eski çevrimdışı düzenleme silinmiş kaydı otomatik diriltmez.
- Masaüstü çalışırken yaklaşık 60 saniyede bir eşitleme/heartbeat yapar. Mobilde **Yenile** veya uygulamayı yeniden açma güncel veriyi alır. **PC çevrimiçi** durumu son heartbeat'e göre yaklaşık 2,5 dakikada eskir; gerçek güç durumunun garantisi değildir.
- Çalışma alanı isteği yalnızca kayıtlı alan kimliğini taşır. Bilgisayar çevrimdışıyken istek **10 dakika** bekler; geri geldiğinde masaüstünde onay gerekir. Bilgisayarı uyandırmaz. Çevrimiçi istek bir sonraki masaüstü eşitlemesinde işlenir.
- Bulut hatırlatmaları **PC tamamen kapalıyken** de çalışır; dağıtılmış Worker, Cron, geçerli telefon aboneliği ve internet gerekir. Cron dakikada bir, en fazla beş teslimatı işler; anlık teslimat garantisi yoktur. iOS bildirim/odak ve ağ durumu teslimatı etkileyebilir. Belirsiz ağ sonucunda aynı bildirimi tekrar gönderme riski yerine yeniden deneme durdurulur.
- Windows hatırlatmaları ayrı mevcut yerel davranışını korur; PC/ACKDeck tamamen kapalıyken Windows bildirimi göndermez.
- Buluta görevler/notlar, Gelenler, cihaz/hatırlatma bilgileri ve çalışma alanlarının güvenli ad/kimlik/açıklamaları gider. Gemini anahtarı, sohbet geçmişi, proje/dosya/program hedef yolları, arşiv ve diğer dosyalar eşitlenmez.
- Yerel yedekler mevcut görev/not kopyalarını içerir. Sahip anahtarı, telefon token'ları, VAPID özel anahtarı ve geçici gelen dosyaları yedeklenmez. Yedek geri yükleme telefon eşitlemesini duraklatır; yeniden etkinleştirme açık onay ister.

## Duraklatma ve erişimi kaldırma

Masaüstü **Ayarlar → Telefon → Telefon entegrasyonunu duraklat** yalnızca masaüstü eşitlemesini durdurur; bulut verileri ve mevcut telefon hatırlatmaları silinmez. Telefon erişimini kapatmak için **Eşleştirilmiş cihazlar → Erişimi Kaldır** veya mobil **Cihaz Bağlantısını Kes** kullanın. Token ve push aboneliği geçersiz olur. Eşitlenmemiş mobil kayıt varken bağlantı kesme engellenir.

## Yerel doğrulama

```powershell
npm run build
node --test tests/*.test.mjs
npm run build --prefix mobile
npm test --prefix mobile
npm run check --prefix cloud
npm test --prefix cloud
cd cloud
node scripts/local-test-secrets.mjs
npm run migrate:local
npm run dev
```

Yerel Worker/PWA: `http://127.0.0.1:8787`. Yerel secrets aracı yalnızca ignored `.dev.vars` içine sahte test anahtarları üretir; var olan dosyanın üzerine yazmaz. Bu dosyayı production secrets olarak kullanmayın. `http://127.0.0.1:8787/cdn-cgi/local/scheduled?format=json&cron=*+*+*+*+*` yerel Cron'u tetikler. Gerçek iPhone push için dağıtılmış HTTPS sürümü gerekir. Masaüstü ayrı güvenlik sınırı gereği yalnızca HTTPS `workers.dev` sunucusunu kabul eder; masaüstü/mobil eşitleme motorlarının ortak Worker akışları izole workerd/D1 testlerinde çalıştırılır.

Altyapı kaynakları: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [KV limitleri](https://developers.cloudflare.com/kv/platform/limits/), [kullanılan standart Web Push kütüphanesi](https://github.com/block65/webcrypto-web-push/blob/master/packages/web-push/README.md).

### Bildirim hata kodları

Test bildirimi artık abonelik eksikliği/süresi dolması, VAPID yapılandırması, şifreleme ve push servis erişimi hatalarını Türkçe ayırır. Sunucu yönlendirmeleri takip etmez. 403 veya geçici ağ hatası aboneliği silmez; yalnızca servis 404/410 döndürürse yeniden Bildirimleri Aç gerekir. Mevcut VAPID anahtarlarını deneme amacıyla döndürmeyin.
