use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Reminder {
    id: String,
    text: String,
    due_at: u64,
}
impl Reminder {
    fn key(&self) -> String {
        format!("{}|{}", self.id, self.due_at)
    }
}
struct Queue {
    items: Vec<Reminder>,
    delivered: HashSet<String>,
    readable: bool,
}
impl Queue {
    fn replace(&mut self, reminders: Vec<Reminder>) {
        self.items = reminders
            .into_iter()
            .filter(|item| !self.delivered.contains(&item.key()))
            .collect();
    }
}
pub struct ReminderState {
    inner: Mutex<Queue>,
    wake: tokio::sync::Notify,
    path: std::path::PathBuf,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Delivered {
    id: String,
    key: String,
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn validate(items: &[Reminder]) -> bool {
    items.len() <= 10000
        && items.iter().all(|item| {
            !item.id.is_empty()
                && item.id.len() <= 512
                && !item.text.trim().is_empty()
                && item.text.chars().count() <= 160
                && item.due_at <= 8_640_000_000_000_000
        })
        && items
            .iter()
            .map(|item| &item.id)
            .collect::<HashSet<_>>()
            .len()
            == items.len()
}
fn persist(path: &std::path::Path, delivered: &HashSet<String>) -> Result<(), ()> {
    fs::create_dir_all(path.parent().ok_or(())?).map_err(|_| ())?;
    let temp = path.with_extension("tmp");
    fs::write(&temp, serde_json::to_vec(delivered).map_err(|_| ())?).map_err(|_| ())?;
    fs::rename(temp, path).map_err(|_| ())
}
pub fn setup(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let path = app
        .path()
        .app_config_dir()?
        .join("reminder-deliveries.v1.json");
    let (delivered, readable) = match fs::read(&path) {
        Ok(bytes) => match serde_json::from_slice::<HashSet<String>>(&bytes) {
            Ok(value) => (value, true),
            Err(_) => (HashSet::new(), false),
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (HashSet::new(), true),
        Err(_) => (HashSet::new(), false),
    };
    let state = Arc::new(ReminderState {
        inner: Mutex::new(Queue {
            items: vec![],
            delivered,
            readable,
        }),
        wake: tokio::sync::Notify::new(),
        path,
    });
    app.manage(state.clone());
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            let wait = {
                let Ok(mut queue) = state.inner.lock() else {
                    break;
                };
                queue.items.sort_by_key(|item| item.due_at);
                if let Some(first) = queue.items.first() {
                    if first.due_at > now_ms() {
                        Some(Duration::from_millis(
                            first.due_at.saturating_sub(now_ms()).min(60000),
                        ))
                    } else {
                        let reminder = queue.items.remove(0);
                        let key = reminder.key();
                        if queue.delivered.contains(&key) {
                            continue;
                        }
                        // Persist the delivery claim before dispatch, preventing duplicates after restart.
                        queue.delivered.insert(key.clone());
                        if persist(&state.path, &queue.delivered).is_err() {
                            queue.delivered.remove(&key);
                            let _ = handle.emit(
                                "ack-reminder-error",
                                "Hatırlatma kaydedilemedi; bildirim gönderilmedi.",
                            );
                        } else if handle
                            .notification()
                            .builder()
                            .title("ACKDeck")
                            .body(&reminder.text)
                            .show()
                            .is_ok()
                        {
                            let _ = handle.emit(
                                "ack-reminder-delivered",
                                Delivered {
                                    id: reminder.id,
                                    key,
                                },
                            );
                        } else {
                            let _ = handle
                                .emit("ack-reminder-error", "Windows bildirimi hazırlanamadı.");
                        }
                        Some(Duration::ZERO)
                    }
                } else {
                    None
                }
            };
            match wait {
                Some(duration) if duration.is_zero() => continue,
                Some(duration) => {
                    let _ = tokio::time::timeout(duration, state.wake.notified()).await;
                }
                None => state.wake.notified().await,
            }
        }
    });
    Ok(())
}
#[tauri::command]
pub fn sync_task_reminders(
    state: tauri::State<Arc<ReminderState>>,
    reminders: Vec<Reminder>,
) -> Result<Vec<String>, String> {
    if !validate(&reminders) {
        return Err("Hatırlatma bilgileri geçersiz.".into());
    }
    let mut queue = state
        .inner
        .lock()
        .map_err(|_| "Hatırlatmalara erişilemedi.")?;
    if !queue.readable {
        return Err("Hatırlatma geçmişi okunamadı. Mevcut kayıtlar korunuyor.".into());
    }
    queue.replace(reminders);
    let delivered = queue.delivered.iter().cloned().collect();
    state.wake.notify_one();
    Ok(delivered)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replacing_queue_cancels_removed_tasks_and_delivery_history_suppresses_duplicates() {
        let sent = Reminder {
            id: "sent".into(),
            text: "Sent".into(),
            due_at: 100,
        };
        let pending = Reminder {
            id: "pending".into(),
            text: "Pending".into(),
            due_at: 200,
        };
        let persisted = serde_json::to_vec(&HashSet::from([sent.key()])).unwrap();
        let mut queue = Queue {
            items: vec![],
            delivered: serde_json::from_slice(&persisted).unwrap(),
            readable: true,
        };
        queue.replace(vec![sent.clone(), pending.clone()]);
        assert_eq!(queue.items.len(), 1);
        assert_eq!(queue.items[0].id, "pending");
        queue.replace(vec![]);
        assert!(queue.items.is_empty());
        queue.replace(vec![Reminder {
            due_at: 300,
            ..sent
        }]);
        assert_eq!(queue.items.len(), 1);
        assert_eq!(queue.items[0].due_at, 300);
    }
    #[test]
    fn validates_reminders_and_identity_changes_with_due_time() {
        let item = Reminder {
            id: "task".into(),
            text: "Local reminder".into(),
            due_at: 123,
        };
        assert!(validate(std::slice::from_ref(&item)));
        assert!(!validate(&[item.clone(), item.clone()]));
        assert_ne!(
            item.key(),
            Reminder {
                due_at: 124,
                ..item
            }
            .key()
        );
        assert!(!validate(&[Reminder {
            id: "".into(),
            text: "x".into(),
            due_at: 0
        }]));
    }
}
