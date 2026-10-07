use serde_json::Value;
fn patterns() -> Vec<regex::Regex> {
    [r"(?is)-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----.*?(?:-----END (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----|$)",
     r"(?i)\bBearer\s+[A-Za-z0-9._~+/\-]{8,}=*", r"\bAIza[\w-]{20,}",
     r"\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b",
     r#"(?i)\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|owner[_-]?secret|password)["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/\-]{8,}"#]
      .iter().map(|pattern| regex::Regex::new(pattern).expect("static privacy pattern")).collect()
}
pub(crate) fn has_credentials(text: &str) -> bool { patterns().iter().any(|pattern| pattern.is_match(text)) }
pub(crate) fn scrub(text: &str) -> String {
    let mut value = text.to_string();
    for pattern in patterns() { value=pattern.replace_all(&value,"[gizli anahtar]").into_owned(); }
    regex::Regex::new(r#"(?:[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/])[^\r\n<>"'|;,]*"#).unwrap().replace_all(&value,"[yerel konum]").into_owned()
}
fn context_value(value: &mut Value) {
    match value {
        Value::String(text) => *text=scrub(text),
        Value::Array(items) => for item in items {context_value(item)},
        Value::Object(items) => { items.retain(|key,_| !["path","target","directory","location"].iter().any(|suffix|key.to_lowercase().ends_with(suffix))); for item in items.values_mut(){context_value(item)} },
        _ => {}
    }
}
pub(crate) fn context(text: &str) -> String {
    if let Ok(mut value)=serde_json::from_str::<Value>(text) {context_value(&mut value);value.to_string()} else {scrub(text)}
}
pub(crate) fn unsafe_sync(value: &Value) -> bool {
    match value { Value::String(text)=>has_credentials(text)||scrub(text)!=*text, Value::Array(items)=>items.iter().any(unsafe_sync), Value::Object(items)=>items.values().any(unsafe_sync), _=>false }
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn preserves_turkish_and_blocks_obvious_credentials() {
        assert_eq!(scrub("Ödeme görevini Çarşamba tamamla"),"Ödeme görevini Çarşamba tamamla");
        assert!(has_credentials("Bearer abcdefghijklmnop"));
        assert!(has_credentials("-----BEGIN PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----"));
        assert!(!has_credentials("Normal Türkçe görev"));
        assert!(!context(&serde_json::json!({"name":"Örnek","folderPath":r"C:\private","target":r"\\server\private"}).to_string()).contains("private"));
    }
}
