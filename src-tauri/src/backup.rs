use std::io::Write;
use tauri_plugin_dialog::DialogExt;
const MAX_BACKUP_BYTES: usize = 10 * 1024 * 1024;
pub(crate) fn valid_envelope(content: &str) -> bool {
    if content.len() > MAX_BACKUP_BYTES || (content.contains("AIza") || crate::privacy::has_credentials(content)) {
        return false;
    }
    let Ok(value) = serde_json::from_str::<serde_json::Value>(content) else {
        return false;
    };
    value
        .get("formatVersion")
        .and_then(|value| value.as_u64())
        .is_some_and(|version| version == 1 || version == 2)
        && value.get("data").is_some_and(|value| value.is_object())
}
#[tauri::command]
pub async fn save_backup(
    app: tauri::AppHandle,
    content: String,
    file_name: String,
) -> Result<bool, String> {
    if !valid_envelope(&content)
        || !file_name.starts_with("ACKDeck-Backup-")
        || !file_name.ends_with(".json")
        || file_name.contains(['/', '\\'])
    {
        return Err("Yedek verileri geçersiz veya gizli anahtar içeriyor.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("JSON", &["json"])
            .set_file_name(file_name)
            .set_title("ACKDeck yedeğini kaydet")
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = file.into_path().map_err(|_| "Yedek konumu geçersiz.")?;
        if !path
            .extension()
            .is_some_and(|extension| extension.to_string_lossy().eq_ignore_ascii_case("json"))
        {
            return Err("Yedek için .json uzantılı bir dosya seçin.".into());
        }
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let temp = path.with_file_name(format!(
            ".ackdeck-backup-{}-{}.tmp",
            std::process::id(),
            unique
        ));
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|_| "Yedek dosyası kaydedilemedi.")?;
        if file
            .write_all(content.as_bytes())
            .and_then(|_| file.sync_all())
            .is_err()
        {
            drop(file);
            let _ = std::fs::remove_file(&temp);
            return Err("Yedek dosyası kaydedilemedi.".into());
        }
        drop(file);
        if std::fs::rename(&temp, &path).is_err() {
            let _ = std::fs::remove_file(temp);
            return Err("Yedek dosyası kaydedilemedi.".into());
        }
        Ok(true)
    })
    .await
    .map_err(|_| "Yedek işlemi tamamlanamadı.".to_string())?
}
#[tauri::command]
pub async fn choose_backup(app: tauri::AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("JSON", &["json"])
            .set_title("ACKDeck yedeğini seç")
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = file.into_path().map_err(|_| "Yedek konumu geçersiz.")?;
        let metadata = std::fs::metadata(&path).map_err(|_| "Yedek dosyası okunamadı.")?;
        if metadata.len() > MAX_BACKUP_BYTES as u64 {
            return Err("Yedek dosyası çok büyük.".into());
        }
        let content = std::fs::read_to_string(path).map_err(|_| "Yedek dosyası okunamadı.")?;
        if !valid_envelope(&content) {
            return Err(
                "Geçerli bir ACKDeck yedeği seçin. Gizli anahtar içeren yedekler kabul edilmez."
                    .into(),
            );
        }
        Ok(Some(content))
    })
    .await
    .map_err(|_| "Yedek dosyası seçilemedi.".to_string())?
}
#[tauri::command]
pub async fn save_auto_backup(
    app: tauri::AppHandle,
    content: String,
) -> Result<String, String> {
    if !valid_envelope(&content) {
        return Err("Yedek verileri geçersiz veya gizli anahtar içeriyor.".into());
    }
    use tauri::Manager;
    let base_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Uygulama veri dizinine erişilemedi.")?
        .join("auto-backups");

    std::fs::create_dir_all(&base_dir).map_err(|_| "Yedekleme dizini oluşturulamadı.")?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let file_name = format!("ACKDeck-AutoBackup-{}.json", now);
    let target_path = base_dir.join(&file_name);

    std::fs::write(&target_path, content.as_bytes())
        .map_err(|_| "Otomatik yedek dosyası yazılamadı.")?;

    // Rotate: keep at most 7 recent backups
    if let Ok(entries) = std::fs::read_dir(&base_dir) {
        let mut files: Vec<(std::path::PathBuf, std::time::SystemTime)> = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file()
                && path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|name| name.starts_with("ACKDeck-AutoBackup-") && name.ends_with(".json"))
            {
                let modified = entry.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
                files.push((path, modified));
            }
        }
        files.sort_by(|a, b| b.1.cmp(&a.1));
        for (old_path, _) in files.into_iter().skip(7) {
            let _ = std::fs::remove_file(old_path);
        }
    }

    Ok(file_name)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unknown_formats_and_secrets() {
        assert!(valid_envelope(r#"{"formatVersion":1,"data":{}}"#));
        assert!(valid_envelope(r#"{"formatVersion":2,"data":{}}"#));
        assert!(!valid_envelope(r#"{"formatVersion":3,"data":{}}"#));
        assert!(!valid_envelope(&format!(
            r#"{{"formatVersion":1,"data":{{"x":"{}"}}}}"#,
            ["AI", "za"].concat()
        )));
    }
}
