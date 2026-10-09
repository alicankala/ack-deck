use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PhoneConfig {
    pub url: String,
    pub enabled: bool,
}
fn credential() -> Result<Entry, String> {
    Entry::new("com.alican.ackdeck", "phone-owner")
        .map_err(|_| "Telefon kimlik bilgilerine erişilemedi.".into())
}
fn read_config(app: &tauri::AppHandle) -> Result<PhoneConfig, String> {
    let path = app
        .path()
        .app_config_dir()
        .map_err(|_| "Telefon ayarları okunamadı.")?
        .join("phone.v1.json");
    match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|_| "Telefon ayarları okunamadı. Mevcut ayarlar korunuyor.".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(PhoneConfig::default()),
        Err(_) => Err("Telefon ayarları okunamadı.".into()),
    }
}
fn valid_url(input: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(input) else {
        return false;
    };
    url.scheme() == "https"
        && url
            .host_str()
            .is_some_and(|host| host == "ack-deck-phone.ack-deck-cloud.workers.dev")
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url.path() == "/"
        && url.port().is_none()
}
#[tauri::command]
pub fn phone_status(app: tauri::AppHandle) -> Result<Value, String> {
    let config = read_config(&app)?;
    let configured = match credential()?.get_password() {
        Ok(_) => true,
        Err(KeyringError::NoEntry) => false,
        Err(_) => return Err("Telefon kimlik bilgilerine erişilemedi.".into()),
    };
    Ok(json!({"url":config.url,"enabled":config.enabled,"configured":configured}))
}
#[tauri::command]
pub fn phone_configure(app: tauri::AppHandle, url: String, enabled: bool) -> Result<(), String> {
    if !valid_url(&url) {
        return Err("Geçerli bir HTTPS workers.dev adresi girin.".into());
    }
    if enabled && credential()?.get_password().is_err() {
        return Err(
            "Önce PHONE_SETUP.md içindeki güvenli sahip anahtarı kurulumunu tamamlayın.".into(),
        );
    }
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|_| "Telefon ayarları kaydedilemedi.")?;
    std::fs::create_dir_all(&directory).map_err(|_| "Telefon ayarları kaydedilemedi.")?;
    let bytes = serde_json::to_vec(&PhoneConfig {
        url: url.trim_end_matches('/').to_string(),
        enabled,
    })
    .map_err(|_| "Telefon ayarları kaydedilemedi.")?;
    std::fs::write(directory.join("phone.v1.json"), bytes)
        .map_err(|_| "Telefon ayarları kaydedilemedi.".into())
}
fn route(operation: &str, body: &Value) -> Result<(&'static str, String), String> {
    let result = match operation {
        "status" => ("GET", "status".into()),
        "pair" => ("POST", "pair".into()),
        "devices" => ("GET", "devices".into()),
        "revoke" => ("POST", "revoke".into()),
        "mutate" => ("POST", "mutations".into()),
        "heartbeat" => ("POST", "heartbeat".into()),
        "workspaces" => ("POST", "workspaces".into()),
        "inbox" => ("GET", "inbox".into()),
        "commands" => ("GET", "commands".into()),
        "claim" => ("POST", "commands/claim".into()),
        "result" => ("POST", "commands/result".into()),
        "sync" => (
            "GET",
            format!(
                "sync?cursor={}",
                body.get("cursor")
                    .and_then(Value::as_u64)
                    .ok_or("Eşitleme bilgisi geçersiz.")?
            ),
        ),
        "handled" | "delete_inbox" => {
            let id = body
                .get("id")
                .and_then(Value::as_str)
                .ok_or("Gönderi bilgisi geçersiz.")?;
            if !safe_id(id) {
                return Err("Gönderi bilgisi geçersiz.".into());
            }
            (
                if operation == "handled" {
                    "PATCH"
                } else {
                    "DELETE"
                },
                format!("inbox/{id}"),
            )
        }
        _ => return Err("Telefon işlemi desteklenmiyor.".into()),
    };
    Ok(result)
}
fn safe_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_.-".contains(&byte))
}
pub(crate) async fn request(
    app: &tauri::AppHandle,
    method: &str,
    path: &str,
    body: Value,
) -> Result<reqwest::Response, String> {
    let config = read_config(app)?;
    if !config.enabled || !valid_url(&config.url) {
        return Err("Telefon entegrasyonu kapalı veya yapılandırılmamış.".into());
    }
    let secret = credential()?
        .get_password()
        .map_err(|_| "Telefon sahibi anahtarı ayarlanmamış.")?;
    let serialized = body.to_string();
    if serialized.len() > 65536 || (serialized.contains("AIza") || crate::privacy::unsafe_sync(&body)) || serialized.contains(&secret) {
        return Err("Telefon isteği çok büyük veya gizli bilgi içeriyor.".into());
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "Telefon bağlantısı hazırlanamadı.")?;
    let method =
        reqwest::Method::from_bytes(method.as_bytes()).map_err(|_| "Telefon isteği geçersiz.")?;
    let mut req = client
        .request(method.clone(), format!("{}/api/{path}", config.url))
        .header("X-ACKDeck-Schema", "4")
        .bearer_auth(&secret);
    if method != reqwest::Method::GET {
        req = req.json(&body);
    }
    let response = req
        .send()
        .await
        .map_err(|_| "Telefon sunucusuna ulaşılamadı.")?;
    if !response.status().is_success() {
        return Err(match response.status().as_u16() {
            401 | 403 => {
                "Telefon erişimi doğrulanamadı. Sahip anahtarı ve sunucu adresini kontrol edin."
            }
            409 => "Kayıt başka cihazda değişmiş veya istek daha önce işlenmiş.",
            410 => "Dosyanın saklama süresi dolmuş.",
            429 => "Ücretsiz hizmet sınırına ulaşıldı. Daha sonra tekrar deneyin.",
            _ => "Telefon işlemi tamamlanamadı.",
        }
        .into());
    }
    Ok(response)
}
#[tauri::command]
pub async fn phone_request(
    app: tauri::AppHandle,
    operation: String,
    body: Value,
) -> Result<Value, String> {
    let (method, path) = route(&operation, &body)?;
    let mut response = request(&app, method, &path, body).await?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Telefon yanıtı okunamadı.")?
    {
        if bytes.len() + chunk.len() > 2_000_000 {
            return Err("Telefon yanıtı çok büyük.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let value = String::from_utf8(bytes).map_err(|_| "Telefon yanıtı okunamadı.")?;
    let secret = credential()?
        .get_password()
        .map_err(|_| "Telefon kimlik bilgilerine erişilemedi.")?;
    if value.contains(&secret) || value.contains("AIza") {
        return Err("Telefon yanıtı güvenli biçimde işlenemedi.".into());
    }
    serde_json::from_str(&value).map_err(|_| "Telefon yanıtı okunamadı.".into())
}
#[tauri::command]
pub async fn phone_download(
    app: tauri::AppHandle,
    id: String,
    name: String,
) -> Result<bool, String> {
    if !safe_id(&id) || name.is_empty() || name.len() > 180 || name.contains(['/', '\\', ':']) {
        return Err("Gönderi bilgisi geçersiz.".into());
    }
    let mut response = request(&app, "GET", &format!("attachments/{id}"), Value::Null).await?;
    let mime = response
        .headers()
        .get("content-type")
        .and_then(|header| header.to_str().ok())
        .unwrap_or("")
        .to_string();
    if ![
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/heic",
        "application/pdf",
        "audio/mp4",
        "audio/mpeg",
        "audio/ogg",
        "audio/webm",
        "audio/wav",
        "text/plain",
    ]
    .contains(&mime.as_str())
    {
        return Err("Bu dosya türü indirilemez.".into());
    }
    let extension = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    if ![
        "png", "jpg", "jpeg", "webp", "heic", "pdf", "mp4", "m4a", "mp3", "ogg", "webm", "wav",
        "txt",
    ]
    .contains(&extension.as_str())
    {
        return Err("Dosya uzantısı desteklenmiyor.".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "Dosya indirilemedi.")? {
        if bytes.len() + chunk.len() > 10 * 1024 * 1024 {
            return Err("Dosya en fazla 10 MB olabilir.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    if bytes.starts_with(b"MZ") || bytes.starts_with(b"#!") {
        return Err("Çalıştırılabilir içerik indirilemez.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let Some(destination) = app
            .dialog()
            .file()
            .set_title("Telefon gelenini kaydet")
            .set_file_name(&name)
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = destination
            .into_path()
            .map_err(|_| "Dosya konumu geçersiz.")?;
        if !path
            .extension()
            .is_some_and(|value| value.eq_ignore_ascii_case(&extension))
        {
            return Err("Dosya uzantısını değiştirmeden kaydedin.".into());
        }
        std::fs::write(path, bytes).map_err(|_| "Dosya kaydedilemedi.")?;
        Ok(true)
    })
    .await
    .map_err(|_| "Dosya kaydedilemedi.".to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn owner_routes_and_urls_are_bounded() {
        assert!(valid_url("https://ack-deck-phone.ack-deck-cloud.workers.dev"));
        assert!(!valid_url("https://ack-deck-phone.example.workers.dev"));
        for url in [
            "http://example.workers.dev",
            "https://example.com",
            "https://user:secret@example.workers.dev",
            "https://example.workers.dev/path",
        ] {
            assert!(!valid_url(url));
        }
        for operation in [
            "execute_command",
            "open_path",
            "launch_executable_path",
            "run_powershell",
        ] {
            assert!(route(operation, &json!({})).is_err());
        }
        assert!(route("delete_inbox", &json!({"id":"../file"})).is_err());
    }
}
