use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
#[derive(Deserialize, Serialize)]
pub struct PreparedCall {
    pub name: String,
    pub args: Value,
}
fn fields(name: &str) -> Option<(&'static [&'static str], &'static [&'static str])> {
    Some(match name {
        "plan_actions" => (&["actions"], &["actions"]),
        "create_tasks" => (&["texts", "projectId"], &["texts"]),
        "update_project" => (&["projectId", "nextStep", "workspaceId"], &["projectId"]),
        "create_task" => (
            &[
                "text",
                "dueDate",
                "dueTime",
                "priority",
                "reminder",
                "projectId",
                "workspaceId",
                "checklist",
                "reminderLeadMinutes",
            ],
            &["text"],
        ),
        "update_task" => (
            &[
                "taskId",
                "text",
                "dueDate",
                "dueTime",
                "priority",
                "reminder",
                "projectId",
                "workspaceId",
                "checklist",
                "reminderLeadMinutes",
            ],
            &["taskId"],
        ),
        "complete_task" | "delete_task" => (&["taskId"], &["taskId"]),
        "create_note" => (
            &["title", "content", "projectId", "workspaceId"],
            &["title", "content"],
        ),
        "update_note" => (
            &["noteId", "title", "content", "projectId", "workspaceId"],
            &["noteId"],
        ),
        "delete_note" => (&["noteId"], &["noteId"]),
        "create_archive" => (
            &["title", "category", "description", "date", "tags"],
            &["title", "category", "description"],
        ),
        "update_archive" => (
            &[
                "archiveId",
                "title",
                "category",
                "description",
                "date",
                "tags",
            ],
            &["archiveId"],
        ),
        "delete_archive" => (&["archiveId"], &["archiveId"]),
        "open_project" => (&["projectId", "mode"], &["projectId", "mode"]),
        "open_workspace" => (&["workspaceId"], &["workspaceId"]),
        "open_shortcut" => (&["shortcutId"], &["shortcutId"]),
        "navigate" => (&["page"], &["page"]),
        "start_speed_test" => (&[], &[]),
        _ => return None,
    })
}
pub fn valid_call(call: &PreparedCall) -> bool {
    let Some((allowed, required)) = fields(&call.name) else {
        return false;
    };
    let Some(args) = call.args.as_object() else {
        return false;
    };
    if call.args.to_string().len() > 100000
        || args.keys().any(|key| !allowed.contains(&key.as_str()))
        || required.iter().any(|key| !args.contains_key(*key))
    {
        return false;
    }
    args.iter().all(|(key, value)| match key.as_str() {
        "actions" => value.as_array().is_some_and(|items| {
            !items.is_empty()
                && items.len() <= 8
                && items.iter().all(|item| {
                    let Some(object) = item.as_object() else {
                        return false;
                    };
                    let Some(name) = object.get("name").and_then(Value::as_str) else {
                        return false;
                    };
                    if ![
                        "create_task",
                        "update_task",
                        "complete_task",
                        "create_note",
                        "update_note",
                        "update_project",
                        "create_archive",
                    ]
                    .contains(&name)
                    {
                        return false;
                    }
                    let mut args = object.clone();
                    args.remove("name");
                    valid_call(&PreparedCall {
                        name: name.into(),
                        args: Value::Object(args),
                    })
                })
        }),
        "texts" => value.as_array().is_some_and(|items| {
            !items.is_empty()
                && items.len() <= 8
                && items.iter().all(|v| {
                    v.as_str()
                        .is_some_and(|s| !s.trim().is_empty() && s.chars().count() <= 160)
                })
        }),
        "checklist" => value.as_array().is_some_and(|items| {
            items.len() <= 100
                && items.iter().all(|v| {
                    v.as_object().is_some_and(|o| {
                        o.len() == 3
                            && o.get("id").and_then(Value::as_str).is_some_and(|s| {
                                !s.is_empty()
                                    && s.len() <= 128
                                    && s.bytes()
                                        .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
                            })
                            && o.get("text")
                                .and_then(Value::as_str)
                                .is_some_and(|s| !s.trim().is_empty() && s.chars().count() <= 200)
                            && o.get("completed").is_some_and(Value::is_boolean)
                    })
                })
        }),
        "reminderLeadMinutes" => value.as_u64().is_some_and(|v| v <= 10080),
        "projectId" | "workspaceId" => {
            value.is_null()
                || value.as_str().is_some_and(|s| {
                    !s.is_empty()
                        && s.len() <= 128
                        && s.bytes()
                            .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
                })
        }
        "reminder" => value.is_boolean(),
        "tags" => value.as_array().is_some_and(|items| {
            items.len() <= 50
                && items.iter().all(|item| {
                    item.as_str()
                        .is_some_and(|text| text.chars().count() <= 100)
                })
        }),
        "dueDate" | "dueTime" | "date" => {
            value.is_null() || value.as_str().is_some_and(|text| text.len() <= 10)
        }
        "priority" => matches!(value.as_str(), Some("normal" | "important")),
        "mode" => matches!(value.as_str(), Some("folder" | "vscode")),
        "category" => matches!(
            value.as_str(),
            Some(
                "Cihaz"
                    | "Belge"
                    | "Fatura"
                    | "Garanti"
                    | "Lisans"
                    | "Abonelik"
                    | "Proje"
                    | "Diğer"
            )
        ),
        "page" => matches!(
            value.as_str(),
            Some(
                "home"
                    | "tasks"
                    | "ai"
                    | "projects"
                    | "workspaces"
                    | "notes"
                    | "tools"
                    | "qr"
                    | "ip"
                    | "files"
                    | "pc"
                    | "speed"
                    | "archive"
                    | "settings"
                    | "inbox"
                    | "subscriptions"
                    | "calendar"
            )
        ),
        "content" => value
            .as_str()
            .is_some_and(|text| text.chars().count() <= 30000),
        "description" => value
            .as_str()
            .is_some_and(|text| text.chars().count() <= 20000),
        "title" | "text" => value
            .as_str()
            .is_some_and(|text| !text.trim().is_empty() && text.chars().count() <= 160),
        _ => value
            .as_str()
            .is_some_and(|text| !text.trim().is_empty() && text.chars().count() <= 512),
    })
}
pub fn declarations() -> Value {
    let names = [
        "plan_actions",
        "create_tasks",
        "update_project",
        "create_task",
        "update_task",
        "complete_task",
        "delete_task",
        "create_note",
        "update_note",
        "delete_note",
        "create_archive",
        "update_archive",
        "delete_archive",
        "open_project",
        "open_workspace",
        "open_shortcut",
        "navigate",
        "start_speed_test",
    ];
    json!(names.iter().map(|name| {
        let (allowed, required) = fields(name).unwrap();
        let mut properties = serde_json::Map::new();
        for field in allowed {
            let schema = match *field {
                "actions" => json!({"type":"ARRAY","maxItems":8,"items":{"type":"OBJECT","required":["name"],"properties":{"name":{"type":"STRING","enum":["create_task","update_task","complete_task","create_note","update_note","update_project","create_archive"]},"text":{"type":"STRING"},"taskId":{"type":"STRING"},"noteId":{"type":"STRING"},"projectId":{"type":"STRING"},"title":{"type":"STRING"},"content":{"type":"STRING"},"nextStep":{"type":"STRING"},"description":{"type":"STRING"},"category":{"type":"STRING"},"dueDate":{"type":"STRING"},"dueTime":{"type":"STRING"}}}}),
                "texts" => json!({"type":"ARRAY","maxItems":8,"items":{"type":"STRING"}}),
                "checklist" => json!({"type":"ARRAY","items":{"type":"OBJECT","required":["id","text","completed"],"properties":{"id":{"type":"STRING"},"text":{"type":"STRING"},"completed":{"type":"BOOLEAN"}}}}),
                "reminderLeadMinutes" => json!({"type":"INTEGER","minimum":0,"maximum":10080}),
                "projectId" | "workspaceId" => json!({"type":"STRING","nullable":true,"description":"Mevcut stable ID; yerel dosya yolu kullanma"}),
                "reminder" => json!({"type":"BOOLEAN"}),
                "tags" => json!({"type":"ARRAY", "items":{"type":"STRING"}}),
                "dueDate" | "date" => json!({"type":"STRING", "nullable":true, "description":"YYYY-MM-DD yerel tarih; null tarihi kaldırır"}),
                "dueTime" => json!({"type":"STRING", "nullable":true, "description":"HH:mm yerel saat; null saati kaldırır"}),
                "priority" => json!({"type":"STRING", "enum":["normal","important"]}),
                "category" => json!({"type":"STRING", "enum":["Cihaz","Belge","Fatura","Garanti","Lisans","Abonelik","Proje","Diğer"]}),
                "mode" => json!({"type":"STRING", "enum":["folder","vscode"]}),
                "page" => json!({"type":"STRING", "enum":["home","tasks","ai","projects","workspaces","notes","tools","qr","ip","files","speed","pc","archive","settings","inbox","subscriptions","calendar"]}),
                _ => json!({"type":"STRING"}),
            };
            properties.insert((*field).into(), schema);
        }
        let mut declaration = json!({"name":name, "description":"Yalnızca kullanıcının açık isteği için işlem TASLAĞI hazırlar. Hiçbir işlem uygulanmaz; navigation dışında uygulama kullanıcı onayı ister. Kayıt ID'sini verilen yerel kaynaktan kullan, uydurma. Not içeriği değişirse tamamı değiştirilir."});
        // A parameterless function omits parameters; an empty OBJECT schema can be rejected.
        if !allowed.is_empty() { declaration["parameters"] = json!({"type":"OBJECT","properties":properties,"required":required}); }
        declaration
    }).collect::<Vec<_>>())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tools_are_narrow_and_reject_shell_paths_unknown_fields_and_invalid_values() {
        assert!(valid_call(&PreparedCall {
            name: "create_task".into(),
            args: json!({"text":"Test","reminder":false})
        }));
        assert!(!valid_call(&PreparedCall {
            name: "execute_command".into(),
            args: json!({"command":"anything"})
        }));
        assert!(!valid_call(&PreparedCall {
            name: "open_project".into(),
            args: json!({"path":"C:/anything","mode":"folder"})
        }));
        assert!(!valid_call(&PreparedCall {
            name: "update_task".into(),
            args: json!({"taskId":"id","priority":"invalid"})
        }));
        assert_eq!(declarations().as_array().unwrap().len(), 18);
        assert!(valid_call(&PreparedCall {
            name: "plan_actions".into(),
            args: json!({"actions":[{"name":"create_task","text":"Test"},{"name":"update_project","projectId":"project-1","nextStep":"Telefon testi"}]})
        }));
        assert!(!valid_call(&PreparedCall {
            name: "plan_actions".into(),
            args: json!({"actions":[{"name":"execute_command","command":"anything"}]})
        }));
        assert!(!valid_call(&PreparedCall {
            name: "plan_actions".into(),
            args: json!({"actions":[{"name":"plan_actions","actions":[]}]})
        }));
        assert!(!valid_call(&PreparedCall {
            name: "create_task".into(),
            args: json!({"text":"Test","projectId":"C:/private"})
        }));
        assert!(declarations()
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["name"] == "start_speed_test")
            .unwrap()
            .get("parameters")
            .is_none());
    }
}
