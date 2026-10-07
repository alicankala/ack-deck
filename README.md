# ACKDeck

İlk kararlı sürüm: **1.0.0**. Uygulama kimliği `com.alican.ackdeck` korunur; güncelleme mevcut yerel kayıtları sıfırlamaz.

**Güncel sürüm: 1.2.0.** Final product intelligence, Windows setup ve mobil yayın ayrıntıları: [PRODUCT_INTELLIGENCE_1_2.md](PRODUCT_INTELLIGENCE_1_2.md).

Görsel marka işareti **ACK**, uygulama adı **ACKDeck**.

Windows için yerel, kişisel çalışma merkezi. Tauri 2, React ve TypeScript ile geliştirilir.

## Günlük kullanım

- Gerçek CPU/RAM/disk/ağ durumu; görevler ve tarih/saat/öncelik/hatırlatma.
- Projeler ve kayıtlı klasörleri Explorer veya VS Code'da açma.
- Çalışma Alanları: mevcut projeleri, seçilmiş dosya/klasör/uygulamaları ve http/https adreslerini birlikte açma. Bir öğenin hatası diğerlerini durdurmaz.
- Kısayollar: dosya, klasör, web adresi ve native seçiciden kaydedilmiş .exe. Eski Dosyalar kayıtları okunmaya devam eder; eski anahtar silinmez. Kayıt kaldırmak gerçek öğeyi silmez.
- Yerel notlar, QR, IP bilgisi ve arşiv; PC Durumu ve yardımcı araçlar ikincil konumdadır.
- Kullanıcı başlatınca çalışan Cloudflare hız testi ve son başarılı sonuç.
- **Ctrl+K:** yerel genel arama ve komut paleti. Ok tuşlarıyla seç, Enter ile çalıştır, Escape ile kapat.
- **Ctrl+Alt+Space (Ayarlar'dan değiştirilebilir):** başka uygulamadayken de küçük Hızlı Erişim penceresini aç/kapat. Sabitlenenler, en fazla 20 son kullanım referansı ve yerel eşleşme/yenilik/sıklık sıralaması kullanılır. Tepsi menüsünden de açılabilir.
- Paletten **Yeni Görev / Yeni Not:** ana pencereyi açmadan Enter ile kaydet. Not başlığı ilk satırdan gelir; Shift+Enter yeni satırdır. Tarih/hatırlatma gibi ayrıntılar tam görev ekranındadır.
- Ayarlar'da isteğe bağlı kapatınca tepsiye küçültme ve Windows autostart. İkisi de varsayılan kapalıdır. Autostart kurulu release sürümünde etkinleştirilebilir; başlangıçta tepsi seçeneği ayrıca açılır. Tepsi menüsündeki Çıkış uygulamayı tamamen kapatır.
- Ayarlar → Veriler: yerel JSON yedekleme ve doğrulama/onay sonrasında geri yükleme. Geri yükleme önce mevcut verinin kurtarma snapshot'ını oluşturur; başarısız kurtarma durumunda değişiklikleri engeller. Gerçek bağlı dosyalar ve Gemini anahtarı yedeklenmez.

Hatırlatmalar ACKDeck açıkken veya tepside çalışırken Windows bildirimi olarak hazırlanır. Tamamen kapalıyken bildirim gönderilmez; bekleyenler yeniden açılışta yüklenir. Aynı görev/zaman için gönderim kaydı tekrar bildirimi engeller. Windows'un bildirim ayarları gösterimi etkileyebilir; bildirime tıklayarak sayfaya gitme bu sürümde desteklenmez.

## ACK AI ve gizlilik

Gemini Developer API anahtarını **Ayarlar → Yapay Zeka → Kaydet** üzerinden girin. Anahtar Windows Credential Manager'da tutulur; repository, `.env`, localStorage, yedek, model bağlamı veya backend yanıtında bulunmaz. Kaydedilmiş anahtar frontend'e döndürülmez. Bağlantı testi yalnızca ilgili düğmeye basıldığında çalışır.

Hızlı/Güçlü model seçimi korunur. ACK AI yalnızca gönderilen mesaj için çalışır; ilgili görev/proje/not/arşiv/dosya metadata'sını yerel aramayla daraltır, gerektiğinde PC/IP/son hız testi/secret içermeyen tercihleri kullanır. İlgisiz genel sorulara kişisel kayıtlar eklenmez. Gemini function çağrıları yalnızca doğrulanan işlem taslaklarıdır; otomatik araç döngüsü yoktur. Çalışma alanları, kısayollar ve son/sabitlenen kullanım bilgileri de yalnızca ilgili istekte dar kapsamlı kaynak olarak eklenir. Sohbetler IndexedDB içinde yerel olarak saklanır; geçmişi arayabilir, yeniden adlandırabilir, açıp devam edebilir veya onayla silebilirsiniz. Eski oturumluk, hiç kaydedilmemiş sohbetler geri getirilemez. Gemini'ye her seferinde yalnızca sınırlı son konuşma bağlamı gönderilir; gizli özetleme isteği yapılmaz. Kesin sayfa komutları yerel çalışır. Palette'te ACK AI'a sor seçeneği yalnızca seçildikten sonra mesaj gönderir.

Görev, not ve arşiv oluşturma/düzenleme/silme, görev tamamlama/hatırlatma, kayıtlı proje/çalışma alanı/kısayol açma ve hız testi **sohbet içindeki açık kullanıcı onayından sonra** uygulanır. Onaylar tek kullanımlıktır ve beş dakika sonra sona erer; onay beklerken değişen kayıt üzerine yazılmaz. Gemini en fazla bir işlem taslağı döndürür; arama başına en fazla sekiz sonuç kullanılır. Uygulama içi sayfa geçişi onay gerektirmez. AI'nın genel shell, keyfi program/path, otomatik dosya okuma, dosya değiştirme veya Credential Manager erişimi yoktur. Dosya Ekle ile seçilen PNG/JPEG/WebP/PDF/UTF-8 TXT veya yapıştırılan görüntü yalnızca mesaj gönderildiğinde Gemini'ye iletilir (8 MB; UTF-8 TXT için 128 KB sınırı). Dosyanın içeriği sohbet geçmişine veya yedeğe yazılmaz. [Gemini dosya girdileri](https://ai.google.dev/gemini-api/docs/file-input-methods) kullanılır. [Gemini function calling API](https://ai.google.dev/api/generate-content#FunctionDeclaration) kullanılır.

Kayıtlar versioned localStorage anahtarlarıyla, tepsi/başlangıç tercihleri ve hatırlatma gönderim kaydı ise uygulamanın yerel yapılandırma dizininde saklanır. SQLite veya ACKDeck analytics eklenmemiştir. Telefon eşitlemesi ayrıca açık onayla etkinleştirilir. Dosya/arşiv kaydını kaldırmak gerçek dosyayı silmez. Görev, not, arşiv, kısayol ve çalışma alanı silme işlemleri 10 saniye boyunca Geri Al ile geri alınabilir. Sürüm 2 yedekleri sohbet geçmişini, çalışma alanlarını, kısayolları, sabitlemeleri, son kullanılanları ve global kısayolu kapsar; eski yedekler yeni kayıtları silmez. Native seçilmiş uygulama hedefleri güvenlik nedeniyle yedekten otomatik yetkilendirilmez; başka bilgisayarda uygulamayı yeniden seçin. Yedekler kişisel kayıt ve yollar içerebilir; güvenli bir yerde saklayın.

## Geliştirme ve release

Proje klasöründe:

```powershell
npm run tauri dev
npm run build
node --test tests/*.test.mjs
npm run tauri build
```

`src-tauri` içinde: `cargo fmt --check`, `cargo check --locked`, `cargo test --locked`.

Windows MSI/NSIS çıktıları `src-tauri/target/release/bundle/` altındadır; build uygulamayı kurmaz. Installer imzasızdır ve SmartScreen uyarısı gösterebilir. Gerçek tepsi/oturum açılışı/bildirim, klavye/ekran okuyucu/küçük pencere ve temiz kurulum akışları kurulu Windows uygulamasında ayrıca kontrol edilmelidir.

1.0.0 kurulum dosyaları: `bundle/nsis/ACKDeck_1.0.0_x64-setup.exe` ve `bundle/msi/ACKDeck_1.0.0_x64_tr-TR.msi`. Kurulum arayüzü Türkçedir. Önceki ACKDeck MSI yükseltme kimliği korunur; kurulum mevcut uygulamanın güncellemesidir.

## Telefon eşlikçisi

İsteğe bağlı ACKDeck Mobile, iPhone Ana Ekranına eklenen bir PWA’dır. Görev/not eşitleme, Gelenler, kayıtlı çalışma alanı isteği ve doğrudan Web Push kullanır. Cloudflare Worker/D1/KV kurulumu gerekir; bilgisayar kapalıyken bulut hatırlatmaları çalışır. Gemini anahtarı, sohbetler ve bilgisayar yolları buluta gönderilmez. Kurulum, Free plan sınırları ve yerel test komutları: [PHONE_SETUP.md](PHONE_SETUP.md).
