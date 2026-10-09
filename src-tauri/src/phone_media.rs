use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use tauri::Manager;

const MAX_BYTES: usize = 10 * 1024 * 1024;
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Media {
    pub id: String,
    pub name: String,
    pub mime: String,
    pub size: usize,
    pub base64: String,
}
pub(crate) fn valid_cache_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
}
fn main_only(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Dosya yalnızca ana uygulamada açılabilir.".into())
    }
}
fn valid_file(name: &str, mime: &str, bytes: &[u8]) -> bool {
    if name.is_empty()
        || name.len() > 720
        || name.chars().count() > 180
        || name
            .chars()
            .any(|c| c.is_control() || "\\/<>:\"|?*".contains(c))
        || bytes.is_empty()
        || bytes.len() > MAX_BYTES
    {
        return false;
    }
    let ext = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match mime {
        "image/png" => ext == "png" && bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" => {
            ["jpg", "jpeg"].contains(&ext.as_str()) && bytes.starts_with(&[255, 216, 255])
        }
        "image/webp" => {
            ext == "webp" && bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP")
        }
        "image/heic" => ext == "heic" && bytes.get(4..8) == Some(b"ftyp"),
        "application/pdf" => ext == "pdf" && bytes.starts_with(b"%PDF-"),
        "audio/mp4" => ["mp4", "m4a"].contains(&ext.as_str()) && bytes.get(4..8) == Some(b"ftyp"),
        "audio/mpeg" => {
            ext == "mp3"
                && (bytes.starts_with(b"ID3")
                    || bytes.len() >= 2 && bytes[0] == 255 && bytes[1] & 224 == 224)
        }
        "audio/ogg" => ext == "ogg" && bytes.starts_with(b"OggS"),
        "audio/webm" => ext == "webm" && bytes.starts_with(&[26, 69, 223, 163]),
        "audio/wav" => {
            ext == "wav" && bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WAVE")
        }
        "text/plain" => {
            ext == "txt"
                && !bytes.contains(&0)
                && !bytes.starts_with(b"MZ")
                && !bytes.starts_with(b"#!")
                && std::str::from_utf8(bytes).is_ok()
        }
        _ => false,
    }
}
fn cache_path(app: &tauri::AppHandle, id: &str) -> Result<std::path::PathBuf, String> {
    if !valid_cache_id(id) {
        return Err("Dosya kimliği geçersiz.".into());
    }
    if let Some(value) = id.strip_prefix("pb_") {
        let (token, index) = value.split_once('_').ok_or("Dosya kimliği geçersiz.")?;
        if token.len() != 32
            || !token.bytes().all(|b| b.is_ascii_hexdigit())
            || index.is_empty()
            || !index.bytes().all(|b| b.is_ascii_digit())
        {
            return Err("Dosya kimliği geçersiz.".into());
        }
        return Ok(app
            .path()
            .app_data_dir()
            .map_err(|_| "Dosya alanı açılamadı.")?
            .join("restored-backups.v1")
            .join(token)
            .join("media")
            .join(format!("{id}.json")));
    }
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|_| "Dosya alanı açılamadı.")?
        .join("phone-attachments.v1")
        .join(format!("{id}.json")))
}
pub(crate) fn valid_media(media: &Media) -> bool {
    let Ok(decoded) = STANDARD.decode(&media.base64) else {
        return false;
    };
    valid_cache_id(&media.id)
        && media.size == decoded.len()
        && valid_file(&media.name, &media.mime, &decoded)
}
pub(crate) fn safe_media(media: &Media) -> bool {
    if !valid_media(media) {
        return false;
    }
    let Ok(decoded) = STANDARD.decode(&media.base64) else {
        return false;
    };
    let text = String::from_utf8_lossy(&decoded);
    !text.contains("AIza") && !crate::privacy::has_credentials(&text)
}
pub(crate) fn read_cached(app: &tauri::AppHandle, id: &str) -> Result<Media, String> {
    let mut bytes = Vec::new();
    let file = std::fs::File::open(cache_path(app, id)?)
        .map_err(|_| "Dosya bu bilgisayarda bulunamadı. Gelenler'den yeniden ekleyebilirsiniz.")?;
    if file.metadata().map_err(|_| "Dosya okunamadı.")?.len() > (MAX_BYTES * 4 / 3 + 4096) as u64 {
        return Err("Kayıtlı dosya çok büyük.".into());
    }
    file.take((MAX_BYTES * 4 / 3 + 4096) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| "Dosya okunamadı.")?;
    let media: Media = serde_json::from_slice(&bytes).map_err(|_| "Kayıtlı dosya okunamadı.")?;
    let decoded = STANDARD
        .decode(&media.base64)
        .map_err(|_| "Kayıtlı dosya geçersiz.")?;
    if media.id != id
        || media.size != decoded.len()
        || !valid_file(&media.name, &media.mime, &decoded)
    {
        return Err("Kayıtlı dosya geçersiz.".into());
    }
    Ok(media)
}
#[tauri::command]
pub fn phone_read_attachment(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: String,
) -> Result<Media, String> {
    main_only(&window)?;
    read_cached(&app, &id)
}
#[tauri::command]
pub async fn phone_cache_attachment(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: String,
    name: String,
) -> Result<serde_json::Value, String> {
    main_only(&window)?;
    let path = cache_path(&app, &id)?;
    let media = if path.exists() {
        read_cached(&app, &id)?
    } else {
        let mut response = super::phone::request(
            &app,
            "GET",
            &format!("attachments/{id}"),
            serde_json::Value::Null,
        )
        .await?;
        let mime = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| "Dosya alınamadı.")? {
            if bytes.len() + chunk.len() > MAX_BYTES {
                return Err("Dosya en fazla 10 MB olabilir.".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        if !valid_file(&name, &mime, &bytes) {
            return Err("Dosya türü veya içeriği desteklenmiyor.".into());
        }
        let media = Media {
            id,
            name,
            mime,
            size: bytes.len(),
            base64: STANDARD.encode(bytes),
        };
        let parent = path.parent().ok_or("Dosya alanı açılamadı.")?;
        std::fs::create_dir_all(parent).map_err(|_| "Dosya kaydedilemedi.")?;
        let temp = parent.join(format!(
            "{}.{}.tmp",
            media.id,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| "Dosya kaydedilemedi.")?
                .as_nanos()
        ));
        let result = (|| -> Result<(), String> {
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temp)
                .map_err(|_| "Dosya kaydedilemedi.")?;
            file.write_all(&serde_json::to_vec(&media).map_err(|_| "Dosya kaydedilemedi.")?)
                .map_err(|_| "Dosya kaydedilemedi.")?;
            file.sync_all().map_err(|_| "Dosya kaydedilemedi.")?;
            std::fs::rename(&temp, &path).map_err(|_| "Dosya kaydedilemedi.")?;
            Ok(())
        })();
        if result.is_err() {
            let _ = std::fs::remove_file(&temp);
            // Another preview may have finished caching the same immutable inbox id.
            if !path.exists() {
                result?;
            }
            read_cached(&app, &media.id)?;
        }
        media
    };
    Ok(serde_json::json!({"id":media.id,"name":media.name,"mime":media.mime,"size":media.size}))
}
#[tauri::command]
pub fn phone_ai_attachment(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: String,
) -> Result<super::attachments::AttachmentInfo, String> {
    main_only(&window)?;
    let media = read_cached(&app, &id)?;
    let bytes = STANDARD
        .decode(&media.base64)
        .map_err(|_| "Dosya okunamadı.")?;
    super::attachments::register(&app, media.name, media.mime, bytes)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn media_blocks_paths_spoofing_and_oversize() {
        for id in ["..", ".", "../note", "C:\\file", "a/b", ""] {
            assert!(!valid_cache_id(id));
        }
        assert!(valid_cache_id("sent_123-456"));
        assert!(valid_file("ses.ogg", "audio/ogg", b"OggSvoice"));
        assert!(valid_file(
            "resim.png",
            "image/png",
            b"\x89PNG\r\n\x1a\nimage"
        ));
        assert!(!valid_file("ses.exe", "audio/ogg", b"OggSvoice"));
        assert!(!valid_file("ses.ogg", "audio/ogg", b"MZexe"));
        assert!(!valid_file("../ses.ogg", "audio/ogg", b"OggSvoice"));
        assert!(!valid_file("ses.ogg", "audio/ogg", &vec![0; MAX_BYTES + 1]));
        assert!(!valid_file("ses.ogg", "audio/ogg", b""));
    }
}
