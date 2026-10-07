use serde::{Deserialize, Serialize};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum EntryKind {
    File,
    Folder,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReference {
    path: String,
    kind: EntryKind,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    path: String,
    file_name: String,
    kind: EntryKind,
    extension: Option<String>,
    size_bytes: Option<u64>,
    modified_at: Option<u64>,
}

#[derive(Serialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
enum FileState {
    Available,
    Missing,
    Unavailable,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStatus {
    path: String,
    state: FileState,
    metadata: Option<FileMetadata>,
}

fn missing_message(kind: EntryKind) -> String {
    match kind {
        EntryKind::File => "Dosya artık bu konumda bulunamıyor.",
        EntryKind::Folder => "Klasör bulunamadı.",
    }
    .to_string()
}

fn inspect_entry(path: &str, kind: EntryKind) -> FileStatus {
    let target = Path::new(path);
    let mut status = FileStatus {
        path: path.to_string(),
        state: FileState::Unavailable,
        metadata: None,
    };
    if !target.is_absolute() {
        return status;
    }
    let metadata = match fs::metadata(target) {
        Ok(value) => value,
        Err(error) => {
            if error.kind() == ErrorKind::NotFound || error.kind() == ErrorKind::NotADirectory {
                status.state = FileState::Missing;
            }
            return status;
        }
    };
    if (kind == EntryKind::File && !metadata.is_file())
        || (kind == EntryKind::Folder && !metadata.is_dir())
    {
        return status;
    }
    let file_name = target
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string());
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .and_then(|value| u64::try_from(value.as_millis()).ok());
    status.state = FileState::Available;
    status.metadata = Some(FileMetadata {
        path: path.to_string(),
        file_name,
        kind,
        extension: (kind == EntryKind::File)
            .then(|| {
                target
                    .extension()
                    .map(|value| value.to_string_lossy().into_owned())
            })
            .flatten(),
        size_bytes: (kind == EntryKind::File).then_some(metadata.len()),
        modified_at,
    });
    status
}

fn existing_entry(path: &str, kind: EntryKind) -> Result<FileMetadata, String> {
    let status = inspect_entry(path, kind);
    status.metadata.ok_or_else(|| match status.state {
        FileState::Missing => missing_message(kind),
        _ => "Bu konuma erişilemiyor veya öğenin türü değişmiş.".to_string(),
    })
}

#[tauri::command]
pub async fn read_file_entry(app: tauri::AppHandle, path: String, kind: EntryKind) -> Result<FileMetadata, String> {
    tauri::async_runtime::spawn_blocking(move || { authorize(&app, &path, kind)?; existing_entry(&path, kind) })
        .await
        .map_err(|_| "Dosya bilgileri alınamadı.".to_string())?
}

#[tauri::command]
pub async fn check_file_entries(app: tauri::AppHandle, items: Vec<FileReference>) -> Result<Vec<FileStatus>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        items
            .iter()
            .map(|item| if authorize(&app, &item.path, item.kind).is_ok() { inspect_entry(&item.path, item.kind) } else { FileStatus {path:item.path.clone(), state:FileState::Unavailable, metadata:None} })
            .collect()
    })
    .await
    .map_err(|_| "Dosya durumları kontrol edilemedi.".to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileAction {
    Open,
    Reveal,
}

#[tauri::command]
pub async fn access_file_entry(
    app: tauri::AppHandle,
    path: String,
    kind: EntryKind,
    action: FileAction,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        authorize(&app, &path, kind)?;
        existing_entry(&path, kind)?;
        if kind == EntryKind::Folder {
            return crate::projects::open_project_folder(app, path);
        }
        match action {
            FileAction::Open => tauri_plugin_opener::open_path(PathBuf::from(path), None::<&str>)
                .map_err(|_| "Dosya açılamadı. Varsayılan uygulamayı kontrol edin.".to_string()),
            FileAction::Reveal => tauri_plugin_opener::reveal_item_in_dir(PathBuf::from(path))
                .map_err(|_| "Dosya Explorer'da gösterilemedi.".to_string()),
        }
    })
    .await
    .map_err(|_| "Dosya işlemi tamamlanamadı.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metadata_handles_files_folders_and_missing_paths_without_changing_contents() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join(format!(".ackdeck-files-test-{}", std::process::id()));
        fs::create_dir(&root).unwrap();
        let file = root.join("Türkçe & örnek.txt");
        fs::write(&file, b"ACKDeck test").unwrap();
        let path = file.to_str().unwrap();
        let info = existing_entry(path, EntryKind::File).unwrap();
        assert_eq!(info.file_name, "Türkçe & örnek.txt");
        assert_eq!(info.extension.as_deref(), Some("txt"));
        assert_eq!(info.size_bytes, Some(12));
        assert!(info.modified_at.is_some());
        assert_eq!(
            inspect_entry(root.to_str().unwrap(), EntryKind::Folder).state,
            FileState::Available
        );
        assert_eq!(
            inspect_entry(path, EntryKind::Folder).state,
            FileState::Unavailable
        );
        let missing = root.join("missing.txt");
        assert_eq!(
            inspect_entry(missing.to_str().unwrap(), EntryKind::File).state,
            FileState::Missing
        );
        assert_eq!(
            existing_entry(missing.to_str().unwrap(), EntryKind::Folder).err(),
            Some(missing_message(EntryKind::Folder))
        );
        assert_eq!(
            existing_entry(missing.to_str().unwrap(), EntryKind::File).err(),
            Some(missing_message(EntryKind::File))
        );
        assert_eq!(
            inspect_entry("relative.txt", EntryKind::File).state,
            FileState::Unavailable
        );
        assert_eq!(fs::read(&file).unwrap(), b"ACKDeck test");
        fs::remove_file(file).unwrap();
        fs::remove_dir(root).unwrap();
    }
}

fn authorize(app: &tauri::AppHandle, path: &str, kind: EntryKind) -> Result<(), String> {
    if kind == EntryKind::File && Path::new(path).extension().is_some_and(|ext| ["exe","com","bat","cmd","ps1","vbs","vbe","js","jse","wsf","wsh","lnk","url","hta","msi","scr","cpl","dll"].iter().any(|blocked| ext.eq_ignore_ascii_case(blocked))) {
        return Err("Çalıştırılabilir dosya veya betik dosya API'sinden açılamaz.".into());
    }
    crate::launch_targets::authorize_path(app, path, if kind == EntryKind::Folder {"folder"} else {"file"})
}
