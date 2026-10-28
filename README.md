# ACKDeck

**Güncel sürüm: 1.8.0** · Uygulama kimliği: `com.alican.ackdeck` · Görsel marka işareti: **ACK**

**ACKDeck**, Windows masaüstü (**Tauri 2 + Rust + React + TypeScript**) ve mobil **PWA** (**Cloudflare Workers + D1 + Web Push**) olarak çalışan, yerel öncelikli kişisel çalışma ve yaşam merkezidir. Güncellemeler mevcut yerel kayıtları sıfırlamaz ve imzalı paketlerle (`latest.json` + `.sig`) doğrulanır.

---

## Öne Çıkan Özellikler

### Masaüstü Çalışma Merkezi
- **Ana Sayfa (Bugün):** Günün görevleri ve dersleri, il/ilçe bazlı **Namaz Vakitleri** geri sayımı, otomatik yenilenen **Yurt Yemek Listesi** (sabah/akşam menüsü ve bildirimleri) ve hızlı özet kartları.
- **Görevler & 3 Durumlu Ders Takibi:** Tarih, saat, öncelik ve hatırlatma destekli görevler; planlanan derslerin doğrudan **Görevler** listesinde yuvarlak durum butonuyla takibi (**1. tık:** *Çalışıldı ✓*, **2. tık:** *Çalışılmadı ✕*, **3. tık:** *Bekliyor ○*).
- **Aylık & Haftalık Plan:** Tekrarlanan ders programları, görevler ve hatırlatmalar için birleşik takvim görünümü.
- **Notlar & Satır Bazlı Otomatik Birleştirme:** Zengin içerikli yerel notlar, sabitleme, ek dosyalar, anlık arama ve çevrimdışı düzenlemelerde farklı satırlardaki değişiklikleri veri kaybı olmadan birleştiren **3 yönlü satır birleştirme (3-way line merge)** motoru.
- **Koleksiyon (Otomatik Afiş & Bilgi Çekmeli Medya Takibi):** Film, dizi, kitap ve oyun eklerken başlık yazıldığında afiş görseli, yıl, yönetmen/yazar/geliştirici ve bölüm/süre bilgisini otomatik getiren katalog araması — masaüstü ve mobil arasında **iki yönlü bulut eşitlemeli**.
- **Sınırsız Yerel Depolama Motoru:** Tarayıcı `localStorage` kotasını (~5–10 MB) aşan **IndexedDB + yerel atomik disk deposu (`unlimited-storage.v1.json`)** hibrit mimarisiyle yıllar boyu biriken binlerce uzun not ve koleksiyon kaydını senkron hızda taşır.
- **Abonelikler:** Aylık/yıllık aboneliklerin ödeme günü ve tutar takibi, yaklaşan ödeme bildirimleri ve isteğe bağlı açılıp kapanabilen özet görünümü.
- **Projeler, Çalışma Alanları & Araçlar:**
  - Kayıtlı proje klasörlerini doğrudan **File Explorer** veya **VS Code** içinde açma.
  - **Çalışma Alanları & Kısayollar:** Projeleri, yerel dosya/uygulamaları (`.exe`) ve web adreslerini tek tıkla birlikte başlatma.
  - **Dahili Araçlar:** Dosya Dönüştürücü, QR Kod Oluşturucu, IP Bilgisi, Cloudflare Hız Testi, gerçek zamanlı PC Sistem Durumu (CPU/RAM/disk/ağ) ve Arşiv.
- **Özel Pencere Deneyimi & Alt Bilgi Bandı (Footer Ticker):**
  - Çoklu ekran sürükleme ve çift tık büyütme/küçültme destekli çerçevesiz özel üst bar.
  - Alt bantta canlı **TCMB döviz kurları** (`USD`, `EUR`, `GBP`), **Gram Altın** (`GRA`), **BIST 100** (`XU100`), **Kripto** (`BTC`, `ETH`) ve saatlik **Open-Meteo hava durumu**.
  - Sistem tepsisine (tray) küçültme, Windows başlangıcında çalışma ve 10 saniyelik **Geri Al** koruması.

---

## ACK AI ve Gizlilik

- **Google Gemini Developer API:** Doğrudan resmi `https://generativelanguage.googleapis.com/v1beta` uç noktası kullanılır:
  - **Hızlı Model (`fast`):** Varsayılan `gemini-3.5-flash-lite`
  - **Güçlü Model (`powerful`):** Varsayılan `gemini-3.8-flash` *(zaman aşımı veya geçici sunucu hatasında otomatik olarak Hızlı modele yedeklenir)*
  - Model adları **Ayarlar → ACK AI → Model adlarını düzenle** bölümünden canlı yanıt testi yapılarak değiştirilebilir.
- **Tam Modül Farkındalığı:** ACK AI; görevler, notlar, projeler, abonelikler ve ders programlarının yanı sıra **haftalık ders çalışma durumlarını (`attended` / `skipped` / `pending`)** ve **Koleksiyon (`mediaItems`)** kayıtlarını okuyabilir; film/dizi/kitap/oyun önerisi yapabilir ve koleksiyona kayıt taslağı hazırlayabilir.
- **Anahtar Güvenliği:** Masaüstünde Gemini API anahtarı **Windows Credential Manager** üzerinde saklanır; kod deposuna, `.env` dosyasına, `localStorage`'a, yedeklere veya model bağlamına asla yazılmaz. İsteğe bağlı 7/24 Mobil ACK AI açıldığında ise bulutta yalnızca `PUSH_PRIVATE_KEY` ile türetilmiş **AES-GCM** şifreli kasada (`ai_secrets`) tutulur.
- **Onaylı İşlem Taslakları (`Function Calling`):** Görev, not, arşiv, koleksiyon ve haftalık ders programı oluşturma/düzenleme/silme, proje veya çalışma alanı açma ve hız testi işlemleri yalnızca sohbet içindeki tek kullanımlık **Onayla** kartıyla kullanıcı onayından sonra uygulanır.
- **Daraltılmış Bağlam & Ekler:** Yalnızca sorulan mesajla ilgili yerel kayıtlar daraltılarak modele veri olarak aktarılır. PNG, JPEG, WebP, PDF (8 MB'a kadar) ve UTF-8 TXT (128 KB'a kadar) dosyaları yalnızca gönderilen mesaja eklenir. Sohbet geçmişi yerel **IndexedDB** içinde tutulur.

---

## ACKDeck Mobile (PWA) ve Bulut Eşitleme

İsteğe bağlı **ACKDeck Mobile**, iOS ve Android ana ekranına eklenebilen gerçek mobil uygulama düzeninde bir **PWA** eşlikçisidir (**Cloudflare Worker + D1 + Web Push**):

- **Çift Yönlü Eşitleme (`Schema v5`) & Otomatik Satır Birleştirme:** Görevler, Notlar, Ders Programları, Ders Tamamlama Durumları (`studyAttendance`) ve Koleksiyon (`mediaItems`) kayıtları masaüstü ile mobil arasında iki yönlü eşitlenir; çevrimdışı not düzenlemeleri satır bazında otomatik birleştirilir.
- **Doğrudan Mobil ACK AI Sohbeti:** Telefondan soru sorup cevabı doğrudan telefonda okuyabileceğiniz tam teşekküllü mobil AI sohbeti — ister PC açıkken canlı köprü üzerinden sıfır kurulumla, ister şifreli bulut kasasıyla **PC kapalıyken 7/24** kesintisiz çalışır.
- **PC Kapalıyken Tam Web Push Bildirimleri:** Bilgisayar tamamen kapalıyken bile **Görev alarmları**, **Ders Programı hatırlatmaları**, **12:30 Yurt Yemek Menüsü**, **Abonelik ödeme günleri** ve **Namaz vakitleri** doğrudan telefona Web Push olarak düşer.
- **Gelenler (`Inbox`) & Komutlar:** Telefondan bilgisayara metin, bağlantı, sesli not, dosya/görsel veya AI taslağı gönderme; kayıtlı çalışma alanlarını uzaktan tetikleme.
- Kurulum ayrıntıları: [PHONE_SETUP.md](PHONE_SETUP.md).

---

## Yedekleme ve Kurtarma

- **Ayarlar → Veriler** üzerinden yerel JSON yedeği (100 MB'a kadar) oluşturulabilir ve doğrulamalı olarak geri yüklenebilir.
- Geri yükleme ve sürüm güncellemesi öncesinde mevcut yerel verilerin ve IndexedDB sohbetlerinin kurtarma kopyası alınır; olası bir hata anında önceki durum otomatik olarak geri yüklenir.

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
