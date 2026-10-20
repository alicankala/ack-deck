use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

#[derive(Serialize)]
pub struct GeoLocation {
    pub city: String,
    pub latitude: f64,
    pub longitude: f64,
}

#[tauri::command]
pub async fn geocode_city(city: String) -> Result<GeoLocation, String> {
    let city = city.trim();
    if city.is_empty() || city.chars().count() > 80 || city.chars().any(char::is_control) {
        return Err("Geçerli bir şehir girin.".into());
    }
    let client = reqwest::Client::builder()
        .user_agent("ACKDeck/1.1 (Windows)")
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "Bağlantı kurulamadı.".to_string())?;

    let geo: Value = client
        .get("https://geocoding-api.open-meteo.com/v1/search")
        .query(&[("name", city), ("count", "1"), ("language", "tr")])
        .send()
        .await
        .map_err(|_| "Konum servisine ulaşılamadı.".to_string())?
        .error_for_status()
        .map_err(|_| "Konum servisine ulaşılamadı.".to_string())?
        .json()
        .await
        .map_err(|_| "Konum yanıtı okunamadı.".to_string())?;

    let location = geo["results"]
        .as_array()
        .and_then(|items| items.first())
        .ok_or("Şehir bulunamadı. Yazımı kontrol edin.")?;

    let latitude = location["latitude"].as_f64().ok_or("Konum bilgisi eksik.")?;
    let longitude = location["longitude"].as_f64().ok_or("Konum bilgisi eksik.")?;
    let found_name = location["name"].as_str().unwrap_or(city).to_string();

    Ok(GeoLocation {
        city: found_name,
        latitude,
        longitude,
    })
}
