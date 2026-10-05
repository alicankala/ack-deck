# ACKDeck — Son UX düzenlemesi (2026-10-05)

Yeni ürün özelliği, veri modeli, depolama anahtarı, bağımlılık, Rust/Tauri değişikliği veya installer yok.

## Uygulanan düzenlemeler

- Menü: Günlük, Çalışma, Kişisel; Araçlar ayrı. Ayarlar alt solda. Tüm mevcut sayfalar korunur.
- Ayarlar: dört tutarlı açılır bölüm. Genel başlangıçta açık; Windows/tepsi, başlangıç sayfası, PC yenileme ve global tuş burada. Görünüm ekran ölçeği ve hava şehrini içerir. Bağlantılar Gemini/model ve Telefon'u içerir. Yedekleme mevcut doğrulama/onay/kurtarma akışını kullanır. Hakkında ve ağ açıklamaları ikincil açılır alanlardır.
- Sayfa başlıkları küçültüldü; yinelenen üst etiketler ve ACK AI panelindeki ikinci başlık kaldırıldı. Gerekli ağ, dosya gönderimi, hatırlatma ve veri güvenliği açıklamaları korundu.
- Ortak mantıksal sayfa/kart boşlukları ve kontrol yükseklikleri kullanılır. 1800px içerik sınırı, form sınırı, ekran tercihlerinin kalıcılığı ve palette ölçek izolasyonu korunur.
- Footer hover ve klavye odağında durur; düğmeye tıklama, Enter veya Space sonraki bilgiyi gösterir. Odak/hover kalkınca otomatik dönüş sürer. 30 dakika veri yenileme ve başarısız yenilemede son veri etiketi korunur.
- Günlük işlemler görünür kalır. Gemini anahtarını silme ikincil menüye taşındı; yıkıcı menü işlemleri ayrıldı. Mevcut kayıt silme/onay mekanizmaları korunur.
- Çalışma alanı bir grubu, proje bir klasörü, kısayol bir hedefi açtığını belirten kısa açıklamalar kullanır. Dashboard boş proje açıklaması düzeltildi.
- Araç çubukları ve onay alanları sarılır. Açılan işlem menüleri normal akışta tam satır kaplar; mutlak konumlandırma yok. Not/sohbet yerleşimleri kalan içerik genişliğine göre tek sütuna geçer. Uzun başlıklar sarılır, not arama alanı kenar boşluklarına sığar, bildirimler footer üstünde kalır. Menü kaydırması Ayarlar'ı görünür tutar.

## Denetim ve doğrulama

Kaynak/layout denetimi: Dashboard, Görevler, ACK AI ve sohbet geçmişi, Çalışma Alanları, Projeler, Kısayollar, Notlar, Gelenler, Abonelikler ve formu, Araçlar, Ayarlar ve alt bölümleri; ayrıca Arşiv/düzenleyici, QR, IP, Hız Testi, PC ve mevcut dialog sınırları.

Otomatik matris **yapısaldır; render veya piksel kontrolü değildir**:

- 1280×720, 1366×768, 1440×900, 1920×1080, 2560×1440, 2560×1600
- Her boyutta %90, %100, %105, %110, %115, %125 (36 kombinasyon)
- İçerik/form sınırı, not alanı için kalan genişlik, container kırılımları ve palette izolasyonu kontrol edilir.
- Footer testleri hover/focus, tıklama, otomatik dönüş, bağımsız veri yenileme, son veri, şehir değişimi ve cleanup davranışını çalıştırır.

Computer Use uygulama ve tarayıcı envanteri boş döndü. Gerçek pencere görüntüsü, taşma/piksel, klavye odağı ve iki monitör geçişi doğrulanmadı. Manuel olarak `npm run tauri dev` ile yukarıdaki boyut/ölçeklerde önemli ekranları, uzun kayıt başlıklarını, açık menü/formları, footer etkileşimini ve pencere kaydırmasını inceleyin.

Mobile veya paylaşılan form stilleri değiştirilmedi; mevcut mobile yapısal testleri çalıştırılır. Fiziksel telefon sonucu iddia edilmez.
