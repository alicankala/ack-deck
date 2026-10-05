mod attachments;
mod backup;
mod desktop;
mod files;
mod footer_info;
mod gemini;
mod gemini_models;
mod gemini_tools;
mod ip_info;
mod launch_targets;
mod palette;
mod pc_status;
mod phone;
mod projects;
mod qr;
mod reminders;
mod system_check;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if !args.iter().any(|arg| arg == "--autostart") {
                desktop::show_window(app, None)
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_notification::init())
        .manage(std::sync::Mutex::new(pc_status::PcMonitor::new()))
        .manage(attachments::AttachmentState(std::sync::Mutex::new(
            std::collections::HashMap::new(),
        )))
        .manage(launch_targets::TargetState(std::sync::Mutex::new(())))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(desktop::setup)
        .on_window_event(desktop::window_event)
        .invoke_handler(tauri::generate_handler![
            gemini::gemini_key_status,
            gemini::save_gemini_key,
            gemini::delete_gemini_key,
            gemini::test_gemini_connection,
            gemini::gemini_chat,
            attachments::choose_ai_attachment,
            attachments::paste_ai_image,
            attachments::preview_ai_image,
            attachments::release_ai_attachment,
            projects::open_project_folder,
            projects::open_project_in_vscode,
            pc_status::pc_status,
            qr::save_qr_png,
            ip_info::local_ip_info,
            ip_info::public_ip_info,
            footer_info::footer_rates,
            footer_info::footer_weather,
            files::read_file_entry,
            files::check_file_entries,
            files::access_file_entry,
            launch_targets::choose_launch_target,
            launch_targets::save_url_target,
            launch_targets::open_saved_target,
            launch_targets::reveal_saved_target,
            palette::palette_status,
            palette::get_palette_shortcut,
            palette::get_palette_shortcut_state,
            palette::restore_unregistered_palette_shortcut,
            palette::set_palette_shortcut,
            palette::hide_palette,
            palette::palette_request,
            palette::palette_result,
            desktop::desktop_status,
            desktop::show_main_window,
            desktop::desktop_ready,
            desktop::save_desktop_preferences,
            reminders::sync_task_reminders,
            backup::save_backup,
            backup::choose_backup,
            system_check::system_health,
            phone::phone_status,
            phone::phone_configure,
            phone::phone_request,
            phone::phone_download
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
