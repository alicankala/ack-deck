# ACKDeck 1.1 — Uygulama ve doğrulama

Abonelikler, tekrarlayan görevler ve masaüstü/mobil sadeleştirmesi uygulanmıştır. ACKDeck adı, ACK işareti, `com.alican.ackdeck`, mevcut depolama anahtarları ve telefon eşleşmeleri korunmuştur. Yeni paket eklenmemiştir. Windows yükleyicisi oluşturulmamıştır; mevcut 1.0 kurulum dosyaları değiştirilmemiştir.

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
