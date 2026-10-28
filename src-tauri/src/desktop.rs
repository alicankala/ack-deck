use serde::{Deserialize, Serialize};
use std::{fs, sync::Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_autostart::ManagerExt;

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DesktopPreferences {
    #[serde(default)]
    pub close_to_tray: bool,
    #[serde(default)]
    pub start_in_tray: bool,
}
pub struct DesktopState {
    pub preferences: Mutex<DesktopPreferences>,
    pub pending_page: Mutex<Option<String>>,
    pub readable: bool,
    pub tray_ready: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopStatus {
    preferences: DesktopPreferences,
    auto_start: bool,
    visible: bool,
    tray_ready: bool,
    version: String,
}
pub fn show_window(app: &tauri::AppHandle, page: Option<&str>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_always_on_top(true);
        let _ = window.set_focus();
        let _ = window.set_always_on_top(false);
        let _ = window.emit("ack-visibility", true);
        if let Some(page) = page {
            if let Some(state) = app.try_state::<DesktopState>() {
                if let Ok(mut pending) = state.pending_page.lock() {
                    *pending = Some(page.into());
                }
            }
            let _ = window.emit("ack-navigate", page);
        }
    }
}
#[tauri::command]
pub fn show_main_window(app: tauri::AppHandle, target: Option<String>) {
    show_window(&app, target.as_deref());
}
pub fn clear_windows_notifications(app_id: &str) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let script = format!(
            "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; \
            try {{ [Windows.UI.Notifications.ToastNotificationManager]::History.Clear('{app_id}') }} catch {{}}; \
            try {{ [Windows.UI.Notifications.ToastNotificationManager]::History.Clear('com.alican.ackdeck') }} catch {{}}; \
            try {{ [Windows.UI.Notifications.ToastNotificationManager]::History.Clear('ACKDeck') }} catch {{}};"
        );
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &script])
            .creation_flags(0x08000000)
            .spawn();
    }
}
#[tauri::command]
pub fn clear_notifications(app: tauri::AppHandle) {
    clear_windows_notifications(&app.config().identifier);
}
#[tauri::command]
pub fn notify_desktop(
    app: tauri::AppHandle,
    title: String,
    body: String,
    target: Option<String>,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        let handle = app.clone();
        let target_clone = target.clone();
        let _ = tauri_winrt_notification::Toast::new(&app.config().identifier)
            .title(&title)
            .text1(&body)
            .on_activated(move |_| {
                show_window(&handle, target_clone.as_deref());
                Ok(())
            })
            .show();
    }
    #[cfg(not(windows))]
    {
        use tauri_plugin_notification::NotificationExt;
        let _ = app.notification().builder().title(&title).body(&body).show();
    }
    Ok(())
}
pub fn should_start_hidden(
    autostart_launch: bool,
    enabled: bool,
    preferences: &DesktopPreferences,
) -> bool {
    autostart_launch && enabled && preferences.start_in_tray
}
pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let path = app
        .path()
        .app_config_dir()?
        .join("desktop-preferences.v1.json");
    let (preferences, readable) = match fs::read(&path) {
        Ok(bytes) => match serde_json::from_slice(&bytes) {
            Ok(value) => (value, true),
            Err(_) => (DesktopPreferences::default(), false),
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            (DesktopPreferences::default(), true)
        }
        Err(_) => (DesktopPreferences::default(), false),
    };
    clear_windows_notifications(&app.config().identifier);
    let open = MenuItem::with_id(app, "open", "ACKDeck'i Aç", true, None::<&str>)?;
    let ai = MenuItem::with_id(app, "ai", "ACK AI", true, None::<&str>)?;
    let task = MenuItem::with_id(app, "tasks", "Yeni Görev", true, None::<&str>)?;
    let note = MenuItem::with_id(app, "notes", "Hızlı Not Al", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &ai, &task, &note, &quit])?;
    let mut tray = TrayIconBuilder::with_id("ackdeck-tray")
        .tooltip("ACKDeck")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                crate::phone::send_offline_beacon(app);
                app.exit(0);
            }
            "ai" => show_window(app, Some("ai")),
            "tasks" => show_window(app, Some("new-task")),
            "notes" => show_window(app, Some("new-note")),
            "open" => show_window(app, None),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                }
            ) {
                show_window(tray.app_handle(), None);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    let enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let hidden = should_start_hidden(
        std::env::args().any(|arg| arg == "--autostart"),
        enabled,
        &preferences,
    );
    app.manage(DesktopState {
        preferences: Mutex::new(preferences),
        pending_page: Mutex::new(None),
        readable,
        tray_ready: true,
    });
    crate::reminders::setup(app.handle())?;
    if !hidden {
        show_window(app.handle(), None);
    }
    crate::palette::setup(app)?;
    Ok(())
}
pub fn window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if window.label() == "palette" {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window.hide();
        }
        return;
    }
    if window.label() != "main" {
        return;
    }
    let Some(state) = window.app_handle().try_state::<DesktopState>() else {
        return;
    };
    match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            if state.tray_ready
                && state
                    .preferences
                    .lock()
                    .map(|prefs| prefs.close_to_tray)
                    .unwrap_or(false)
            {
                // Do not intercept closing if hiding fails: the window must remain reachable.
                if window.hide().is_ok() {
                    api.prevent_close();
                    let _ = window.emit("ack-visibility", false);
                    return;
                }
            }
            // The hidden palette must not keep the process alive after normal main-window close.
            crate::phone::send_offline_beacon(&window.app_handle());
            window.app_handle().exit(0);
        }
        tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Focused(true) => {
            let visible =
                window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false);
            let _ = window.emit("ack-visibility", visible);
        }
        _ => {}
    }
}
#[tauri::command]
pub fn desktop_status(
    app: tauri::AppHandle,
    state: tauri::State<DesktopState>,
) -> Result<DesktopStatus, String> {
    if !state.readable {
        return Err("Windows tercihleri okunamadı. Mevcut veriler korunuyor.".into());
    }
    let preferences = state
        .preferences
        .lock()
        .map_err(|_| "Windows tercihleri alınamadı.")?
        .clone();
    let auto_start = app
        .autolaunch()
        .is_enabled()
        .map_err(|_| "Windows başlangıç durumu alınamadı.")?;
    let visible = app.get_webview_window("main").is_some_and(|window| {
        window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false)
    });
    Ok(DesktopStatus {
        preferences,
        auto_start,
        visible,
        tray_ready: state.tray_ready,
        version: app.package_info().version.to_string(),
    })
}
#[tauri::command]
pub fn desktop_ready(state: tauri::State<DesktopState>) -> Option<String> {
    state.pending_page.lock().ok()?.take()
}
#[tauri::command]
pub fn save_desktop_preferences(
    app: tauri::AppHandle,
    state: tauri::State<DesktopState>,
    preferences: DesktopPreferences,
    auto_start: bool,
) -> Result<(), String> {
    if !state.readable {
        return Err("Windows tercihleri okunamadı; kaydetme kapatıldı.".into());
    }
    let old_enabled = app
        .autolaunch()
        .is_enabled()
        .map_err(|_| "Windows başlangıç durumu alınamadı.")?;
    let mut current = state
        .preferences
        .lock()
        .map_err(|_| "Windows tercihleri kaydedilemedi.")?;
    let path = app
        .path()
        .app_config_dir()
        .map_err(|_| "Windows tercihleri kaydedilemedi.")?
        .join("desktop-preferences.v1.json");
    if old_enabled != auto_start {
        if cfg!(debug_assertions) && auto_start {
            return Err("Otomatik başlatma kurulu production sürümünde açılabilir.".into());
        }
        (if auto_start {
            app.autolaunch().enable()
        } else {
            app.autolaunch().disable()
        })
        .map_err(|_| "Windows otomatik başlatma ayarı değiştirilemedi.")?;
    }
    let save = (|| -> Result<(), Box<dyn std::error::Error>> {
        fs::create_dir_all(path.parent().unwrap())?;
        let temp = path.with_extension("tmp");
        fs::write(&temp, serde_json::to_vec(&preferences)?)?;
        fs::rename(temp, path)?;
        Ok(())
    })();
    if save.is_err() {
        if old_enabled != auto_start {
            let reverted = if old_enabled {
                app.autolaunch().enable()
            } else {
                app.autolaunch().disable()
            };
            if reverted.is_err() {
                return Err(
                    "Tercihler kaydedilemedi. Windows başlangıç durumunu yeniden kontrol edin."
                        .into(),
                );
            }
        }
        return Err("Windows tercihleri kaydedilemedi.".into());
    }
    *current = preferences;
    Ok(())
}

#[tauri::command]
pub fn window_minimize(window: tauri::WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_toggle_maximize(window: tauri::WebviewWindow) -> Result<bool, String> {
    let is_max = window.is_maximized().map_err(|e| e.to_string())?;
    if is_max {
        window.unmaximize().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        window.maximize().map_err(|e| e.to_string())?;
        Ok(true)
    }
}

#[tauri::command]
pub fn window_close(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, DesktopState>,
) -> Result<(), String> {
    if state.tray_ready
        && state
            .preferences
            .lock()
            .map(|prefs| prefs.close_to_tray)
            .unwrap_or(false)
    {
        if window.hide().is_ok() {
            let _ = window.emit("ack-visibility", false);
            return Ok(());
        }
    }
    crate::phone::send_offline_beacon(&window.app_handle());
    window.app_handle().exit(0);
    Ok(())
}

#[tauri::command]
pub fn window_start_dragging(window: tauri::WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_dorm_menu() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| e.to_string())?;

    let urls = [
        "https://ack-deck-phone.ack-deck-cloud.workers.dev/api/dorm-menu",
        "https://altinkalemkarabuk.com/icerik/icerik.json",
    ];

    for url in urls {
        if let Ok(resp) = client
            .get(url)
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            )
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(text) = resp.text().await {
                    return Ok(text);
                }
            }
        }
    }

    Err("Yemek menüsü alınamadı".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hidden_start_requires_all_three_conditions() {
        let prefs = DesktopPreferences {
            close_to_tray: true,
            start_in_tray: true,
        };
        assert!(should_start_hidden(true, true, &prefs));
        assert!(!should_start_hidden(false, true, &prefs));
        assert!(!should_start_hidden(true, false, &prefs));
        assert!(!should_start_hidden(
            true,
            true,
            &DesktopPreferences::default()
        ));
    }
}
