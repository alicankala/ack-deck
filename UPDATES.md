# GitHub güncellemeleri

ACKDeck production sürümü açılışta `alicankala/ack-deck` reposunun en son release'indeki `latest.json` dosyasını denetler. Yeni sürümü otomatik indirir ve Tauri imzasını doğrular. “Şimdi Yeniden Başlat” seçilene kadar kurulum başlamaz; normal çıkış güncellemeyi kurmaz. Geliştirme modunda denetim yapılmaz.

Kurulum öncesi mevcut tam JSON yedek akışıyla kayıtlar, tercihler ve sohbet geçmişi alınır. Yedek native uygulama veri klasöründeki `pre-update-backups` altında diske yazılıp flush edilir. Yedekleme hatası kurulumu engeller. Gerçek bağlı dosyalar ve Credential Manager anahtarları mevcut yedek formatı gereği dahil edilmez. Kurulum NSIS passive modunda ilerler ve uygulama yeniden açılır.

## Release hazırlama

1.1.2 sürümünde Ayarlar > Güncellemeler içinden yapılan denetim ve indirme sonucu aynı kartta gösterilir. Denetim veya hata için üst bar açılmaz; kurulum öncesindeki yedek ve kullanıcı tarafından yeniden başlatma akışı korunur.

İlk updater destekli sürüm elle kurulmalıdır; eski kurulumda bu özellik yoktur. Sonraki release'ler otomatik indirilir. Sürüm numarası kurulu sürümden yüksek olmalıdır.

Güncelleme imza anahtarı repo dışında `%USERPROFILE%/.tauri/ack-deck-updater.key` konumundadır. Anahtarı güvenli biçimde yedekleyin ve değiştirmeyin; yalnız public karşılığı uygulama yapılandırmasındadır. Bu imza Windows Authenticode imzasından ayrıdır.

Manuel test onayı sonrasında PowerShell ile:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Join-Path $env:USERPROFILE '.tauri/ack-deck-updater.key'
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
npm run tauri build -- --bundles nsis
node scripts/prepare-update.mjs
Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY
Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

GitHub'da `v<version>` etiketiyle normal (draft/prerelease olmayan) release yayımlayın. `src-tauri/target/release/bundle/nsis` altındaki aynı build'e ait EXE, EXE.sig ve latest.json dosyalarını birlikte ekleyin. Hazırlama betiği yayın, tag veya push yapmaz.

İki gerçek sürüm arasında indirme, imza reddi, yedek hatasında kurulumun durması, yeniden başlatma ve veri sürekliliği fiziksel olarak doğrulanmalıdır. İlk updater destekli 1.1.0 setup hazırlanmış ve kullanıcı tarafından kurulmuştur. 1.1.1 yayın talebi ve kaynak kodun açılması için alınan açık onayla GitHub deposu public yapılmıştır; böylece kurulu 1.1.0 istemcisinin giriş yapmadan eriştiği mevcut updater adresi kullanılabilir. 1.0 ve daha eski kurulumlarda updater bulunmadığından ilk geçiş elle yapılır.
