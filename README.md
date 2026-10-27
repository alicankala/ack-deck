# ACKDeck

**Güncel sürüm: 1.7.6** · Uygulama kimliği: `com.alican.ackdeck` · Görsel marka işareti: **ACK**

**ACKDeck**, Windows masaüstü (**Tauri 2 + Rust + React + TypeScript**) ve mobil **PWA** (**Cloudflare Workers + D1 + Web Push**) olarak çalışan, yerel öncelikli kişisel çalışma ve yaşam merkezidir. Güncellemeler mevcut yerel kayıtları sıfırlamaz ve imzalı paketlerle (`latest.json` + `.sig`) doğrulanır.

---

## Öne Çıkan Özellikler

### Masaüstü Çalışma Merkezi
- **Ana Sayfa (Bugün):** Günün görevleri ve dersleri, il/ilçe bazlı **Namaz Vakitleri** geri sayımı, otomatik yenilenen **Yurt Yemek Listesi** (sabah/akşam menüsü ve bildirimleri) ve hızlı özet kartları.
- **Görevler & 3 Durumlu Ders Takibi:** Tarih, saat, öncelik ve hatırlatma destekli görevler; planlanan derslerin doğrudan **Görevler** listesinde yuvarlak durum butonuyla takibi (**1. tık:** *Çalışıldı ✓*, **2. tık:** *Çalışılmadı ✕*, **3. tık:** *Bekliyor ○*).
- **Aylık & Haftalık Plan:** Tekrarlanan ders programları, görevler ve hatırlatmalar için birleşik takvim görünümü.
- **Notlar:** Zengin içerikli yerel notlar, sabitleme, ek dosyalar ve anlık arama.
- **Günlük (Medya Takibi):** Film, dizi, kitap ve oyun takibi (durum, puan, değerlendirme notları) — masaüstü ve mobil arasında **iki yönlü bulut eşitlemeli**.
- **Abonelikler:** Aylık/yıllık aboneliklerin ödeme günü ve tutar takibi, yaklaşan ödeme bildirimleri ve isteğe bağlı açılıp kapanabilen özet görünümü.
- **Projeler, Çalışma Alanları & Araçlar:**
  - Kayıtlı proje klasörlerini doğrudan **File Explorer** veya **VS Code** içinde açma.
  - **Çalışma Alanları & Kısayollar:** Projeleri, yerel dosya/uygulamaları (`.exe`) ve web adreslerini tek tıkla birlikte başlatma.
  - **Dahili Araçlar:** Dosya Dönüştürücü, QR Kod Oluşturucu, IP Bilgisi, Cloudflare Hız Testi, gerçek zamanlı PC Sistem Durumu (CPU/RAM/disk/ağ) ve Arşiv.
- **Özel Pencere Deneyimi & Alt Bilgi Bandı (Footer Ticker):**
  - Çoklu ekran sürükleme ve çift tık büyütme/küçültme destekli çerçevesiz özel üst bar.
  - Alt bantta canlı **TCMB döviz kurları** (`USD`, `EUR`, `GBP`), **Gram Altın** (`GRA`), **BIST 100** (`XU100`), **Kripto** (`BTC`, `ETH`) ve saatlik **Open-Meteo hava durumu**.
- **Komut Paleti & Hızlı Erişim:**
  - **`Ctrl+K`:** Uygulama içi genel arama ve komut paleti.
  - **`Ctrl+Alt+Space`** *(Ayarlar'dan değiştirilebilir)*: Başka bir uygulamadayken açılan mini **Hızlı Erişim** penceresi ile ana pencereyi açmadan görev/not ekleme ve sabitlenenleri çalıştırma.
  - Sistem tepsisine (tray) küçültme, Windows başlangıcında çalışma ve 10 saniyelik **Geri Al** koruması.

---

## ACK AI ve Gizlilik

- **Google Gemini Developer API:** Doğrudan resmi `https://generativelanguage.googleapis.com/v1beta` uç noktası kullanılır:
  - **Hızlı Model (`fast`):** Varsayılan `gemini-3.5-flash-lite`
  - **Güçlü Model (`powerful`):** Varsayılan `gemini-3.8-flash` *(zaman aşımı veya geçici sunucu hatasında otomatik olarak Hızlı modele yedeklenir)*
  - Model adları **Ayarlar → ACK AI → Model adlarını düzenle** bölümünden canlı yanıt testi yapılarak değiştirilebilir.
- **Anahtar Güvenliği:** Gemini API anahtarı yalnızca **Windows Credential Manager** üzerinde saklanır; kod deposuna, `.env` dosyasına, `localStorage`'a, yedeklere, model bağlamına veya buluta asla yazılmaz.
- **Onaylı İşlem Taslakları (`Function Calling`):** Görev, not, arşiv ve haftalık ders programı oluşturma/düzenleme/silme, proje veya çalışma alanı açma ve hız testi işlemleri yalnızca sohbet içindeki tek kullanımlık **Onayla** kartıyla kullanıcı onayından sonra uygulanır.
- **Daraltılmış Bağlam & Ekler:** Yalnızca sorulan mesajla ilgili yerel kayıtlar daraltılarak modele veri olarak aktarılır. PNG, JPEG, WebP, PDF (8 MB'a kadar) ve UTF-8 TXT (128 KB'a kadar) dosyaları yalnızca gönderilen mesaja eklenir. Sohbet geçmişi yerel **IndexedDB** içinde tutulur.

---

## ACKDeck Mobile (PWA) ve Bulut Eşitleme

İsteğe bağlı **ACKDeck Mobile**, iOS ve Android ana ekranına eklenebilen gerçek mobil uygulama düzeninde bir **PWA** eşlikçisidir (**Cloudflare Worker + D1 + Web Push**):

- **Çift Yönlü Eşitleme (`Schema v5`):** Görevler, Notlar, Ders Programları, Ders Tamamlama Durumları (`studyAttendance`) ve Günlük (`mediaItems`) kayıtları masaüstü ile mobil arasında iki yönlü eşitlenir.
- **Gelenler (`Inbox`) & Komutlar:** Telefondan bilgisayara metin, bağlantı, dosya/görsel veya AI taslağı gönderme; kayıtlı çalışma alanlarını uzaktan tetikleme.
- **Mobil Ana Sayfa Kartları:** Canlı Hava Durumu, Namaz Vakitleri, Yurt Yemek Listesi ve bilgisayar kapalıyken bile çalışan doğrudan **Web Push** hatırlatmaları.
- Gemini API anahtarı, yerel sohbet geçmişi ve bilgisayar dosya yolları buluta gönderilmez. Kurulum ayrıntıları: [PHONE_SETUP.md](PHONE_SETUP.md).

---

## Yedekleme ve Kurtarma

- **Ayarlar → Veriler** üzerinden yerel JSON yedeği oluşturulabilir ve doğrulamalı olarak geri yüklenebilir.
- Geri yükleme öncesinde mevcut yerel verilerin ve IndexedDB sohbetlerinin kurtarma kopyası alınır; olası bir hata anında önceki durum otomatik olarak geri yüklenir.

---

## Geliştirme, Test ve Derleme

```powershell
# Masaüstü geliştirme ve üretim derlemesi
npm run tauri dev
npm run build
node --test tests/core.test.mjs
node scripts/release-audit.mjs

# Rust birim testleri (src-tauri içinde)
cd src-tauri
cargo test

# Mobil PWA ve Cloudflare Worker testleri
cd ../mobile && npm run build && npm test
cd ../cloud && npm test

# Windows kurulum paketleri (NSIS .exe ve MSI)
cd ..
npx tauri build
```

Kurulum çıktıları `src-tauri/target/release/bundle/nsis/` ve `src-tauri/target/release/bundle/msi/` altında üretilir.
