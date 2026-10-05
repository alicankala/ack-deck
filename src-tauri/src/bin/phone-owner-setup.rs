use std::io::Write;
use std::process::{Command, Stdio};
fn setup() -> Result<(), String> {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or("Proje konumu bulunamadı.")?;
    let wrangler = root.join("cloud/node_modules/wrangler/bin/wrangler.js");
    if !wrangler.is_file() {
        return Err("Önce npm install --prefix cloud çalıştırın.".into());
    }
    let entry = keyring::Entry::new("com.alican.ackdeck", "phone-owner")
        .map_err(|_| "Windows kimlik bilgilerine erişilemedi.")?;
    let secret = match entry.get_password() {
        Ok(value) => value,
        Err(keyring::Error::NoEntry) => {
            let mut bytes = [0u8; 32];
            getrandom::fill(&mut bytes).map_err(|_| "Güvenli anahtar oluşturulamadı.")?;
            let value = bytes
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>();
            entry
                .set_password(&value)
                .map_err(|_| "Anahtar güvenli depoya kaydedilemedi.")?;
            value
        }
        Err(_) => return Err("Windows kimlik bilgilerine erişilemedi.".into()),
    };
    let mut child = Command::new("node")
        .arg(wrangler)
        .args(["secret", "put", "OWNER_SECRET"])
        .current_dir(root.join("cloud"))
        .env("WRANGLER_SEND_METRICS", "false")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "Wrangler başlatılamadı.")?;
    child
        .stdin
        .take()
        .ok_or("Güvenli giriş hazırlanamadı.")?
        .write_all(format!("{secret}\n").as_bytes())
        .map_err(|_| "Anahtar sunucuya aktarılamadı.")?;
    if !child
        .wait()
        .map_err(|_| "Wrangler tamamlanamadı.")?
        .success()
    {
        return Err("Anahtar sunucuya kaydedilemedi. Önce Cloudflare girişini ve Worker dağıtımını tamamlayın. Yerel anahtar güvenli depoda korunuyor.".into());
    }
    Ok(())
}
async fn verify(url: String, device: Option<String>) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "Sunucu adresi geçersiz.")?;
    if parsed.scheme() != "https"
        || !parsed
            .host_str()
            .is_some_and(|host| host.ends_with(".workers.dev"))
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.path() != "/"
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err("Güvenli workers.dev adresi gereklidir.".into());
    }
    let secret = keyring::Entry::new("com.alican.ackdeck", "phone-owner")
        .map_err(|_| "Güvenli depoya erişilemedi.")?
        .get_password()
        .map_err(|_| "Telefon sahibi anahtarı bulunamadı.")?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|_| "Bağlantı hazırlanamadı.")?;
    let endpoint = format!("{}/api/status", url.trim_end_matches('/'));
    let denied = client
        .get(&endpoint)
        .send()
        .await
        .map_err(|_| "Sunucuya ulaşılamadı.")?;
    if denied.status().as_u16() != 401 {
        return Err("Yetkisiz erişim kontrolü başarısız.".into());
    }
    let response = client
        .get(&endpoint)
        .bearer_auth(&secret)
        .send()
        .await
        .map_err(|_| "Sunucuya ulaşılamadı.")?;
    if !response.status().is_success() {
        return Err("Sahip kimlik doğrulaması başarısız.".into());
    }
    let body = response
        .text()
        .await
        .map_err(|_| "Sunucu yanıtı okunamadı.")?;
    if body.len() > 65536 || body.contains(&secret) {
        return Err("Sunucu yanıtı güvenli değil.".into());
    }
    let value: serde_json::Value =
        serde_json::from_str(&body).map_err(|_| "Sunucu yanıtı geçersiz.")?;
    if value
        .get("vapidPublicKey")
        .and_then(|v| v.as_str())
        .is_none_or(|v| v.len() != 87)
    {
        return Err("VAPID yapılandırması doğrulanamadı.".into());
    }
    if let Some(device_id) = device {
        let result = client
            .post(format!(
                "{}/api/push/test-device",
                url.trim_end_matches('/')
            ))
            .bearer_auth(&secret)
            .json(&serde_json::json!({"deviceId":device_id}))
            .send()
            .await
            .map_err(|_| "Push test bağlantısı başarısız.")?;
        let status = result.status();
        let body: serde_json::Value = result.json().await.map_err(|_| "Push yanıtı okunamadı.")?;
        let code = body
            .get("code")
            .and_then(|v| v.as_str())
            .unwrap_or(if status.is_success() {
                "PUSH_ACCEPTED"
            } else {
                "PUSH_FAILED"
            });
        let safe: String = code
            .chars()
            .filter(|c| c.is_ascii_uppercase() || *c == '_')
            .take(64)
            .collect();
        let _ = writeln!(
            std::io::stdout(),
            "Push test HTTP {} · {}",
            status.as_u16(),
            safe
        );
        if !status.is_success() {
            return Err("Canlı push testi başarısız; güvenli sunucu kodunu inceleyin.".into());
        }
    }
    let _ = writeln!(std::io::stdout(), "Canlı API hazır: yetkisiz erişim reddedildi, sahip anahtarı doğrulandı, VAPID açık anahtarı hazır. Gizli değer gösterilmedi.");
    Ok(())
}
fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = if args
        .first()
        .is_some_and(|arg| arg == "--verify" || arg == "--test-push")
    {
        match args.get(1) {
            Some(url) => tauri::async_runtime::block_on(verify(
                url.clone(),
                if args.first().is_some_and(|arg| arg == "--test-push") {
                    args.get(2).cloned()
                } else {
                    None
                },
            )),
            None => Err("Doğrulama için workers.dev adresini belirtin.".into()),
        }
    } else {
        setup()
    };
    match result {
        Ok(()) => {
            if args.is_empty() {
                let _ = writeln!(std::io::stdout(), "Telefon sahibi anahtarı Worker secret ve Windows Credential Manager içinde hazır. Anahtar görüntülenmedi.");
            }
        }
        Err(error) => {
            let _ = writeln!(std::io::stderr(), "{error}");
            std::process::exit(1);
        }
    }
}
