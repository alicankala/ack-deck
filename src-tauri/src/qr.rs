use std::path::PathBuf;

const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

#[tauri::command]
pub fn save_qr_png(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let destination = PathBuf::from(path);
    if !destination.is_absolute()
        || !destination
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("png"))
        || bytes.len() > 4_000_000
        || !bytes.starts_with(PNG_SIGNATURE)
    {
        return Err("Geçerli bir PNG dosyası seçin.".to_string());
    }
    std::fs::write(destination, bytes).map_err(|_| "PNG kaydedilemedi.".to_string())
}
