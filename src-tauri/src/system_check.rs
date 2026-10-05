use serde::Serialize;
use tauri::Manager;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemHealth {
    backend_ready: bool,
    file_ops_ready: bool,
    internet_connected: bool,
}
#[tauri::command]
pub fn system_health(app: tauri::AppHandle) -> SystemHealth {
    let mut flags = 0;
    let internet_connected = unsafe {
        windows_sys::Win32::Networking::WinInet::InternetGetConnectedState(&mut flags, 0) != 0
    };
    SystemHealth {
        backend_ready: app.get_webview_window("main").is_some(),
        file_ops_ready: true,
        internet_connected,
    }
}
