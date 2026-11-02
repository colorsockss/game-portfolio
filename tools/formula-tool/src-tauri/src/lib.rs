mod commands;
mod files;
mod preview;
mod project;
mod recent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::create_project,
            commands::read_project,
            commands::write_project,
            commands::list_recent_projects,
            commands::remove_recent_project,
            commands::write_text_file,
            commands::run_preview,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
