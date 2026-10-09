use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
const MAX_FILE: u64 = 100 * 1024 * 1024;
const MAX_TOTAL: u64 = 512 * 1024 * 1024;
const MAX_RECORDS: u64 = 10 * 1024 * 1024;
#[derive(Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PackedFile {
    entry: String,
    source: String,
}
#[derive(Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    format_version: u8,
    files: Vec<PackedFile>,
}
struct Selected {
    token: String,
    path: PathBuf,
    content: String,
    manifest: Manifest,
    restored: Option<PathBuf>,
}
#[derive(Default)]
pub struct PortableState(Mutex<Option<Selected>>);
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    content: String,
    token: Option<String>,
    file_count: usize,
}
fn error() -> String {
    "Dosyalı yedek geçersiz veya okunamadı. Mevcut veriler değiştirilmedi.".into()
}
fn main_only(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err(error())
    }
}
fn token() -> Result<String, String> {
    let mut b = [0u8; 16];
    getrandom::fill(&mut b).map_err(|_| error())?;
    Ok(b.iter().map(|b| format!("{b:02x}")).collect())
}
fn read_entry<R: Read + std::io::Seek>(
    zip: &mut zip::ZipArchive<R>,
    name: &str,
    limit: u64,
) -> Result<Vec<u8>, String> {
    let file = zip.by_name(name).map_err(|_| error())?;
    if file.size() > limit || file.is_dir() {
        return Err(error());
    }
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| error())?;
    if bytes.len() as u64 > limit {
        return Err(error());
    }
    Ok(bytes)
}
fn references(value: &Value) -> Result<HashMap<String, String>, String> {
    let data = value.get("data").ok_or_else(error)?;
    let mut refs = HashMap::new();
    for kind in ["notes", "archive"] {
        for row in data[kind].as_array().ok_or_else(error)? {
            if let Some(files) = row.get("attachments") {
                for file in files.as_array().ok_or_else(error)? {
                    let id = file["id"].as_str().ok_or_else(error)?;
                    if !crate::phone_media::valid_cache_id(id) {
                        return Err(error());
                    }
                    refs.insert(format!("media:{id}"), id.into());
                }
            }
            if kind == "archive" && row["file"].is_object() {
                let id = row["id"].as_str().ok_or_else(error)?;
                if id.is_empty() || id.len() > 512 {
                    return Err(error());
                }
                refs.insert(
                    format!("archive:{id}"),
                    row["file"]["path"].as_str().ok_or_else(error)?.into(),
                );
            }
        }
    }
    Ok(refs)
}
fn allowed_file(path: &Path) -> bool {
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_ascii_lowercase();
    !name.starts_with(".env")
        && !name.contains("secret")
        && !name.contains("credential")
        && ![".env", "auth.json", "id_rsa", "id_ed25519"].contains(&name.as_str())
        && ![
            "key", "pem", "pfx", "p12", "exe", "dll", "bat", "cmd", "ps1", "js", "vbs", "msi",
            "lnk",
        ]
        .contains(
            &path
                .extension()
                .unwrap_or_default()
                .to_string_lossy()
                .to_ascii_lowercase()
                .as_str(),
        )
}
fn validate_archive(content: &str, manifest: &Manifest, names: &[String]) -> Result<(), String> {
    if !crate::backup::valid_envelope(content)
        || manifest.format_version != 1
        || manifest.files.len() > 2000
    {
        return Err(error());
    }
    let value: Value = serde_json::from_str(content).map_err(|_| error())?;
    let refs = references(&value)?;
    let sources: HashSet<_> = manifest.files.iter().map(|f| f.source.clone()).collect();
    let entries: HashSet<_> = manifest.files.iter().map(|f| f.entry.clone()).collect();
    if sources.len() != manifest.files.len()
        || entries.len() != manifest.files.len()
        || sources != refs.keys().cloned().collect()
        || manifest
            .files
            .iter()
            .enumerate()
            .any(|(i, f)| f.entry != format!("files/{i}"))
    {
        return Err(error());
    }
    let mut expected = entries;
    expected.insert("records.json".into());
    expected.insert("manifest.json".into());
    if names.len() != expected.len() || names.iter().any(|n| !expected.contains(n)) {
        return Err(error());
    }
    Ok(())
}
fn open_archive(path: &Path) -> Result<(zip::ZipArchive<fs::File>, String, Manifest), String> {
    let file = fs::File::open(path).map_err(|_| error())?;
    if file.metadata().map_err(|_| error())?.len() > MAX_TOTAL + MAX_RECORDS + 1024 * 1024 {
        return Err(error());
    }
    let mut zip = zip::ZipArchive::new(file).map_err(|_| error())?;
    if zip.len() > 2002 {
        return Err(error());
    }
    let content = String::from_utf8(read_entry(&mut zip, "records.json", MAX_RECORDS)?)
        .map_err(|_| error())?;
    let manifest: Manifest =
        serde_json::from_slice(&read_entry(&mut zip, "manifest.json", 1024 * 1024)?)
            .map_err(|_| error())?;
    let names = zip.file_names().map(String::from).collect::<Vec<_>>();
    validate_archive(&content, &manifest, &names)?;
    let mut total = 0u64;
    for f in &manifest.files {
        let size = zip.by_name(&f.entry).map_err(|_| error())?.size();
        if size > MAX_FILE {
            return Err(error());
        }
        total = total.checked_add(size).ok_or_else(error)?;
    }
    if total > MAX_TOTAL {
        return Err(error());
    }
    Ok((zip, content, manifest))
}
fn write_zip(
    content: &str,
    path: &Path,
    read_media: impl Fn(&str) -> Result<crate::phone_media::Media, String>,
) -> Result<usize, String> {
    if !crate::backup::valid_envelope(content) {
        return Err(error());
    }
    let value: Value = serde_json::from_str(content).map_err(|_| error())?;
    let refs = references(&value)?;
    if refs.len() > 2000 {
        return Err(error());
    }
    let temp = path.with_file_name(format!(".ackdeck-{}.tmp", token()?));
    let result = (|| {
        let file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|_| error())?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        let mut manifest = Manifest {
            format_version: 1,
            files: vec![],
        };
        let mut total = 0u64;
        let mut refs = refs.into_iter().collect::<Vec<_>>();
        refs.sort_by(|a, b| a.0.cmp(&b.0));
        for (i, (source, target)) in refs.into_iter().enumerate() {
            let bytes = if source.starts_with("media:") {
                serde_json::to_vec(&read_media(&target)?).map_err(|_| error())?
            } else {
                let target = Path::new(&target);
                if !target.is_absolute()
                    || target.to_string_lossy().starts_with(['\\', '/'])
                    || !allowed_file(target)
                {
                    return Err("Dosyalı yedeğe çalıştırılabilir veya gizli anahtar dosyası eklenemez. JSON yedeğini kullanabilirsin.".into());
                }
                let file = fs::File::open(target).map_err(|_| {
                    "Bir ek dosya bulunamadı. Eksik dosyayı düzelt veya JSON yedeğini kullan."
                        .to_string()
                })?;
                let metadata = file.metadata().map_err(|_| error())?;
                if !metadata.is_file() || metadata.len() > MAX_FILE {
                    return Err(error());
                }
                let mut bytes = Vec::new();
                file.take(MAX_FILE + 1)
                    .read_to_end(&mut bytes)
                    .map_err(|_| error())?;
                bytes
            };
            total += bytes.len() as u64;
            if bytes.len() as u64 > MAX_FILE || total > MAX_TOTAL {
                return Err(
                    "Dosyalı yedek sınırı aşıldı: dosya başına 100 MB, toplam 512 MB.".into(),
                );
            }
            let text = String::from_utf8_lossy(&bytes);
            if text.contains("AIza") || crate::privacy::has_credentials(&text) {
                return Err("Ek dosya gizli anahtar içeriyor; dosyalı yedek oluşturulmadı.".into());
            }
            if source.starts_with("media:") {
                let media: crate::phone_media::Media =
                    serde_json::from_slice(&bytes).map_err(|_| error())?;
                if !crate::phone_media::safe_media(&media) {
                    return Err(
                        "Ek dosya gizli anahtar içeriyor; dosyalı yedek oluşturulmadı.".into(),
                    );
                }
            }
            let entry = format!("files/{i}");
            zip.start_file(&entry, options).map_err(|_| error())?;
            zip.write_all(&bytes).map_err(|_| error())?;
            manifest.files.push(PackedFile { entry, source });
        }
        for (name, bytes) in [
            ("records.json", content.as_bytes().to_vec()),
            (
                "manifest.json",
                serde_json::to_vec(&manifest).map_err(|_| error())?,
            ),
        ] {
            zip.start_file(name, options).map_err(|_| error())?;
            zip.write_all(&bytes).map_err(|_| error())?;
        }
        let file = zip.finish().map_err(|_| error())?;
        file.sync_all().map_err(|_| error())?;
        drop(file);
        fs::rename(&temp, path).map_err(|_| error())?;
        Ok(manifest.files.len())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}
#[tauri::command]
pub async fn save_portable_backup(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    content: String,
) -> Result<Option<usize>, String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("ACKDeck dosyalı yedek", &["zip"])
            .set_file_name("ACKDeck-Backup.zip")
            .set_title("Dosyalı ACKDeck yedeğini kaydet")
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let path = file.into_path().map_err(|_| error())?;
        if path
            .extension()
            .is_none_or(|ext| !ext.eq_ignore_ascii_case("zip"))
        {
            return Err("Dosyalı yedek için .zip uzantısı seçin.".into());
        }
        write_zip(&content, &path, |id| {
            crate::phone_media::read_cached(&app, id)
        })
        .map(Some)
    })
    .await
    .map_err(|_| error())?
}
#[tauri::command]
pub async fn choose_portable_backup(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Option<Preview>, String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .add_filter("ACKDeck yedek", &["zip", "json"])
            .set_title("ACKDeck yedeğini seç")
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = file.into_path().map_err(|_| error())?;
        let state = app.state::<PortableState>();
        let mut selected = state.0.lock().map_err(|_| error())?;
        if selected.as_ref().is_some_and(|s| s.restored.is_some()) {
            return Err(error());
        }
        *selected = None;
        if path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
        {
            let mut content = String::new();
            fs::File::open(&path)
                .map_err(|_| error())?
                .take(MAX_RECORDS + 1)
                .read_to_string(&mut content)
                .map_err(|_| error())?;
            if !crate::backup::valid_envelope(&content) {
                return Err(error());
            }
            return Ok(Some(Preview {
                content,
                token: None,
                file_count: 0,
            }));
        }
        let (_, content, manifest) = open_archive(&path)?;
        let token = token()?;
        let file_count = manifest.files.len();
        *selected = Some(Selected {
            token: token.clone(),
            path,
            content: content.clone(),
            manifest,
            restored: None,
        });
        Ok(Some(Preview {
            content,
            token: Some(token),
            file_count,
        }))
    })
    .await
    .map_err(|_| error())?
}
fn safe_name(value: &str) -> bool {
    !value.is_empty()
        && value.chars().count() <= 180
        && !value
            .chars()
            .any(|c| c.is_control() || "\\/<>:\"|?*".contains(c))
        && ![".", ".."].contains(&value)
}
fn extract(selected: &Selected, destination: &Path) -> Result<String, String> {
    let (mut zip, content, manifest) = open_archive(&selected.path)?;
    if content != selected.content || manifest != selected.manifest {
        return Err(error());
    }
    let mut value: Value = serde_json::from_str(&content).map_err(|_| error())?;
    fs::create_dir_all(destination.join("media")).map_err(|_| error())?;
    fs::create_dir_all(destination.join("files")).map_err(|_| error())?;
    let mut media_ids = HashMap::new();
    for (i, f) in manifest.files.iter().enumerate() {
        let bytes = read_entry(&mut zip, &f.entry, MAX_FILE)?;
        if let Some(old_id) = f.source.strip_prefix("media:") {
            let mut media: crate::phone_media::Media =
                serde_json::from_slice(&bytes).map_err(|_| error())?;
            if media.id != old_id || !crate::phone_media::safe_media(&media) {
                return Err(error());
            }
            for kind in ["notes", "archive"] {
                for row in value["data"][kind].as_array().ok_or_else(error)? {
                    if let Some(files) = row["attachments"].as_array() {
                        for file in files.iter().filter(|f| f["id"] == old_id) {
                            if file["name"] != media.name
                                || file["mime"] != media.mime
                                || file["size"].as_u64() != Some(media.size as u64)
                            {
                                return Err(error());
                            }
                        }
                    }
                }
            }
            let new_id = format!("pb_{}_{i}", selected.token);
            media.id = new_id.clone();
            fs::write(
                destination.join("media").join(format!("{new_id}.json")),
                serde_json::to_vec(&media).map_err(|_| error())?,
            )
            .map_err(|_| error())?;
            media_ids.insert(old_id.to_string(), new_id);
        } else if let Some(id) = f.source.strip_prefix("archive:") {
            let row = value["data"]["archive"]
                .as_array_mut()
                .ok_or_else(error)?
                .iter_mut()
                .find(|row| row["id"] == id)
                .ok_or_else(error)?;
            let name = row["file"]["fileName"].as_str().ok_or_else(error)?;
            if !safe_name(name) || !allowed_file(Path::new(name)) {
                return Err(error());
            }
            let path = destination.join("files").join(format!("{i}-{name}"));
            fs::write(&path, bytes).map_err(|_| error())?;
            row["file"]["path"] = Value::String(path.to_string_lossy().into_owned());
        } else {
            return Err(error());
        }
    }
    for kind in ["notes", "archive"] {
        for row in value["data"][kind].as_array_mut().ok_or_else(error)? {
            if let Some(files) = row.get_mut("attachments") {
                for file in files.as_array_mut().ok_or_else(error)? {
                    let old = file["id"].as_str().ok_or_else(error)?;
                    let new = media_ids.get(old).ok_or_else(error)?;
                    file["id"] = Value::String(new.clone());
                }
            }
        }
    }
    serde_json::to_string(&value).map_err(|_| error())
}
#[tauri::command]
pub async fn prepare_portable_restore(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    token: String,
) -> Result<String, String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<PortableState>();
        let mut selected = state.0.lock().map_err(|_| error())?;
        let selected = selected
            .as_mut()
            .filter(|s| s.token == token && s.restored.is_none())
            .ok_or_else(error)?;
        let destination = app
            .path()
            .app_data_dir()
            .map_err(|_| error())?
            .join("restored-backups.v1")
            .join(&selected.token);
        if destination.exists() {
            return Err(error());
        }
        let result = extract(selected, &destination);
        if result.is_err() {
            let _ = fs::remove_dir_all(&destination);
        } else {
            selected.restored = Some(destination);
        }
        result
    })
    .await
    .map_err(|_| error())?
}
#[tauri::command]
pub fn finish_portable_restore(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    token: String,
    keep: bool,
) -> Result<(), String> {
    main_only(&window)?;
    let state = app.state::<PortableState>();
    let mut selected = state.0.lock().map_err(|_| error())?;
    if let Some(value) = selected.as_ref().filter(|v| v.token == token) {
        if !keep {
            if let Some(path) = &value.restored {
                let expected = app
                    .path()
                    .app_data_dir()
                    .map_err(|_| error())?
                    .join("restored-backups.v1")
                    .join(&value.token);
                if *path != expected {
                    return Err(error());
                }
                fs::remove_dir_all(path).map_err(|_| error())?;
            }
        }
        *selected = None;
        Ok(())
    } else {
        Err(error())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn package_manifest_rejects_traversal_duplicates_and_unreferenced_files() {
        let content = r#"{"formatVersion":2,"data":{"notes":[],"archive":[{"id":"a","file":{"path":"C:/a.pdf"}}]}}"#;
        let good = Manifest {
            format_version: 1,
            files: vec![PackedFile {
                entry: "files/0".into(),
                source: "archive:a".into(),
            }],
        };
        assert!(validate_archive(
            content,
            &good,
            &[
                "records.json".into(),
                "manifest.json".into(),
                "files/0".into()
            ]
        )
        .is_ok());
        let mut bad = good.clone();
        bad.files[0].entry = "../a".into();
        assert!(validate_archive(content, &bad, &[]).is_err());
        bad = good.clone();
        bad.files.push(bad.files[0].clone());
        assert!(validate_archive(content, &bad, &[]).is_err());
        bad = good;
        bad.files[0].source = "archive:missing".into();
        assert!(validate_archive(content, &bad, &[]).is_err());
        assert!(!safe_name("../a.pdf"));
        assert!(!allowed_file(Path::new("credentials.json")));
        assert!(!allowed_file(Path::new("run.exe")));
    }
    #[test]
    fn zip_moves_archive_and_note_media_to_new_paths_without_overwriting_originals() {
        use base64::{engine::general_purpose::STANDARD, Engine};
        let root = std::env::temp_dir().join(format!("ackdeck-portable-test-{}", token().unwrap()));
        fs::create_dir_all(&root).unwrap();
        let original = root.join("original.pdf");
        fs::write(&original, b"%PDF-test-content").unwrap();
        let media = crate::phone_media::Media {
            id: "old-media".into(),
            name: "note.txt".into(),
            mime: "text/plain".into(),
            size: 9,
            base64: STANDARD.encode(b"Note text"),
        };
        let content=serde_json::json!({"formatVersion":2,"data":{"notes":[{"id":"n","attachments":[{"id":media.id,"name":media.name,"mime":media.mime,"size":media.size}]}],"archive":[{"id":"a","file":{"path":original.to_string_lossy(),"fileName":"original.pdf"},"attachments":[{"id":media.id,"name":media.name,"mime":media.mime,"size":media.size}]}]}}).to_string();
        let package = root.join("backup.zip");
        assert_eq!(
            write_zip(&content, &package, |_| Ok(media.clone())).unwrap(),
            2
        );
        let (_, content, manifest) = open_archive(&package).unwrap();
        let selected = Selected {
            token: token().unwrap(),
            path: package,
            content,
            manifest,
            restored: None,
        };
        let target = root.join("new-computer");
        let restored: Value = serde_json::from_str(&extract(&selected, &target).unwrap()).unwrap();
        let new_id = restored["data"]["notes"][0]["attachments"][0]["id"]
            .as_str()
            .unwrap();
        assert_ne!(new_id, "old-media");
        assert_eq!(
            restored["data"]["archive"][0]["attachments"][0]["id"],
            new_id
        );
        let new_media: crate::phone_media::Media = serde_json::from_slice(
            &fs::read(target.join("media").join(format!("{new_id}.json"))).unwrap(),
        )
        .unwrap();
        assert!(crate::phone_media::valid_media(&new_media));
        assert_eq!(new_media.base64, media.base64);
        assert_eq!(
            fs::read(
                restored["data"]["archive"][0]["file"]["path"]
                    .as_str()
                    .unwrap()
            )
            .unwrap(),
            b"%PDF-test-content"
        );
        assert_eq!(fs::read(&original).unwrap(), b"%PDF-test-content");
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn missing_files_and_secret_media_never_publish_a_partial_backup() {
        use base64::{engine::general_purpose::STANDARD, Engine};
        let root = std::env::temp_dir().join(format!("ackdeck-portable-test-{}", token().unwrap()));
        fs::create_dir_all(&root).unwrap();
        let content=serde_json::json!({"formatVersion":2,"data":{"notes":[],"archive":[{"id":"a","file":{"path":root.join("missing.pdf").to_string_lossy(),"fileName":"missing.pdf"}}]}}).to_string();
        let package = root.join("backup.zip");
        assert!(write_zip(&content, &package, |_| Err(error())).is_err());
        assert!(!package.exists());
        assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
        fs::write(&package, b"previous complete backup").unwrap();
        assert!(write_zip(&content, &package, |_| Err(error())).is_err());
        assert_eq!(fs::read(&package).unwrap(), b"previous complete backup");
        fs::remove_file(&package).unwrap();
        let secret = ["AI", "za", &"x".repeat(35)].concat();
        let media = crate::phone_media::Media {
            id: "m".into(),
            name: "note.txt".into(),
            mime: "text/plain".into(),
            size: secret.len(),
            base64: STANDARD.encode(secret),
        };
        let content=serde_json::json!({"formatVersion":2,"data":{"notes":[{"attachments":[{"id":"m"}]}],"archive":[]}}).to_string();
        assert!(write_zip(&content, &package, |_| Ok(media.clone())).is_err());
        assert!(!package.exists());
        fs::remove_dir_all(root).unwrap();
    }
}
