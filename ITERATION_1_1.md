# ACKDeck 1.1 — Uygulama ve doğrulama

## Mobil ortak koyu tema ve bildirim adı — 7 Ekim

Kullanıcının beğendiği Notlar paleti bütün mobil sayfalara taşındı: koyu gri zemin/yüzeyler, sıcak sarı vurgu, nötr yazı ve kenarlık renkleri. CSS ortak renk değişkenleri kullanır; görevler, gönderme kartı, çalışma alanları, abonelikler, ayarlar, eşleştirme, alt menü, formlar ve durum mesajları aynı palettedir. Hata/kayıt ve çevrimiçi durumlarının anlamlı kırmızı/yeşil ayrımı korunur. Not düzenleyicisindeki açık kâğıt rengi kaldırılıp aynı koyu tema uygulanmıştır. PWA theme/background renkleri de eşlenmiştir.

Bildirim başlığı hem service worker hem sunucu/native tarafında zaten ACKDeck'tir. Mobil manifest name/short_name ve Apple ana ekran başlığı ACKDeck olarak birleştirildi; kısa ad ACK kaldırıldı. WebKit, ana ekrana eklenirken seçilen adı uygulama kimliğine dahil eder; mevcut iPhone kurulumunun adı veya sistemin eklediği gönderen satırının otomatik değişmesi bu yayınla garanti edilemez. Eşleşme, push aboneliği, manifest start_url/scope ve veri anahtarları değiştirilmedi; yeniden kurulum veya abonelik rotasyonu yapılmadı.

Mobil build ve 12 test, release audit başarılıdır. Dağıtım `c81a71db-4c55-455d-b619-a659a617eac9`. Görsel/fiziksel iPhone doğrulaması mevcut araç erişimiyle yapılamadı. Masaüstü paketi ve GitHub Release değiştirilmedi.

## Mobil Notlar görsel yenilemesi — 7 Ekim

Kullanıcının önceki mobil Notlar görünümünü beğenmemesi üzerine yalnız bu bölüm yeniden tasarlandı. Sayfa kendi başlığını, belirgin Yeni not düğmesini, arama alanını ve daha okunaklı başlık/önizleme/tarih kartlarını kullanır; Notes ekranındaki yinelenen genel uygulama başlığı ve PC özeti kaldırılır. Eşitleme durumu not başlığında korunur. Koyu gri kartlar ve sıcak vurgu rengi, açık kâğıt renkli yazma ekranıyla tamamlanır. 400px ve üstünde iki sütun, küçük telefonlarda tek sütun kullanılır.

Yazma ekranında başlık çok satıra açılır ve içerik yazdıkça uzar; iç içe metin kaydırma yerine sayfa kayar. Kaydet üstte sabit, silme ve kelime/karakter sayısı altta ayrı durur. Mevcut kayıt, silme onayı/geri alma, eşitleme ve kaydetmeden çıkış onayı korunur. Notlara özel CSS ayrı dosyaya alındı.

Mobil build ve 12 test başarılı; uzun başlık/metin boyutlandırma, genişlik değişimi, küçülme ve resize listener temizliği test edildi. Release audit sıfır hata; tarayıcı/native envanteri boş olduğundan gerçek iPhone görsel/klavye testi yapılmış sayılmaz. Mobil dağıtım `ea787af7-82ca-4794-8e87-7b23bfdb781c`; canlı HTML, SW, manifest, JS ve CSS yerel build ile hash eşleşti ve anonim API erişimi 401 verdi. İlk SW kontrolündeki geçici edge yayılma farkı sonraki doğrulamada giderildi. Masaüstü paketi, GitHub Release ve kullanıcı verisi değiştirilmedi.

## 1.1.1 yayın ve mobil not defteri

Kullanıcı 1.1.0'ı kurduğunu bildirip GitHub üzerinden güncelleme yayımlanmasını açıkça istedi. Depo özel olduğu için anonim updater erişimi mümkün değildi; kaynak kodu ve geçmişi görünür kılma onayı ayrıca alındı. Takip edilen mevcut dosyalar ve tüm Git geçmişindeki blob'lar üzerinde 494 dosyalık kimlik bilgisi taraması sıfır bulgu verdi; repo public yapıldı. Ürün ve lockfile sürümleri 1.1.1'e yükseltildi; updater adresi, public anahtarı ve uygulama/veri kimliği korunur.

Mobil Notlar genel formdan ayrıldı. Aramalı başlık/önizleme/tarih listesi; üstte Notlar ve Bitti, kenarlı form kutuları yerine geniş başlık ve metin alanı, altta ayrı silme kontrolü olan tam ekran not defteri kullanılır. Bitti mevcut çevrimdışı dayanıklı kayıt/eşitleme akışına kaydeder; yazılmamış veya değişmiş nottan kaydetmeden çıkış onay ister. Yeni içerik türü veya depolama şeması eklenmedi.

Mobil build ve 11 test, masaüstü build ve 137 test, bulut 13 test, release audit başarılıdır. Mobil son dağıtım `cdf5842c-adf2-4790-9304-f7184ebffbcc`; canlı HTML/SW/manifest/JS/CSS yerel build ile hash eşleşti, anonim API 401 verdi. Native/tarayıcı envanteri boş olduğundan gerçek ekran ve fiziksel updater kurulum testi bu sonuçlardan çıkarılmaz.

1.1.1 NSIS installer ve `.sig` üretildi; EXE frontend asseti ve ProductVersion 1.1.1 doğrulandı. Installer updater imzası yapılandırmadaki public anahtarla kriptografik olarak doğrulandı. `latest.json` 1.1.1 ve aynı release'teki installer adresini içerir. Windows Authenticode imzası yoktur. Build wrapper exit 1 döndürse de Rust release/NSIS/signature çıktıları ve bağımsız artifact doğrulaması başarılıdır. Paket kullanıcı tarafından talep edilen normal `v1.1.1` GitHub Release için hazırlanmıştır.

## 7 Ekim ikinci arayüz düzenlemesi

Mobil Gelenler başlığı Gönderilenler oldu. Metin, bağlantı, ACK AI, fotoğraf/dosya ve sesli not gönderme kartı sürekli açık; ses kaydı dinlenebilir ve yalnızca Gönder ile iletilir. Alt menü Bugün, Gönderilenler, Notlar ve Diğer şeklindedir; çalışma alanları Diğer'e taşındı. Mevcut eşleşme, çevrimdışı kuyruk ve API davranışları korunur.

Masaüstü görev, proje, çalışma alanı, kısayol, arşiv, abonelik ve sohbet adı düzenleme formları ortak modal pencereye alındı. İşlem menüleri kartları genişletmeyen üst katman popover'ları kullanır. Notlar liste/düzenleyici düzeni ve kayıt durumu ile sadeleştirildi. Ayarlar Genel, Görünüm, ACK AI, Telefon, Veriler ve Güncelleme bölümlerine ayrıldı; elle güncelleme kontrolü ve indirilen sürümü kurma eklendi. Kâtip 64-bit yalnız anlaşılabilirlik referansı olarak incelendi.

Masaüstü build, 137 test; mobil build, 11 test; release audit sıfır hata ile geçti. Yeni modal yaşam döngüsü, yoğun işlem sırasında Escape engeli ve güncelleme bulunamadığında yeniden kontrol davranışı test edildi. Tarayıcı/native envanteri hâlâ boş; render ve fiziksel cihaz testi yapılmış sayılmaz.

Mobil yeni build mevcut adrese yayımlandı: `401e7571-6573-416f-ad92-ce3f1d5e2274`. Canlı HTML, service worker, manifest, JS ve CSS yerel build ile SHA-256 eşleşti; anonim API erişimi HTTP 401 ile reddedildi. Backend, migration ve gerçek kullanıcı kayıtları değiştirilmedi.

NSIS 1.1.0 setup bu arayüzle yeniden üretildi; `index-ByukI63R.js` assetinin release EXE içinde bulunduğu doğrulandı. Tauri updater imzası ve `latest.json` yeniden hazırlandı. Build wrapper exit 1 döndürmesine rağmen Rust release, NSIS ve updater signature çıktıları başarılı; ayrıca oluşan paketin ACKDeck 1.1.0 metadatası doğrulandı. Authenticode yayıncı imzası yoktur. Kurulum çalıştırılmadı; GitHub release/commit/push yapılmadı.

## 7 Ekim arayüz düzenlemesi

Kullanıcının yeni talebiyle masaüstü kartları, boşlukları ve kontrolleri ortak sade görünümde düzenlendi. Tamamlanan görevler yalnız Tamamlanan filtresinde görünür; aramadan tamamlanmış göreve gidildiğinde bu filtre açılır. Ana sayfada projeler açık, abonelikler PC Durumu gibi açılır özettir. Çalışma alanları Projeler sayfasının alt bölümüne taşındı; eski arama/AI bağlantıları aynı bölüme açılır. Sol menü Günlük, Kayıtlar ve Yardımcılar gruplarındadır. Kısayollar menüden kaldırıldı; mevcut kayıtlar Araçlar içinden erişilir. Araç kartları büyütüldü.

Abonelik formunda kategori, durum, yenileme ve isteğe bağlı not doğrudan görünür. Web adresi ve simge girişleri kaldırıldı; daha önce kaydedilmiş değerler düzenleme sırasında korunur. Aynı form masaüstü ve mobilde kullanılır.

Mobil görünüm simgeli dört bölümlü alt menü, sayfa başlıkları, ayrı Notlar sayfası, cihaz/bildirim/gizlilik ayar kartları, geçici durum mesajları ve tam ekran düzenleyicilerle yenilendi. Düzenleyici açıkken arka içerik inert olur; mevcut odak tuzağı, visualViewport ve safe-area desteği korunur. Veri anahtarları, eşitleme kuyruğu, bulut API'si ve push akışı değiştirilmedi.

Doğrulama: masaüstü production build ve 134 test, mobil production build ve 11 test geçti; release audit sıfır hata bildirdi. Önceki güncelleyici değişikliğinin Rust check/fmt ve 19 test sonucu başarılıdır. Bu oturumda tarayıcı envanteri boştu ve IAB açılamadı; fiziksel Windows/iPhone görünümü, dokunma, klavye ve taşma kontrolü yapılmış sayılmaz. Mobil production yayını yapılmadı. Kullanıcı tüm değişikliklerin ardından ilk kurulum için NSIS setup oluşturulmasını açıkça istedi.

İlk kurulum paketi: `src-tauri/target/release/bundle/nsis/ACKDeck_1.1.0_x64-setup.exe`. Yeni frontend assetinin release EXE içinde bulunduğu `verify-release.mjs` ile doğrulandı. Aynı build için updater `.sig` ve `latest.json` oluşturuldu. Windows Authenticode yayıncı imzası yoktur; Tauri güncelleme doğrulama imzası ayrıdır. Installer çalıştırılmadı, gerçek kullanıcı verisi değiştirilmedi; GitHub release/commit/push yapılmadı.

Mobil yayın devamı (7 Ekim): kullanıcı production yayınını açıkça istedi. Mobil build ve 11 test, Worker type-check ve 13 test geçti; remote migration listesi bekleyen migration olmadığını doğruladı. Mevcut Worker, D1/KV binding'leri ve dakikalık Cron korunarak `https://ack-deck-phone.ack-deck-cloud.workers.dev` adresine `e9b40a51-05b3-4b18-9c23-bfd4fef9c7f3` sürümü yayımlandı. Canlı HTML, JS, CSS, manifest ve service worker HTTP 200 verdi ve SHA-256 karşılaştırmasında yerel build ile birebir eşleşti. Anonim `/api/status` HTTP 401 verdi. Credential/VAPID rotasyonu, yeniden eşleştirme, gerçek veri mutasyonu veya GitHub yayını yapılmadı. Fiziksel iPhone görünümü ve yeni dokunma/klavye kontrolü hâlâ manuel doğrulamadır.

İlk 1.1 iterasyonunda abonelikler, tekrarlayan görevler ve masaüstü/mobil sadeleştirmesi uygulanmıştır. ACKDeck adı, ACK işareti, `com.alican.ackdeck`, mevcut depolama anahtarları ve telefon eşleşmeleri korunmuştur. O aşamada yeni paket eklenmemiş ve Windows yükleyicisi oluşturulmamıştır; mevcut 1.0 kurulum dosyaları değiştirilmemiştir. 7 Ekim güncelleyici ve setup hazırlığı yukarıdaki sonraki çalışmadır.

## Abonelikler

- Masaüstünde ayrı Abonelikler sayfası; ekleme, düzenleme, durum değiştirme, onaylı kayıt silme ve 10 saniyelik geri alma.
- Aylık, yıllık, haftalık ve gün sayısıyla özel dönem. TRY/USD/EUR/GBP ayrı tutulur. Aylık karşılık yıllık/haftalık/özel dönemler için ortalamadır; kur alınmaz veya para birimleri birleştirilmez.
- Ad, kategori, tutar, para birimi, tarih, otomatik yenileme, durum, isteğe bağlı web adresi/not/simge ve zaman damgaları. Ödeme veya banka kimlik bilgisi alanı yoktur.
- İsteğe bağlı aynı gün/1/3/7 gün önce veya özel gün sayısı hatırlatması, kayıtlı saat diliminde 09:00.
- Ana sayfada en fazla üç yaklaşan ödeme ve küçük aylık karşılık özeti.
- Mobilde Daha → Abonelikler; görüntüleme, ekleme, düzenleme, durum, hatırlatma, kayıt silme/geri alma. Mevcut sürüm/istek kimliği/silme kaydı/çakışma korumalı eşitleme kullanılır.
- Yerel anahtar: `ack-deck.subscriptions.v1`. Hasarlı kök yazmaları engeller; okunamayan tekil kayıtlar korunur.

## Tekrarlar ve bildirimler

Tek sefer, her gün, hafta içi, her hafta, seçili günler, her ay ve özel gün/hafta/ay aralığı. Hafta sonu Cmt/Paz seçilerek oluşturulur. İsteğe bağlı son tarih veya tekrar sayısı gelişmiş bölümde bulunur.

Kurallar dil bağımsızdır ve başlangıç, saat, saat dilimi, aralık, günler ve bitiş içerir. Takvim hesabı kaydın saat diliminde yapılır. Kısa aylarda son gün kullanılır; sonraki ay özgün gün korunur. Yaz saati nedeniyle bulunmayan saat ileri kaydırılır; kuralın özgün saati değiştirilmez.

Tamamlama yalnızca geçerli oluşumu tamamlar; gelecekteki ilk geçerli oluşuma ilerler. Kaçırılan günler birikmez. Son tamamlanan oluşum tek zaman damgasıyla tutulur. Bitiş koşulu dolduğunda seri tamamlanır. Erteleme yalnızca geçerli bildirimi değiştirir. Kural düzenlenince eski gelecek programı değiştirilir; seri silinince bildirim programı kapanır.

Windows tarafı aynı uyuyan native kuyruk ve teslim defterini kullanır; yalnızca ACKDeck çalışırken bildirim gönderir. Bulut tarafı mevcut dakikalık Worker Cron’unu ve push teslim defterini kullanır. Görev kaydını kendiliğinden tamamlamadan ayrı bildirim imlecini ilerletir; böylece PC kapalıyken de sonraki tekrar hesaplanır. İstek tekrarı aynı oluşumu yeniden göndermez. Kullanıcının açık ertelemesi ayrı, kararlı bir bildirim programıdır. Belirsiz taşıma sonuçları otomatik tekrar gönderilmez.

## Sadeleştirme

- Ana sayfada ACK AI + Bugün en güçlü bölümler; Devam Et, çalışma alanları/sabitlenenler, küçük abonelik özeti ve hafif PC şeridi korunur. Proje/araç ayrıntıları açılır bölümde kalır.
- Günlük iş sayfaları gezinmenin başında. Görev, çalışma alanı, kısayol, proje, arşiv, sohbet geçmişi ve telefon kartlarının seyrek işlemleri açılır menülerde.
- Ayarlar konu başlıkları altında açılır. Görev, abonelik, arşiv ve AI gelişmiş alanları ihtiyaç olduğunda gösterilir.
- Form genişliği sınırı, sarılan araç çubukları, `min-width: 0`, metin kırılması ve ortak kontrol ölçüleri. Proje klasör seçicisi, uzun görev/abonelik başlıkları, sohbet listesi ve telefon QR/cihaz satırları için esnek düzen.
- Mobil gezinme: Bugün / Gelenler / Çalışma / Daha. Hızlı ekle akış içinde; form açıldığında alt menü gizlenir. Safe area, yaklaşık 44px dokunma hedefleri, form içi kaydırma, klavye viewport yüksekliği, odak tuzağı ve Escape desteği.
- Per-monitor ölçek depolaması ve kompakt paletin ayrı ölçek birimi değiştirilmemiştir.

## Veri, eşitleme ve üretim

`0003_subscriptions_recurrence.sql` yalnızca yeni abonelik tablosu ve mevcut hatırlatma tablosuna iki sütun ekler. Yerel ve üretim D1’e uygulanmıştır. DROP, veri silme, KV temizleme veya anahtar/cihaz tokenı döndürme yapılmamıştır. Migration öncesi/sonrası sayımlar aynı: 7 görev/not kaydı, 2 cihaz, 1 push aboneliği, 1 gelen kayıt, 16 mutasyon ve 4 teslim kaydı. Yeni abonelik tablosu boş başlatılmıştır; örnek kullanıcı kaydı üretime yüklenmemiştir.

Worker ve mobil aynı mevcut adrese dağıtılmıştır: https://ack-deck-phone.ack-deck-cloud.workers.dev . Cron hâlâ `* * * * *` olarak çalışır. Owner/VAPID/device tokenları değiştirilmemiştir. Ücretli plan, R2 veya başka sağlayıcı açılmamıştır.

1.0 istemcileri eski görev/not biçimini almaya devam eder. Yeni veri türleri/tekrarlar 1.1 istemcilerine iletilir. Eski istemci mevcut bir tekrar kuralını yanlışlıkla silemez. 1.1’e geçişte eşitleme imleci bir kez yeniden okunur; kayıtlar, kuyruk, sürümler ve eşleştirme tokenı korunur.

Yedek biçimi 2 değiştirilmeden isteğe bağlı abonelik bölümü ve görev tekrar alanları eklenmiştir. Geçerli eski yedekler kabul edilir; abonelik bölümü eksikse mevcut abonelikler temizlenmez. Kurtarma günlüğü ve rollback korunur. Kimlik bilgileri, cihaz tokenları ve geçici dosya içerikleri yedeklenmez. Telefon gizlilik/onay metni abonelik bilgilerini kapsar.

## Gerçekten yapılan doğrulama

- Masaüstü production build, 126 Node/frontend testi.
- Mobil production build ve 11 test; ortak formlarda tek React çalışma zamanı paket testiyle doğrulandı.
- Worker TypeScript kontrolü ve 13 workerd/D1/KV testi.
- Rust `cargo fmt --check`, `cargo check --locked`, `cargo test --locked`: 17 test.
- Kaynak/marka/anahtar/encoding denetimi: sıfır hata.
- Gerçek masaüstü/mobil eşitleme motorlarıyla D1 üzerinde iki yönlü tekrar tamamlama, abonelik değişikliği/silme, çevrimdışı tekrar deneme ve silme kayıtları.
- Takvim: günlük/2 gün, hafta içi/Pzt/Pzt-Çar-Cum/hafta sonu, haftalık/2 hafta, aylık/kısa ay/yıllık, bitiş tarihi/sayısı, kaçırılan oluşum, erteleme, saat dilimi/DST. Abonelik döngüleri, ayrı para birimleri, hatırlatma, undo, restore ve kota rollback.
- PC çevrimdışı durumunda aynı Cron ile gelecek oluşum ve tekrar göndermeme; Windows kuyruğunda abonelik/görev programının aynı native komuta gitmesi.
- Yerel masaüstü ve mobil HTTP 200; gerçek yerel scheduled handler `outcome=ok`. Doğrulama sunucuları durdurulmuştur. Kullanıcının çalışan 1.0 uygulaması kapatılmamıştır.
- Canlı owner-only status doğrulaması ve anonim erişimin reddedilmesi; gizli değer gösterilmemiştir. Üretim shell/manifest/service worker ve güncel statik paket HTTP 200 ve yerel paketle byte eşitliğiyle doğrulandı. Son dağıtım: `c3d44d30-abef-4a27-b02e-92239c8c612b`.

## Fiziksel/görsel test sınırı

Computer Use native pipe `os error 2` ile erişilemedi; tarayıcı envanteri boştu. Bu nedenle görsel çakışma, gerçek iOS klavyesi veya fiziksel iPhone bildirimi bu iterasyonda doğrulanmış değildir.

Kaynak düzeyindeki düzen matrisi: masaüstü 1280×720, 1366×768, 1440×900, 1920×1080, 2560×1440, 2560×1600; %90/100/105/110/115/125. Mobil 320/375/390/393/414/430px. Bunlar render/piksel testleri değildir.

Manuel test: çalışan 1.0 uygulamasını tepsiden Çıkış ile kapatıp proje klasöründe `npm run tauri dev` ile 1.1’i açın. Ana sayfa, Görevler/form, Çalışma Alanları, ACK AI, Notlar, Kısayollar, Abonelikler, Ayarlar/Telefon ekranlarını ve uzun metinleri ölçek/genişlik matrisinde kontrol edin. Telefonda uygulamayı kapatıp tekrar açın; Bugün/form, Gelenler, Çalışma, Abonelikler, Ayarlar/eşleştirme ve bildirim durumlarını kontrol edin. PC tamamen kapalıyken tekrarlayan görev ve ödeme bildirimi; bildirimden açma, erteleme ve iki yönde tamamlama ayrıca fiziksel test ister.

Başarısız otomatik test yoktur. Yeni Windows yükleyicisi kullanıcı manuel testi/onayı sonrasında ayrı bir adım olacaktır.
