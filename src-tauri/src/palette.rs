use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PaletteRequest {
    pub id: String,
    pub kind: String,
    pub value: String,
    pub mode: Option<String>,
}
pub struct PaletteState {
    pub pending: Mutex<HashMap<String, tokio::sync::oneshot::Sender<Result<String, String>>>>,
    pub registered: AtomicBool,
    pub key: Mutex<(Shortcut, String)>,
    pub shortcut_down: AtomicBool,
}
fn should_toggle(state: ShortcutState, down: &AtomicBool) -> bool {
    match state {
        ShortcutState::Pressed => !down.swap(true, Ordering::Relaxed),
        ShortcutState::Released => {
            down.store(false, Ordering::Relaxed);
            false
        }
    }
}
fn shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space)
}

pub const DEFAULT_SHORTCUT: &str = "Ctrl+Alt+Space";
fn parse_shortcut(text: &str) -> Result<Shortcut, String> {
    if text.len() > 80
        || !text.is_ascii()
        || !(text.to_ascii_lowercase().contains("ctrl+")
            || text.to_ascii_lowercase().contains("control+")
            || text.to_ascii_lowercase().contains("alt+"))
    {
        return Err("Ctrl veya Alt içeren geçerli bir kısayol girin.".into());
    }
    text.parse()
        .map_err(|_| "Kısayol geçersiz. Örnek: Ctrl+Alt+Space".into())
}
fn shortcut_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|_| "Kısayol kaydedilemedi.")?;
    std::fs::create_dir_all(&dir).map_err(|_| "Kısayol kaydedilemedi.")?;
    Ok(dir.join("palette-hotkey.v1.json"))
}
fn load_shortcut(app: &tauri::AppHandle) -> Result<String, String> {
    let path = shortcut_path(app)?;
    if !path.exists() {
        return Ok(DEFAULT_SHORTCUT.into());
    }
    let text = std::fs::read_to_string(path).map_err(|_| "Kısayol okunamadı.")?;
    let value: serde_json::Value = serde_json::from_str(&text).map_err(|_| "Kısayol okunamadı.")?;
    let key = value["shortcut"].as_str().ok_or("Kısayol okunamadı.")?;
    parse_shortcut(key)?;
    Ok(key.into())
}
fn persist_shortcut(app: &tauri::AppHandle, text: &str) -> Result<(), String> {
    let path = shortcut_path(app)?;
    let temp = path.with_extension("tmp");
    std::fs::write(
        &temp,
        serde_json::json!({"formatVersion":1,"shortcut":text}).to_string(),
    )
    .map_err(|_| "Kısayol kaydedilemedi.")?;
    std::fs::rename(temp, path).map_err(|_| "Kısayol kaydedilemedi.".into())
}

fn change_registration(
    old: Shortcut,
    new: Shortcut,
    was_registered: bool,
    old_text: &str,
    new_text: &str,
    mut register: impl FnMut(Shortcut) -> Result<(), String>,
    mut unregister: impl FnMut(Shortcut) -> Result<(), String>,
    mut persist: impl FnMut(&str) -> Result<(), String>,
) -> Result<(), String> {
    register(new)?;
    if let Err(error) = persist(new_text) {
        let _ = unregister(new);
        return Err(error);
    }
    if was_registered && old != new && unregister(old).is_err() {
        let _ = unregister(new);
        persist(old_text)?;
        return Err("Önceki kısayol değiştirilemedi. Mevcut kısayol korunuyor.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn get_palette_shortcut(state: tauri::State<PaletteState>) -> Result<String, String> {
    state
        .key
        .lock()
        .map(|key| key.1.clone())
        .map_err(|_| "Kısayol okunamadı.".into())
}
#[tauri::command]
pub fn get_palette_shortcut_state(
    state: tauri::State<PaletteState>,
) -> Result<serde_json::Value, String> {
    let key = state.key.lock().map_err(|_| "Kısayol okunamadı.")?;
    Ok(
        serde_json::json!({"shortcut": key.1, "registered": state.registered.load(Ordering::Relaxed)}),
    )
}
#[tauri::command]
pub fn restore_unregistered_palette_shortcut(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<PaletteState>,
    value: String,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Kısayol yalnızca Ayarlar'dan değiştirilebilir.".into());
    }
    let new = parse_shortcut(&value)?;
    let mut current = state.key.lock().map_err(|_| "Kısayol kurtarılamadı.")?;
    persist_shortcut(&app, &value)?;
    if state.registered.load(Ordering::Relaxed) {
        app.global_shortcut()
            .unregister(current.0)
            .map_err(|_| "Kısayol kurtarılamadı.")?;
    }
    *current = (new, value);
    state.registered.store(false, Ordering::Relaxed);
    state.shortcut_down.store(false, Ordering::Relaxed);
    Ok(())
}
#[tauri::command]
pub fn set_palette_shortcut(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<PaletteState>,
    value: String,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Kısayol yalnızca Ayarlar'dan değiştirilebilir.".into());
    }
    let value = value.trim();
    let new = parse_shortcut(value)?;
    let mut current = state.key.lock().map_err(|_| "Kısayol değiştirilemedi.")?;
    let was_registered = state.registered.load(Ordering::Relaxed);
    if new == current.0 && was_registered {
        return Ok(());
    }
    change_registration(
        current.0,
        new,
        was_registered,
        &current.1,
        value,
        |key| {
            app.global_shortcut().register(key).map_err(|_| {
                "Kısayol kaydedilemedi. Başka bir uygulama kullanıyor olabilir.".into()
            })
        },
        |key| {
            app.global_shortcut()
                .unregister(key)
                .map_err(|_| "Kısayol kaldırılamadı.".into())
        },
        |text| persist_shortcut(&app, text),
    )?;
    *current = (new, value.into());
    state.registered.store(true, Ordering::Relaxed);
    state.shortcut_down.store(false, Ordering::Relaxed);
    Ok(())
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, key, event| {
                if let Some(state) = app.try_state::<PaletteState>() {
                    if state.key.lock().is_ok_and(|current| &current.0 == key) {
                        if should_toggle(event.state(), &state.shortcut_down) {
                            toggle(app);
                        }
                    }
                }
            })
            .build(),
    )?;
    let text = load_shortcut(app.handle()).unwrap_or_else(|_| "Ctrl+Alt+Space".into());
    let selected = parse_shortcut(&text).unwrap_or_else(|_| shortcut());
    let registered = app.global_shortcut().register(selected).is_ok();
    app.manage(PaletteState {
        pending: Mutex::new(HashMap::new()),
        registered: AtomicBool::new(registered),
        key: Mutex::new((selected, text)),
        shortcut_down: AtomicBool::new(false),
    });
    // Let the Windows event loop run while WebView2 creates the second controller.
    let handle = app.handle().clone();
    std::thread::spawn(move || {
        let _ = tauri::WebviewWindowBuilder::new(
            &handle,
            "palette",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .initialization_script("window.__ACK_PALETTE__ = true;")
        .title("ACKDeck — Hızlı Erişim")
        .inner_size(660.0, 520.0)
        .min_inner_size(420.0, 300.0)
        .visible(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .center()
        .build();
    });
    Ok(())
}
pub fn toggle(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("palette") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.center();
            let _ = window.show();
            let _ = window.set_focus();
            let _ = window.emit("ack-palette-open", ());
        }
    }
}
#[tauri::command]
pub fn palette_status(app: tauri::AppHandle, state: tauri::State<PaletteState>) -> bool {
    state.registered.load(Ordering::Relaxed) && app.get_webview_window("palette").is_some()
}
#[tauri::command]
pub fn hide_palette(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("palette") {
        let _ = window.hide();
    }
}
fn valid(request: &PaletteRequest) -> bool {
    !request.id.is_empty()
        && request.id.len() <= 100
        && !request.value.trim().is_empty()
        && request.value.len() <= 30000
        && match request.kind.as_str() {
            "ai" => request.value.chars().count() <= 200 && request.mode.is_none(),
            "task" => request.value.chars().count() <= 160 && request.mode.is_none(),
            "note" => request.mode.is_none(),
            "workspace" | "shortcut" | "pin" => {
                request.value.len() <= 512 && (request.kind == "pin" || request.mode.is_none())
            }
            "project" => {
                request.value.len() <= 512
                    && matches!(request.mode.as_deref(), Some("folder" | "vscode"))
            }
            "navigate" => request.value.len() <= 1024 && request.mode.is_none(),
            _ => false,
        }
}
#[tauri::command]
pub async fn palette_request(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    request: PaletteRequest,
) -> Result<String, String> {
    if window.label() != "palette" || !valid(&request) {
        return Err("Palet işlemi geçersiz.".into());
    }
    let (sender, receiver) = tokio::sync::oneshot::channel();
    {
        let state = app.state::<PaletteState>();
        let mut pending = state.pending.lock().map_err(|_| "Palet hazır değil.")?;
        if pending.len() >= 8 || pending.contains_key(&request.id) {
            return Err("Başka bir işlem devam ediyor.".into());
        }
        pending.insert(request.id.clone(), sender);
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit("ack-palette-request", request.clone());
    }
    let result = tokio::time::timeout(std::time::Duration::from_secs(60), receiver).await;
    if let Ok(mut pending) = app.state::<PaletteState>().pending.lock() {
        pending.remove(&request.id);
    }
    match result {
        Ok(Ok(result)) => result,
        _ => Err("Ana uygulamadan yanıt alınamadı. Kaydı kontrol edip tekrar deneyin.".into()),
    }
}
#[tauri::command]
pub fn palette_result(
    state: tauri::State<PaletteState>,
    window: tauri::WebviewWindow,
    id: String,
    result: Option<String>,
    error: Option<String>,
) {
    if window.label() != "main" {
        return;
    }
    if let Ok(mut pending) = state.pending.lock() {
        if let Some(sender) = pending.remove(&id) {
            let _ = sender.send(if error.is_some() {
                Err("İşlem tamamlanamadı. Kayıtları veya konumu kontrol edin.".into())
            } else {
                Ok(result.unwrap_or_else(|| "Tamamlandı".into()))
            });
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn palette_rejects_generic_execution_and_invalid_modes() {
        let mut request = PaletteRequest {
            id: "id".into(),
            kind: "task".into(),
            value: "SD kart al".into(),
            mode: None,
        };
        assert!(valid(&request));
        request.kind = "execute_command".into();
        assert!(!valid(&request));
        request.kind = "project".into();
        request.mode = Some("shell".into());
        assert!(!valid(&request));
        request.mode = Some("vscode".into());
        assert!(valid(&request));
    }

    #[test]
    fn configurable_shortcut_validates_and_conflicts_preserve_old_registration() {
        assert!(parse_shortcut("Ctrl+Shift+Space").is_ok());
        assert!(parse_shortcut("Space").is_err());
        assert!(parse_shortcut("Ctrl+not-a-key").is_err());
        let old = shortcut();
        let new = parse_shortcut("Ctrl+Shift+Space").unwrap();
        let persisted = std::cell::RefCell::new(Vec::new());
        let removed = std::cell::RefCell::new(Vec::new());
        assert!(change_registration(
            old,
            new,
            true,
            DEFAULT_SHORTCUT,
            "Ctrl+Shift+Space",
            |_| Err("conflict".into()),
            |key| {
                removed.borrow_mut().push(key);
                Ok(())
            },
            |text| {
                persisted.borrow_mut().push(text.to_string());
                Ok(())
            }
        )
        .is_err());
        assert!(persisted.borrow().is_empty());
        assert!(removed.borrow().is_empty());
        assert!(change_registration(
            old,
            new,
            true,
            DEFAULT_SHORTCUT,
            "Ctrl+Shift+Space",
            |_| Ok(()),
            |key| {
                removed.borrow_mut().push(key);
                Ok(())
            },
            |_| Err("quota".into())
        )
        .is_err());
        assert_eq!(removed.borrow().as_slice(), &[new]);
        assert!(change_registration(
            old,
            new,
            true,
            DEFAULT_SHORTCUT,
            "Ctrl+Shift+Space",
            |_| Ok(()),
            |_| Ok(()),
            |text| {
                persisted.borrow_mut().push(text.to_string());
                Ok(())
            }
        )
        .is_ok());
        assert_eq!(persisted.borrow().last().unwrap(), "Ctrl+Shift+Space");
    }

    #[test]
    fn shortcut_toggles_once_per_press_and_ignores_release() {
        let down = AtomicBool::new(false);
        assert!(should_toggle(ShortcutState::Pressed, &down));
        assert!(!should_toggle(ShortcutState::Pressed, &down));
        assert!(!should_toggle(ShortcutState::Released, &down));
        assert!(should_toggle(ShortcutState::Pressed, &down));
    }
}
