use std::{io::Write, time::Duration};
use tauri::{Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct UpdateState(tokio::sync::Mutex<Option<(Update, Vec<u8>)>>);

fn main_only(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Bu işlem ana pencereden yapılabilir.".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn check_update(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, UpdateState>,
) -> Result<Option<String>, String> {
    main_only(&window)?;
    if cfg!(debug_assertions) {
        return Ok(None);
    }
    let mut pending = state.0.lock().await;
    if let Some((update, _)) = pending.as_ref() {
        return Ok(Some(update.version.clone()));
    }
    let updater = app
        .updater_builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|_| "Güncelleme denetimi başlatılamadı.")?;
    let Some(update) = updater
        .check()
        .await
        .map_err(|_| "GitHub güncellemesi denetlenemedi. Daha sonra tekrar deneyin.")?
    else {
        return Ok(None);
    };
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|_| "Güncelleme indirilemedi veya imzası doğrulanamadı.")?;
    let version = update.version.clone();
    *pending = Some((update, bytes));
    Ok(Some(version))
}

fn write_backup(directory: &std::path::Path, content: &str) -> Result<(), String> {
    if !crate::backup::valid_envelope(content) {
        return Err("Güncelleme öncesi yedek geçersiz. Kurulum durduruldu.".into());
    }
    std::fs::create_dir_all(directory)
        .map_err(|_| "Yedek klasörü oluşturulamadı. Kurulum durduruldu.")?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let path = directory.join(format!("ACKDeck-Backup-pre-update-{stamp}.json"));
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|_| "Güncelleme yedeği kaydedilemedi. Kurulum durduruldu.")?;
    file.write_all(content.as_bytes())
        .and_then(|_| file.sync_all())
        .map_err(|_| "Güncelleme yedeği tamamlanamadı. Kurulum durduruldu.".to_string())
}

#[tauri::command]
pub async fn install_update(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: State<'_, UpdateState>,
    content: String,
) -> Result<(), String> {
    main_only(&window)?;
    let mut pending = state.0.lock().await;
    let Some((update, bytes)) = pending.as_ref() else {
        return Err("İndirilmiş güncelleme bulunamadı.".into());
    };
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|_| "Yedek konumu bulunamadı.")?
        .join("pre-update-backups");
    write_backup(&directory, &content)?;
    update
        .install(bytes)
        .map_err(|_| "Güncelleme kurulamadı. Yedek korundu; tekrar deneyin.".to_string())?;
    *pending = None;
    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backup_failure_blocks_installation() {
        let root = std::env::temp_dir().join(format!("ackdeck-update-test-{}", std::process::id()));
        assert!(write_backup(&root, "invalid").is_err());
        assert!(!root.exists());
        let content = r#"{"formatVersion":2,"data":{}}"#;
        write_backup(&root, content).unwrap();
        let files: Vec<_> = std::fs::read_dir(&root).unwrap().collect();
        assert_eq!(files.len(), 1);
        assert_eq!(
            std::fs::read_to_string(files[0].as_ref().unwrap().path()).unwrap(),
            content
        );
        assert!(write_backup(&files[0].as_ref().unwrap().path(), content).is_err());
        std::fs::remove_file(files[0].as_ref().unwrap().path()).unwrap();
        std::fs::remove_dir(root).unwrap();
    }
}
