use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("ACKDeck/1.1 (Windows)")
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "Bağlantı kurulamadı.".into())
}

fn tag<'a>(text: &'a str, name: &str) -> Option<&'a str> {
    text.split_once(&format!("<{name}>"))?
        .1
        .split_once(&format!("</{name}>"))
        .map(|v| v.0)
}

#[derive(Serialize)]
pub struct Rate {
    code: String,
    buying: f64,
    selling: f64,
}
#[derive(Serialize)]
pub struct Rates {
    date: String,
    rates: Vec<Rate>,
}

fn parse_rates(xml: &str) -> Option<Rates> {
    let date = xml.split_once("Tarih=\"")?.1.split_once('"')?.0.to_owned();
    let mut rates = Vec::new();
    for code in ["USD", "EUR", "GBP"] {
        let block = xml
            .split_once(&format!("CurrencyCode=\"{code}\""))?
            .1
            .split_once("</Currency>")?
            .0;
        let buying: f64 = tag(block, "ForexBuying")?.parse().ok()?;
        let selling: f64 = tag(block, "ForexSelling")?.parse().ok()?;
        if !buying.is_finite() || !selling.is_finite() || buying <= 0.0 || selling <= 0.0 {
            return None;
        }
        rates.push(Rate {
            code: code.into(),
            buying,
            selling,
        });
    }
    Some(Rates { date, rates })
}

#[tauri::command]
pub async fn footer_rates() -> Result<Rates, String> {
    let xml = client()?
        .get("https://www.tcmb.gov.tr/kurlar/today.xml")
        .send()
        .await
        .map_err(|_| "Kurlar alınamadı.")?
        .error_for_status()
        .map_err(|_| "Kurlar alınamadı.")?
        .text()
        .await
        .map_err(|_| "Kurlar alınamadı.")?;
    parse_rates(&xml).ok_or_else(|| "Kurlar alınamadı.".into())
}

#[derive(Serialize)]
pub struct Weather {
    city: String,
    temperature: f64,
    code: u64,
}

#[tauri::command]
pub async fn footer_weather(city: String) -> Result<Weather, String> {
    let city = city.trim();
    if city.is_empty() || city.chars().count() > 80 || city.chars().any(char::is_control) {
        return Err("Geçerli bir şehir girin.".into());
    }
    let client = client()?;
    let geo: Value = client
        .get("https://geocoding-api.open-meteo.com/v1/search")
        .query(&[("name", city), ("count", "1"), ("language", "tr")])
        .send()
        .await
        .map_err(|_| "Hava durumu alınamadı.")?
        .error_for_status()
        .map_err(|_| "Hava durumu alınamadı.")?
        .json()
        .await
        .map_err(|_| "Hava durumu alınamadı.")?;
    let location = geo["results"]
        .as_array()
        .and_then(|items| items.first())
        .ok_or("Şehir bulunamadı. Yazımı kontrol edin.")?;
    let lat = location["latitude"].as_f64().ok_or("Şehir bulunamadı.")?;
    let lon = location["longitude"].as_f64().ok_or("Şehir bulunamadı.")?;
    let data: Value = client
        .get("https://api.open-meteo.com/v1/forecast")
        .query(&[
            ("latitude", lat.to_string()),
            ("longitude", lon.to_string()),
            ("current", "temperature_2m,weather_code".into()),
            ("timezone", "auto".into()),
        ])
        .send()
        .await
        .map_err(|_| "Hava durumu alınamadı.")?
        .error_for_status()
        .map_err(|_| "Hava durumu alınamadı.")?
        .json()
        .await
        .map_err(|_| "Hava durumu alınamadı.")?;
    let temperature = data["current"]["temperature_2m"]
        .as_f64()
        .ok_or("Hava durumu alınamadı.")?;
    let code = data["current"]["weather_code"]
        .as_u64()
        .ok_or("Hava durumu alınamadı.")?;
    Ok(Weather {
        city: location["name"].as_str().unwrap_or(city).into(),
        temperature,
        code,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rates_require_all_three_positive_forex_pairs() {
        let mut xml = String::from("<Tarih_Date Tarih=\"05.10.2026\">");
        for code in ["USD", "EUR", "GBP"] {
            xml.push_str(&format!("<Currency CurrencyCode=\"{code}\"><ForexBuying>40.25</ForexBuying><ForexSelling>40.50</ForexSelling></Currency>"));
        }
        let parsed = parse_rates(&xml).unwrap();
        assert_eq!(parsed.date, "05.10.2026");
        assert_eq!(parsed.rates.len(), 3);
        assert_eq!(parsed.rates[2].selling, 40.50);
        assert!(parse_rates(&xml.replace("40.25", "NaN")).is_none());
        assert!(parse_rates(&xml.replace("GBP", "XXX")).is_none());
        assert!(parse_rates("<html>Servis kullanılamıyor</html>").is_none());
    }
}
