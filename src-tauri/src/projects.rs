use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

fn existing_folder(path: String) -> Result<PathBuf, String> {
    let folder = PathBuf::from(path);
    if folder.is_absolute() && folder.is_dir() {
        Ok(folder)
    } else {
        Err("Klasör bulunamadı.".to_string())
    }
}

fn vscode_executable() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(root) = env::var_os("LOCALAPPDATA") {
        candidates.push(PathBuf::from(root).join("Programs/Microsoft VS Code/Code.exe"));
    }
    for variable in ["PROGRAMFILES", "PROGRAMFILES(X86)"] {
        if let Some(root) = env::var_os(variable) {
            candidates.push(PathBuf::from(root).join("Microsoft VS Code/Code.exe"));
        }
    }
    if let Some(path) = env::var_os("PATH") {
        for directory in env::split_paths(&path) {
            candidates.push(directory.join("Code.exe"));
            if directory
                .file_name()
                .is_some_and(|name| name.eq_ignore_ascii_case("bin"))
            {
                if let Some(parent) = directory.parent() {
                    candidates.push(parent.join("Code.exe"));
                }
            }
        }
    }
    candidates
        .into_iter()
        .find(|path| Path::new(path).is_file())
}

#[tauri::command]
pub fn open_project_folder(path: String) -> Result<(), String> {
    let folder = existing_folder(path)?;
    Command::new("explorer.exe")
        .arg(folder)
        .spawn()
        .map(|_| ())
        .map_err(|_| "Klasör açılamadı.".to_string())
}

#[tauri::command]
pub fn open_project_in_vscode(path: String) -> Result<(), String> {
    let folder = existing_folder(path)?;
    let vscode =
        vscode_executable().ok_or_else(|| "VS Code bulunamadı veya açılamadı.".to_string())?;
    Command::new(vscode)
        .arg(folder)
        .spawn()
        .map(|_| ())
        .map_err(|_| "VS Code bulunamadı veya açılamadı.".to_string())
}

#[cfg(test)]
mod tests {
    use super::existing_folder;

    #[test]
    fn accepts_existing_folder_and_rejects_missing_folder() {
        let existing = std::env::temp_dir();
        assert!(existing_folder(existing.to_string_lossy().into_owned()).is_ok());
        let missing = existing.join(format!("ackdeck-missing-folder-{}", std::process::id()));
        assert_eq!(
            existing_folder(missing.to_string_lossy().into_owned()).unwrap_err(),
            "Klasör bulunamadı."
        );
    }
}
