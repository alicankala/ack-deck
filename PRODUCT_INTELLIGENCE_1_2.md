# ACKDeck 1.2.0 — final product intelligence

- Proje merkezi: stable ID ile görev, not, Gelen, çalışma alanı ve yerel dosya/kısayol referansları; sıradaki adım, checklist ilerlemesi ve ilgili aktiviteler.
- Görev checklist'i: düzenleme, sıralama ve tamamlama; mevcut recurring davranışı korunur. Basit şablonlar yeni görev/checklist oluşturur.
- Aktivite geçmişi: yalnız yerel, en fazla 1000 kayıt ve 90 gün; geçmişte kaydedilmemiş hareketler uydurulmaz.
- Gelenler: görev/yeni not/mevcut not/proje/arşiv işlemleri, işlendi durumu ve içerik türüne uygun menüler. Ses oynatma, durdurma, süre, yeniden başlatma ve kaydetme korunur. Ses AI'a yalnız açık kullanıcı gönderimiyle gider.
- Haftalık plan mevcut görev, recurrence, hatırlatma ve abonelik tarihlerinden türetilir. Bugün özeti, Devam Et ve haftayı toparlama aynı kayıtları kullanır.
- Akıllı yakalama: desteklenen Türkçe görev/not komutları yerelde çözümlenir; oluşturma öncesi taslak gösterilir. Mobil kompakt proje, checklist, plan, özet ve Gelen işleme içerir.
- ACK AI: ilgili gerçek kayıtlar ve sınırlı context; kayıtlara geri bağlantılar, nerede kalmıştım/haftalık özet. Notlardan görev, çoklu görev, proje sıradaki adımı ve planlanan işlem grupları mevcut onay sistemiyle uygulanabilir. Yazma işlemleri onay ister; toplu işlem kısmi başarısızlıkta yapılanları açıkça bildirir. Pending işlemler yedeklenmez. Arbitrary shell/path çalıştırma eklenmedi.

## Model tanısı

Hızlı modelin gerçek generateContent isteği ve güncel 18 tool bildirimi HTTP 200 verdi. Güçlü modelin mevcut kimliği metadata isteğinde HTTP 200 ve generateContent desteği döndürdü; ancak minimal üretim, farklı thinking/token ayarları ve Interactions denemeleri 90–180 saniyede yanıt vermedi. Model kimliği tahmin edilerek değiştirilmedi. Güçlü modelin üretim sorunu halen açık: gerçek gözlem zaman aşımıdır, kota veya internet hatası kanıtlanmadı. Timeout/erişim/kota/model/bağlantı hataları artık ayrılır; bağlantı testi yalnız metadata ile başarı bildirmez. Anahtarlar loglanmadı.

## Veri ve yayın

Schema 3; eski schema 1/2 istemcileriyle uyumlu metadata korunması. Additive 0004 migration yalnız projects tablosu ekler. Yerel path'ler, AI/activity geçmişi ve şablonlar cloud'a aktarılmaz. Checklist, mobilde gereken proje/not bağlantıları ve dosya metadata referansları mevcut sync/offline/conflict/tombstone hattındadır. JSON yedek activity/templates/bağlantıları kapsar; gerçek attachment binary dosyalarını ve secret/pending işlemleri kapsamaz. KV dosyalarının mevcut süre sınırı geçerlidir; masaüstündeki kaydedilmiş orijinal korunur.

Mevcut Worker/mobile 2026-10-07 tarihinde yayımlandı: `2ae258af-cc14-4fa6-a551-eadc7ad02415`. Kaynaklar, eşleşme, VAPID ve owner secret değiştirilmedi. Windows NSIS setup mevcut updater anahtarıyla imzalandı; Authenticode sertifikası yoktur.

## Doğrulama

Masaüstü build ve 175 test; mobil build ve 18 test; Worker type-check ve 15 test; Rust fmt/check ve 21 test başarılı (toplam 229). Release audit sıfır hata. Installer güncel frontend asset'ini içeriyor. Testler eski veri, bağlantı/checklist, recurrence/tarih/DST, activity/template, capture, backup, offline sync/tombstone, AI onay ve hata ayrımlarını kapsar.

Manuel kontrol: gerçek Windows profilinde upgrade ve updater; dar/geniş pencere ve AI/not editörü; gerçek telefonda eşleşme/offline tekrar bağlanma; ses oynatma/nota ekleme/isteğe bağlı AI gönderimi; mevcut projeler ve eski yedeğin kontrollü test profiline restore edilmesi. Bu fiziksel kontroller otomatik test sonucu olarak sunulmaz.

Bu iteration sonrası feature freeze: yalnız gerçek bug, görsel/UX, performans ve güvenlik düzeltmeleri.
