use serde::{Deserialize, Serialize};
use std::{fs, path::Path, sync::Mutex};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SavedTarget {
    pub id: String,
    pub kind: String,
    pub target: String,
    pub name: String,
}
pub struct TargetState(pub Mutex<()>);
fn registry(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|_| "Kısayol kayıtlarına erişilemiyor.")?
        .join("launch-targets.v1.json"))
}
fn read(app: &tauri::AppHandle) -> Result<Vec<SavedTarget>, String> {
    match fs::read(registry(app)?) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|_| "Kısayol kayıtları okunamadı; mevcut veriler korunuyor.".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
        Err(_) => Err("Kısayol kayıtlarına erişilemiyor.".into()),
    }
}
fn save(app: &tauri::AppHandle, target: SavedTarget) -> Result<SavedTarget, String> {
    let state = app.state::<TargetState>();
    let _lock = state.0.lock().map_err(|_| "Kısayol kaydedilemedi.")?;
    let mut items = read(app)?;
    items.push(target.clone());
    let path = registry(app)?;
    fs::create_dir_all(path.parent().ok_or("Kayıt konumu bulunamadı.")?)
        .map_err(|_| "Kısayol kaydedilemedi.")?;
    let bytes = serde_json::to_vec(&items).map_err(|_| "Kısayol kaydedilemedi.")?;
    let temp = path.with_extension("tmp");
    fs::write(&temp, bytes)
        .and_then(|_| fs::rename(temp, path))
        .map_err(|_| "Kısayol kaydedilemedi.")?;
    Ok(target)
}
fn id() -> String {
    format!(
        "target-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    )
}
fn safe_url(value: &str) -> bool {
    reqwest::Url::parse(value).is_ok_and(|url| {
        matches!(url.scheme(), "http" | "https")
            && url.host_str().is_some()
            && url.username().is_empty()
            && url.password().is_none()
    })
}
fn executable(path: &Path) -> bool {
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    path.is_absolute()
        && path.is_file()
        && path
            .extension()
            .is_some_and(|v| v.eq_ignore_ascii_case("exe"))
        && ![
            "cmd.exe",
            "powershell.exe",
            "pwsh.exe",
            "wscript.exe",
            "cscript.exe",
            "mshta.exe",
            "rundll32.exe",
            "reg.exe",
            "regsvr32.exe",
            "conhost.exe",
        ]
        .contains(&name.as_str())
}
#[tauri::command]
pub async fn choose_launch_target(
    app: tauri::AppHandle,
    kind: String,
) -> Result<Option<SavedTarget>, String> {
    if !matches!(kind.as_str(), "file" | "folder" | "application") {
        return Err("Kısayol türü geçersiz.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let picker = app.dialog().file().set_title(if kind == "application" {
            "Uygulama seç (.exe)"
        } else if kind == "folder" {
            "Klasör seç"
        } else {
            "Dosya seç"
        });
        let selected = if kind == "folder" {
            picker.blocking_pick_folder()
        } else if kind == "application" {
            picker
                .add_filter("Windows uygulaması", &["exe"])
                .blocking_pick_file()
        } else {
            picker.blocking_pick_file()
        };
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected
            .into_path()
            .map_err(|_| "Seçilen konum geçersiz.")?;
        let path = fs::canonicalize(path).map_err(|_| "Seçilen konum bulunamadı.")?;
        if kind == "application" && !executable(&path) {
            return Err(
                "Komut veya betik çalıştırıcıları eklenemez. Bir Windows uygulaması seçin.".into(),
            );
        }
        if kind == "folder" && !path.is_dir() || kind != "folder" && !path.is_file() {
            return Err("Seçilen öğenin türü geçersiz.".into());
        }
        if kind == "file"
            && path.extension().is_some_and(|v| {
                [
                    "exe", "bat", "cmd", "ps1", "vbs", "js", "lnk", "url", "hta", "com", "msi",
                ]
                .iter()
                .any(|e| v.eq_ignore_ascii_case(e))
            })
        {
            return Err("Bu öğe dosya kısayolu olarak eklenemez.".into());
        }
        let name = path
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string());
        save(
            &app,
            SavedTarget {
                id: id(),
                kind,
                target: path.to_string_lossy().to_string(),
                name,
            },
        )
        .map(Some)
    })
    .await
    .map_err(|_| "Seçim tamamlanamadı.".to_string())?
}
#[tauri::command]
pub fn save_url_target(app: tauri::AppHandle, url: String) -> Result<SavedTarget, String> {
    if url.len() > 4096 || !safe_url(&url) {
        return Err("Geçerli bir http veya https adresi girin.".into());
    }
    save(
        &app,
        SavedTarget {
            id: id(),
            kind: "url".into(),
            name: url.clone(),
            target: url,
        },
    )
}
#[tauri::command]
pub async fn open_saved_target(app: tauri::AppHandle, id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let item = read(&app)?
            .into_iter()
            .find(|item| item.id == id)
            .ok_or("Kayıtlı kısayol bulunamadı.")?;
        match item.kind.as_str() {
            "url" if safe_url(&item.target) => {
                tauri_plugin_opener::open_url(&item.target, None::<&str>)
                    .map_err(|_| "Web adresi açılamadı.".into())
            }
            "application" => {
                let path = Path::new(&item.target);
                if !executable(path) || fs::canonicalize(path).ok().as_deref() != Some(path) {
                    return Err("Kayıtlı uygulama bulunamadı veya konumu değişmiş.".into());
                }
                std::process::Command::new(path)
                    .spawn()
                    .map(|_| ())
                    .map_err(|_| "Uygulama açılamadı.".into())
            }
            "file" | "folder" => {
                let kind = if item.kind == "folder" {
                    crate::files::EntryKind::Folder
                } else {
                    crate::files::EntryKind::File
                };
                tauri::async_runtime::block_on(crate::files::access_file_entry(
                    item.target,
                    kind,
                    crate::files::FileAction::Open,
                ))
            }
            _ => Err("Kısayol türü geçersiz.".into()),
        }
    })
    .await
    .map_err(|_| "Kısayol açılamadı.".to_string())?
}
#[tauri::command]
pub async fn reveal_saved_target(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let item = read(&app)?
        .into_iter()
        .find(|item| item.id == id)
        .ok_or("Kayıtlı kısayol bulunamadı.")?;
    let kind = match item.kind.as_str() {
        "file" => crate::files::EntryKind::File,
        "folder" => crate::files::EntryKind::Folder,
        _ => return Err("Bu öğe Explorer'da gösterilemez.".into()),
    };
    crate::files::access_file_entry(item.target, kind, crate::files::FileAction::Reveal).await
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn urls_reject_commands_credentials_and_unknown_schemes() {
        assert!(safe_url("https://example.org/a"));
        assert!(safe_url("http://localhost"));
        for value in [
            "file:///C:/x",
            "javascript:alert(1)",
            "https://user:secret@example.org",
            "cmd.exe",
            "https://",
        ] {
            assert!(!safe_url(value));
        }
    }
    #[test]
    fn executable_requires_real_absolute_exe() {
        assert!(!executable(Path::new("cmd.exe")));
        assert!(!executable(Path::new("C:/missing.exe")));
    }
}
