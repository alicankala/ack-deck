use serde::Serialize;
use std::net::Ipv4Addr;
use std::time::Duration;
use windows_sys::Win32::Networking::WinInet::InternetGetConnectedState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalIpInfo {
    local_ipv4: Option<String>,
    adapter_name: Option<String>,
    gateway: Option<String>,
    internet_connected: bool,
}

#[tauri::command]
pub fn local_ip_info() -> LocalIpInfo {
    let interface = default_net::get_default_interface().ok();
    let local_ipv4 = interface
        .as_ref()
        .and_then(|item| item.ipv4.first())
        .map(|address| address.addr.to_string());
    let adapter_name = interface.as_ref().map(|item| {
        item.friendly_name
            .clone()
            .unwrap_or_else(|| item.name.clone())
    });
    let gateway = interface
        .as_ref()
        .and_then(|item| item.gateway.as_ref())
        .map(|value| value.ip_addr.to_string());
    let mut flags = 0;
    let internet_connected = unsafe { InternetGetConnectedState(&mut flags, 0) != 0 };
    LocalIpInfo {
        local_ipv4,
        adapter_name,
        gateway,
        internet_connected,
    }
}

#[tauri::command]
pub async fn public_ip_info() -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .ok()?;
    let response = client.get("https://api.ipify.org").send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    response
        .text()
        .await
        .ok()?
        .trim()
        .parse::<Ipv4Addr>()
        .ok()
        .map(|address| address.to_string())
}
