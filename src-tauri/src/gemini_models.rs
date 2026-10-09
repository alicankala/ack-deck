use serde::{Deserialize, Serialize};
use tauri::Manager;

pub const FAST_MODEL: &str = "gemini-3.5-flash-lite";
pub const POWERFUL_MODEL: &str = "gemini-3.8-flash";

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelChoice {
    Fast,
    Powerful,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelSettings {
    pub fast: String,
    pub powerful: String,
}
impl Default for ModelSettings {
    fn default() -> Self {
        Self {
            fast: FAST_MODEL.into(),
            powerful: POWERFUL_MODEL.into(),
        }
    }
}
pub fn valid_model(value: &str) -> bool {
    value.starts_with("gemini-")
        && value.len() > 7
        && value.len() <= 100
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-._".contains(&b))
}
fn settings_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|_| "Model ayarları okunamadı.")?
        .join("gemini-models.v1.json"))
}
#[tauri::command]
pub fn get_gemini_models(app: tauri::AppHandle) -> Result<ModelSettings, String> {
    match std::fs::read(settings_path(&app)?) {
        Ok(bytes) => serde_json::from_slice::<ModelSettings>(&bytes)
            .ok()
            .filter(|v| valid_model(&v.fast) && valid_model(&v.powerful))
            .ok_or_else(|| "Model ayarları okunamadı.".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(ModelSettings::default()),
        Err(_) => Err("Model ayarları okunamadı.".into()),
    }
}
#[tauri::command]
pub fn save_gemini_models(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    settings: ModelSettings,
) -> Result<(), String> {
    if window.label() != "main" || !valid_model(&settings.fast) || !valid_model(&settings.powerful)
    {
        return Err("Geçerli bir Gemini model adı girin.".into());
    }
    let path = settings_path(&app)?;
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|_| "Model ayarları kaydedilemedi.")?;
    let temp = path.with_extension("tmp");
    std::fs::write(
        &temp,
        serde_json::to_vec(&settings).map_err(|_| "Model ayarları kaydedilemedi.")?,
    )
    .and_then(|_| std::fs::rename(temp, path))
    .map_err(|_| "Model ayarları kaydedilemedi.".into())
}
pub fn selected(app: &tauri::AppHandle, choice: &ModelChoice) -> Result<String, String> {
    let settings = get_gemini_models(app.clone())?;
    Ok(match choice {
        ModelChoice::Fast => settings.fast,
        ModelChoice::Powerful => settings.powerful,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn model_ids_cannot_change_endpoint_or_include_credentials() {
        assert!(valid_model("gemini-3.8-flash"));
        for name in [
            "models/gemini-3.8-flash",
            "gemini-x?key=x",
            "gemini-x/../x",
            "https://evil",
            "gemini-x\n",
        ] {
            assert!(!valid_model(name));
        }
        assert!(serde_json::from_str::<ModelSettings>(
            r#"{"fast":"gemini-x","powerful":"gemini-y","key":"secret"}"#
        )
        .is_err());
    }
}
