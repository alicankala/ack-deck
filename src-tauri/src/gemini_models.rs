use serde::Deserialize;

pub const FAST_MODEL: &str = "gemini-3.5-flash-lite";
pub const POWERFUL_MODEL: &str = "gemini-3.8-flash";

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelChoice {
    Fast,
    Powerful,
}

impl ModelChoice {
    pub fn model_name(&self) -> &'static str {
        match self {
            Self::Fast => FAST_MODEL,
            Self::Powerful => POWERFUL_MODEL,
        }
    }
}
