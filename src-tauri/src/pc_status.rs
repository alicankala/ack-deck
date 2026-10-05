use serde::Serialize;
use std::sync::Mutex;
use sysinfo::{Disks, System};
use tauri::State;
use windows_sys::Win32::Networking::WinInet::InternetGetConnectedState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PcSnapshot {
    cpu_percent: Option<f32>,
    ram_used_bytes: Option<u64>,
    ram_total_bytes: Option<u64>,
    disk_used_bytes: Option<u64>,
    disk_total_bytes: Option<u64>,
    disk_free_bytes: Option<u64>,
    network_connected: bool,
}

pub struct PcMonitor {
    system: System,
    disks: Disks,
    cpu_ready: bool,
}

impl PcMonitor {
    pub fn new() -> Self {
        Self {
            system: System::new(),
            disks: Disks::new_with_refreshed_list(),
            cpu_ready: false,
        }
    }

    fn snapshot(&mut self) -> PcSnapshot {
        self.system.refresh_cpu_usage();
        self.system.refresh_memory();
        self.disks.refresh(false);

        let cpu_percent = if self.cpu_ready {
            Some(self.system.global_cpu_usage().clamp(0.0, 100.0))
        } else {
            self.cpu_ready = true;
            None
        };

        let ram_total = self.system.total_memory();
        let (ram_used_bytes, ram_total_bytes) = if ram_total > 0 {
            (Some(self.system.used_memory()), Some(ram_total))
        } else {
            (None, None)
        };

        let drive = std::env::var("SystemDrive").ok();
        let disk = drive.as_deref().and_then(|drive| {
            self.disks.list().iter().find(|disk| {
                disk.mount_point()
                    .to_string_lossy()
                    .trim_end_matches(['\\', '/'])
                    .eq_ignore_ascii_case(drive)
            })
        });
        let (disk_used_bytes, disk_total_bytes, disk_free_bytes) = match disk {
            Some(disk) if disk.total_space() > 0 => {
                let total = disk.total_space();
                let free = disk.available_space();
                (Some(total.saturating_sub(free)), Some(total), Some(free))
            }
            _ => (None, None, None),
        };

        let mut flags = 0;
        // Windows reports whether a local internet connection is available; no probe is sent.
        let network_connected = unsafe { InternetGetConnectedState(&mut flags, 0) != 0 };

        PcSnapshot {
            cpu_percent,
            ram_used_bytes,
            ram_total_bytes,
            disk_used_bytes,
            disk_total_bytes,
            disk_free_bytes,
            network_connected,
        }
    }
}

#[tauri::command]
pub fn pc_status(monitor: State<'_, Mutex<PcMonitor>>) -> Result<PcSnapshot, String> {
    let mut monitor = monitor
        .lock()
        .map_err(|_| "PC durumu alınamadı.".to_string())?;
    Ok(monitor.snapshot())
}

#[cfg(test)]
mod tests {
    use super::PcMonitor;

    #[test]
    fn reads_windows_memory_disk_and_cpu() {
        let mut monitor = PcMonitor::new();
        let first = monitor.snapshot();
        assert!(first.ram_total_bytes.is_some_and(|bytes| bytes > 0));
        assert!(first.disk_total_bytes.is_some_and(|bytes| bytes > 0));
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
        let second = monitor.snapshot();
        assert!(second
            .cpu_percent
            .is_some_and(|value| (0.0..=100.0).contains(&value)));
    }
}
