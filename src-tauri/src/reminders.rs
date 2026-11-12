use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};
#[cfg(not(windows))]
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
fn reminder_target(id: &str) -> String {
    if id.starts_with("study:") {
        "study".into()
    } else if id.starts_with("prayer:") || id.starts_with("prayer-lead:") || id == "prayer" {
        "prayer".into()
    } else if let Some(id) = id.strip_prefix("note:") {
        format!("note:{id}")
    } else if let Some(id) = id.strip_prefix("subscription:") {
        format!("subscription:{id}")
    } else if let Some(id) = id.strip_prefix("ai:") {
        format!("ai:{id}")
    } else if let Some(id) = id.strip_prefix("inbox:") {
        format!("inbox:{id}")
    } else if id.starts_with("notice:") || id == "home" {
        "home".into()
    } else {
        format!("task:{id}")
    }
}
#[cfg(windows)]
fn show_reminder(app: &tauri::AppHandle, reminder: &Reminder) -> Result<(), ()> {
    let handle = app.clone();
    let target = reminder_target(&reminder.id);
    tauri_winrt_notification::Toast::new(&app.config().identifier)
        .title("ACKDeck")
        .text1(&reminder.text)
        .on_activated(move |_| {
            crate::desktop::show_window(&handle, Some(&target));
            Ok(())
        })
        .show()
        .map_err(|_| ())
}
#[cfg(not(windows))]
fn show_reminder(app: &tauri::AppHandle, reminder: &Reminder) -> Result<(), ()> {
    app.notification()
        .builder()
        .title("ACKDeck")
        .body(&reminder.text)
        .show()
        .map_err(|_| ())
}
const MAX_TEXT_CHARS: usize = 160;

fn clamp_text(raw: &str, max_chars: usize) -> String {
    let trimmed = raw.trim();
    if max_chars == 0 {
        return String::new();
    }
    if trimmed.chars().count() <= max_chars {
        return trimmed.to_string();
    }
    if max_chars == 1 {
        return trimmed.chars().take(1).collect();
    }
    let prefix: String = trimmed.chars().take(max_chars - 1).collect();
    let mut clamped = prefix.trim_end().to_string();
    clamped.push('…');
    clamped
}

fn normalize_reminders(items: Vec<Reminder>) -> Vec<Reminder> {
    items
        .into_iter()
        .map(|mut item| {
            item.text = clamp_text(&item.text, MAX_TEXT_CHARS);
            item
        })
        .collect()
}

fn validate(items: &[Reminder]) -> bool {
    items.len() <= 10000
        && items.iter().all(|item| {
            !item.id.is_empty()
                && item.id.len() <= 512
                && !item.text.trim().is_empty()
                && item.text.chars().count() <= MAX_TEXT_CHARS
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
                        let is_stale = now_ms().saturating_sub(reminder.due_at) > 15 * 60 * 1000;
                        if is_stale {
                            let _ = persist(&state.path, &queue.delivered);
                            continue;
                        }
                        if persist(&state.path, &queue.delivered).is_err() {
                            queue.delivered.remove(&key);
                            let _ = handle.emit(
                                "ack-reminder-error",
                                "Hatırlatma kaydedilemedi; bildirim gönderilmedi.",
                            );
                        } else if show_reminder(&handle, &reminder).is_ok() {
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
fn sync_reminders_inner(
    state: &ReminderState,
    reminders: Vec<Reminder>,
) -> Result<Vec<String>, String> {
    let reminders = normalize_reminders(reminders);
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
#[tauri::command]
pub fn sync_task_reminders(
    state: tauri::State<Arc<ReminderState>>,
    reminders: Vec<Reminder>,
) -> Result<Vec<String>, String> {
    sync_reminders_inner(&state, reminders)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn notification_targets_keep_record_identity_and_distinguish_payment_from_task() {
        assert_eq!(reminder_target("task-1"), "task:task-1");
        assert_eq!(
            reminder_target("subscription:payment-1"),
            "subscription:payment-1"
        );
    }
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
    #[test]
    fn normalizes_long_unicode_task_alongside_study_prayer_and_subscription_items() {
        let long_text = format!(
            "  📚Vize_Hazırlık_{}{}  ",
            "ğüşiöç".repeat(38),
            "🚀".repeat(10)
        );
        assert!(long_text.trim().chars().count() > 200);

        let raw = vec![
            Reminder {
                id: "task-long".into(),
                text: long_text,
                due_at: 1_800_000_000_000,
            },
            Reminder {
                id: "study:p1:s1".into(),
                text: "Devre 1 · Vize Çalışma Programı".into(),
                due_at: 1_800_000_100_000,
            },
            Reminder {
                id: "prayer:dhuhr:1".into(),
                text: "Öğle vakti girdi (12:45).".into(),
                due_at: 1_800_000_200_000,
            },
            Reminder {
                id: "subscription:sub-1".into(),
                text: "Bulut Depolama ödeme hatırlatması".into(),
                due_at: 1_800_000_300_000,
            },
        ];

        assert!(!validate(&raw));
        let normalized = normalize_reminders(raw);
        assert!(validate(&normalized));
        assert_eq!(normalized.len(), 4);
        assert_eq!(normalized[0].text.chars().count(), 160);
        assert!(normalized[0].text.ends_with('…'));
        assert_eq!(normalized[1].text, "Devre 1 · Vize Çalışma Programı");
        assert_eq!(normalized[2].text, "Öğle vakti girdi (12:45).");
        assert_eq!(normalized[3].text, "Bulut Depolama ödeme hatırlatması");

        assert_eq!(clamp_text("x", 0), "");
        assert_eq!(clamp_text("🚀abc", 1), "🚀");
        assert_eq!(clamp_text(&format!("abc   {}", "x".repeat(20)), 6), "abc…");
    }
    #[test]
    fn sync_reminders_normalizes_long_text_and_rejects_structural_errors_in_turkish() {
        let state = ReminderState {
            inner: Mutex::new(Queue {
                items: vec![],
                delivered: HashSet::new(),
                readable: true,
            }),
            wake: tokio::sync::Notify::new(),
            path: std::path::PathBuf::new(),
        };

        let long_text = format!("📝Sınav_{}", "ğüşiöç🚀".repeat(40));
        let valid_batch = vec![
            Reminder {
                id: "task-250".into(),
                text: long_text,
                due_at: 1_800_000_000_000,
            },
            Reminder {
                id: "study:p1:s1".into(),
                text: "EMD · Haftalık Plan".into(),
                due_at: 1_800_000_100_000,
            },
        ];
        assert!(sync_reminders_inner(&state, valid_batch).is_ok());
        {
            let queue = state.inner.lock().unwrap();
            assert_eq!(queue.items.len(), 2);
            assert_eq!(queue.items[0].text.chars().count(), 160);
            assert!(queue.items[0].text.ends_with('…'));
        }

        let empty_text_err = sync_reminders_inner(
            &state,
            vec![Reminder {
                id: "empty-text".into(),
                text: "   \n\t ".into(),
                due_at: 1_800_000_000_000,
            }],
        )
        .unwrap_err();
        assert_eq!(empty_text_err, "Hatırlatma bilgileri geçersiz.");

        let dup_item = Reminder {
            id: "dup-1".into(),
            text: "Tekrar".into(),
            due_at: 1_800_000_000_000,
        };
        let dup_err = sync_reminders_inner(&state, vec![dup_item.clone(), dup_item]).unwrap_err();
        assert_eq!(dup_err, "Hatırlatma bilgileri geçersiz.");

        let empty_id_err = sync_reminders_inner(
            &state,
            vec![Reminder {
                id: "".into(),
                text: "Geçersiz id".into(),
                due_at: 1_800_000_000_000,
            }],
        )
        .unwrap_err();
        assert_eq!(empty_id_err, "Hatırlatma bilgileri geçersiz.");

        let long_id_err = sync_reminders_inner(
            &state,
            vec![Reminder {
                id: "i".repeat(513),
                text: "Uzun id".into(),
                due_at: 1_800_000_000_000,
            }],
        )
        .unwrap_err();
        assert_eq!(long_id_err, "Hatırlatma bilgileri geçersiz.");

        let overflow_due_err = sync_reminders_inner(
            &state,
            vec![Reminder {
                id: "overflow-due".into(),
                text: "Geçersiz zaman".into(),
                due_at: 8_640_000_000_000_001,
            }],
        )
        .unwrap_err();
        assert_eq!(overflow_due_err, "Hatırlatma bilgileri geçersiz.");
    }
}
