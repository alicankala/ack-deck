# ACKDeck 1.1 — Uygulama ve doğrulama

## Masaüstü renklerini geri alma — çalışma değişikliği, 7 Ekim

Kullanıcının isteğiyle masaüstünün 1.1.2 öncesindeki koyu mavi/gri renkleri geri alındı. App.css içindeki eski renkler aynı kaynak sürümünden geri getirildi; yeni yerleşim dosyasındaki kartlar da uyumlu mavi renk değişkenlerini kullanır. Yeni yerleşim, görev/abonelik düzenleme, tekrarlar ve sıralama korunur. Mobil kaynakları ve mobil yayın değiştirilmedi. Frontend build, ilgili 15 ölçek/yerleşim/palette/updater testi, kaynak denetimi ve diff kontrolü geçti. Görsel/gerçek cihaz kontrolü yapılamadı. Kullanıcı setup oluşturmanın işlerin sonunda kendi talebiyle yapılmasını istedi; başlayan derleme durduruldu, sürüm değişiklikleri geri alındı. Bu renk değişikliği için commit/push/release veya yeni setup oluşturulmadı.

## 1.1.2 — Masaüstü ve mobil düzenlemeleri, 7 Ekim

Mobil notların koyu gri/sıcak sarı paleti masaüstünün tüm sayfalarına uygulandı. Ana sayfada gerçek görev/proje/not sayıları, daha kısa metinler ve sağ sütunda hızlı işlemler bulunur. ACK AI başlangıç kartları ve görünür model seçimiyle düzenlendi. Masaüstü notların liste/yazı alanı büyütüldü; mobil aramanın görünür çift etiketi erişilebilir gizli etiket stiliyle düzeltildi.

Yeni görev düğmesi hızlı ekleme alanıyla bütünleştirildi. Normal/Önemli seçimi ve kart etiketleri kaldırıldı; eski verilerin priority alanı uyumluluk için korunur. Görev ve abonelik kartlarında tıklama/dokunma düzenleme açar; erteleme/silme üç nokta menüsündedir. Projeler ve masaüstü görevler sürükleme veya menüden taşınabilir. Mobil görev sırası IndexedDB'de cihaz tercihi olarak saklanır; kayıtların tamamlanma, tarih ve eşitleme sürümleri değişmez. İki cihazın özel sıralaması bağımsızdır.

Tekrar seçimi boş başlangıç/saat alanlarını bugün/09:00 ile doldurur. Başlangıç kullanıcı tarafından değiştirilebilir. Bitiş seçenekleri açılır bölüm yerine formda açık yer alır. Ortak scheduleDate yalnız görünümü/filtreyi takvim gününe göre hesaplar; eski günlük başlangıcını gecikmiş tek seferlik son tarih saymaz. Tamamlama sonrası gelecek occurrence ve erteleme korunur; bildirim kuyruğu, bulut teslim kaydı ve gerçek görevler sessizce değiştirilmez. Ayarlarda güncelleme denetimi aynı bölümde görünür; üstte denetim/hata barı oluşturmaz.

Doğrulama: iki frontend build, masaüstü 146, mobil 13, bulut 13, Rust 19 test; bulut type-check, cargo fmt --check, kaynak denetimi ve git diff --check. Windows 1.1.2 NSIS, aynı updater anahtarıyla imzalanır; uygulama/paket kimliği ve veri yolları korunur. Kullanıcı commit/push/release/mobil yayınını açıkça istedi. CUA envanteri boş olduğu için fiziksel görünüm, telefon klavyesi, sürükleme ve kurulu uygulamada gerçek güncelleme kurulumu doğrulanmış sayılmaz. Gerçek kullanıcı verisi/kurulumuna müdahale edilmez.

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
## Working copy: desktop polish and phone content flow (not published)

- Desktop keeps the restored blue/gray palette. Shared layout limits, balanced AI/Notes panes, consistent cards/forms/header actions, visible Settings sections and compact Archive details/form fields are implemented without replacing data stores.
- Mouse Back/Forward and Alt+Arrow/BrowserBack/Forward use ACKDeck page history. Focused editing, open dialogs, pending operations and unsaved quick-task/AI/key/shortcut drafts block incidental history navigation. Returning to a page never replays a create/start intent. Ctrl+K and the standalone global palette remain on their existing paths.
- Incoming media has explicit in-app audio controls (play/pause, seek/progress/duration and restart), image/PDF/text preview and secondary download. No automatic playback or Gemini upload. Recorder WebM duration is probed without playing.
- The existing Notes store accepts optional validated attachment references. Add-to-notes edits title/description, caches a permanent local copy and reloads notes after the download to preserve intervening sync edits. Binary files stay under managed `phone-attachments.v1` app data; no arbitrary path is returned or accepted. Cloud note edits retain desktop attachment references; only the existing title/content/timestamp schema is synchronized. Note attachments are currently available on the desktop that saved them, not transferred to other devices. Backups preserve references, as with existing linked archive files, rather than embedding file bytes; absent files show an explicit error.
- Supported incoming PNG/JPEG/WebP/PDF/TXT can be staged through the existing ACK AI attachment registry with its existing 8 MB / TXT 128 KB limits. Unsupported file/audio types expose no AI attachment action. Sending to Gemini still requires the user's Send action.
- Mobile separates Text, Link, Photo/File, Voice Note and ACK AI. Files require an explicit Send action and selected file/audio survives failure and page switching during the session. Synchronous guards prevent duplicate taps/recording prompts; attachment retries retain the same request ID, and a successful draft cannot resend accidentally. Send success stays visible on the card. Text failures keep their editor content; changing that content starts a fresh request identity.
- Existing Worker/D1/KV schema, pairing, 10 MB cap, retention, sync and push are unchanged. Production was not deployed; no commit, push, release or installer was created. Version stays 1.1.2.
- Validation: desktop build and 157 tests; mobile build and 15 tests; cloud type-check and 13 tests; Rust check, fmt and 20 tests passed. Native rendering, side-button hardware behavior, PDF/audio codecs and physical phone flows still require manual dev checks; automated checks do not establish pixel/overflow correctness. Vite retains the existing large-chunk warning.
## 1.1.3 — Windows paketi ve mobil yayın, 7 Ekim

Önceki yayın bekletme talebinden sonra kullanıcı tüm değişikliklerin commit/push, GitHub release, Windows setup ve mobil yayınının tamamlanmasını açıkça istedi. Masaüstü ile mobil koyu mavi/gri palet eşlendi; not listesi/düzenleyicisi, form ve navigasyon renkleri aynı değişkenleri kullanır. Mobil manifest ve theme-color da eşlendi. Paket, npm lockfile ve Rust/Tauri sürümleri 1.1.3; bağımlılıklar, updater anahtarı, uygulama kimliği, mevcut D1/KV ve bildirim yapılandırması korunur.

Mobil build/test sonrası mevcut Worker yayını güncellendi: `40b38c95-4b4d-4588-924c-a17630dd5d65`. Canlı HTML, service worker, manifest, JS ve CSS son build ile SHA-256 düzeyinde eşleşti; anonim API erişimi 401. Cloudflare kaynak/migration/anahtarları değiştirilmedi. PWA aynı adresten güncellenir: https://ack-deck-phone.ack-deck-cloud.workers.dev.

Windows NSIS setup aynı mevcut updater anahtarıyla oluşturuldu. Ed25519 updater imzası ve manifest/paket eşleşmesi doğrulandı; release EXE son `index-BPXUTGff.js` masaüstü dosyasını içerir. `ACKDeck_1.1.3_x64-setup.exe` 3.363.425 bayt; SHA-256 `8d2926dd7d0a1f2b35e8278edd196d97066d32ba1c9552dbb8a776e30264687b`. Windows Authenticode durumu NotSigned. EXE, EXE.sig ve latest.json GitHub updater için aynı build'den hazırlanmıştır.

Yayın doğrulamaları: masaüstü 157, mobil 15, bulut 13 ve Rust 20 test; iki frontend build, cloud type-check, cargo fmt/check --locked, kaynak yayın denetimi ve staged diff kontrolü. Gerçek kurulum/uygulama verisine dokunulmadı. Fiziksel görünüm, mouse yan tuşları, ses/PDF codec davranışı ve gerçek kurulumla veri sürekliliği otomatik testlerle doğrulanmış sayılmaz. Note dosyaları bu bilgisayarda kalır; bulut/yedek yalnız mevcut metin ve yerel ek referansı kurallarını kullanır.
