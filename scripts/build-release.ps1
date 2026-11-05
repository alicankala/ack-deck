$env:TAURI_SIGNING_PRIVATE_KEY = Join-Path $env:USERPROFILE '.tauri/ack-deck-updater.key'
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
npm run tauri build
