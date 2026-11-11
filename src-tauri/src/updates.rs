use std::{
    io::Write,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

const UPDATE_PROGRESS_EVENT: &str = "ack-update-progress";

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgressEvent {
    pub version: String,
    pub phase: &'static str,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub percent: Option<u8>,
}

fn calculate_progress_percent(downloaded: u64, total: Option<u64>) -> Option<u8> {
    let total = total.filter(|&value| value > 0)?;
    let pct = downloaded.saturating_mul(100) / total;
    Some(pct.min(100) as u8)
}

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
    let version = update.version.clone();
    let _ = window.emit(
        UPDATE_PROGRESS_EVENT,
        UpdateProgressEvent {
            version: version.clone(),
            phase: "started",
            downloaded_bytes: 0,
            total_bytes: None,
            percent: None,
        },
    );

    let tracker = Arc::new(Mutex::new((0_u64, Option::<u64>::None, Option::<u8>::None, Instant::now())));
    let chunk_tracker = Arc::clone(&tracker);
    let chunk_window = window.clone();
    let chunk_version = version.clone();

    let finish_tracker = Arc::clone(&tracker);
    let finish_window = window.clone();
    let finish_version = version.clone();

    let bytes = update
        .download(
            move |chunk_length, content_length| {
                if let Ok(mut guard) = chunk_tracker.lock() {
                    guard.0 = guard.0.saturating_add(chunk_length as u64);
                    if content_length.is_some() {
                        guard.1 = content_length;
                    }
                    let downloaded = guard.0;
                    let total = guard.1;
                    let percent = calculate_progress_percent(downloaded, total);
                    let completed = total.is_some_and(|t| t > 0 && downloaded >= t);
                    let should_emit = percent != guard.2
                        || completed
                        || guard.3.elapsed() >= Duration::from_millis(120);
                    if should_emit {
                        guard.2 = percent;
                        guard.3 = Instant::now();
                        let _ = chunk_window.emit(
                            UPDATE_PROGRESS_EVENT,
                            UpdateProgressEvent {
                                version: chunk_version.clone(),
                                phase: "downloading",
                                downloaded_bytes: downloaded,
                                total_bytes: total,
                                percent,
                            },
                        );
                    }
                }
            },
            move || {
                if let Ok(guard) = finish_tracker.lock() {
                    let downloaded = guard.0;
                    let total = guard.1.or((downloaded > 0).then_some(downloaded));
                    let _ = finish_window.emit(
                        UPDATE_PROGRESS_EVENT,
                        UpdateProgressEvent {
                            version: finish_version.clone(),
                            phase: "verifying",
                            downloaded_bytes: downloaded,
                            total_bytes: total,
                            percent: Some(100),
                        },
                    );
                }
            },
        )
        .await
        .map_err(|_| "Güncelleme indirilemedi veya imzası doğrulanamadı.")?;

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

    #[test]
    fn progress_percent_calculates_safely() {
        assert_eq!(calculate_progress_percent(0, None), None);
        assert_eq!(calculate_progress_percent(1024, Some(0)), None);
        assert_eq!(calculate_progress_percent(500, Some(1000)), Some(50));
        assert_eq!(calculate_progress_percent(1500, Some(1000)), Some(100));
    }
}
