# ACKDeck — Test Dosyaları ve Disk Alanı Disiplini (Testing & Storage Hygiene)

Bu belge, ACKDeck projesinde testlerin disk alanını şişirmesini kesin olarak önlemek amacıyla belirlenmiş katı kuralları içerir. Geçmişte yaşanan ve disk kullanımının kontrolsüzce onlarca gigabayta (40 GB) fırlamasına neden olan test ve derleme şişkinlikleri bu kurallarla engellenmiştir.

---

## 1. Temel Kurallar ve Yasaklar

1. **Gigabayt / Megabayt Ölçeğinde Dosya ve Fikstür Yasağı**:
   - Disk üzerinde büyük boyutlu dummy/sahte veriler, devasa tampon bellekler (buffer), video/ses yığınları veya tekrarlı test dosyaları **kesinlikle oluşturulamaz**.
   - Test girdileri doğrudan işlevselliği doğrulamaya odaklanmalı; minimum, hafif (mock, stream, bounded fixture) yapılar kullanılmalıdır.

2. **Bellek İçi (In-Memory) Yürütme Zorunluluğu**:
   - Tüm birim (unit) ve entegrasyon testleri `tests/helpers.mjs` üzerinden izole sanal bellek (Node.js `vm` ve in-memory `Map` depolama) üzerinde çalışmalıdır.
   - Fiziksel `localStorage` veya diske dosya yazılmamalıdır.

3. **Disk Şişmesini Önleme & Anında Temizlik**:
   - Zorunlu kota/sınır testleri (ör. 10 MB sınır kontrolleri) için fiziksel büyük dosyalar yerine sentetik akışlar (`mock stream` veya hesaplanmış `Uint8Array` uzunluğu) kullanılmalıdır.
   - Eğer herhangi bir geçici dosya oluşturulması kaçınılmaz olursa, test tamamlanır tamamlanmaz (`teardown` / `afterEach` / `afterAll` bloklarında) dosya anında silinmelidir.

4. **Kullanıcıya Rapor Verme Şartı**:
   - Gerçekten büyük boyutlu bir dosya testi veya stres testi yapılması gerekiyorsa, **kullanıcıya önceden açıkça rapor verilip onay alınmadan asla başlatılamaz**.

5. **Derleme Hedefleri ve Önbellek Denetimi**:
   - `src-tauri/target/`, `.vite/` gibi derleme çıktıları testler sırasında kontrolsüzce büyütülmemelidir.
   - Gereksiz/tekrar eden derleme komutları çalıştırılmamalıdır.

---

## 2. Test Mimarisi Özeti
- **Kök Testler (`tests/`):** Node.js yerleşik `--test` çalıştırıcısı ile saf bellek içi mock'lar.
- **Mobil Testler (`mobile/tests/`):** React/Vite/PWA bileşen ve senkronizasyon kontrolleri, mock DOM ve izole bellek.
- **Bulut Testler (`cloud/tests/`):** Miniflare v4 ile bellek içi sanal D1 ve KV veritabanı.

Her test süiti birkaç yüz milisaniye içinde, sıfır kalıcı disk izi bırakarak tamamlanmalıdır.
