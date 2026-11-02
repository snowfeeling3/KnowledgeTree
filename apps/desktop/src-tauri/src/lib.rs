mod commands;
mod config;
mod library_session;
mod lifecycle;
mod updates;

use std::sync::Mutex;

pub struct AppState {
    pub library: Mutex<lifecycle::Session>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    let builder = if std::env::var_os("KNOWLEDGE_TREE_CONFIG_DIR").is_none() {
        builder.plugin(tauri_plugin_window_state::Builder::default().build())
    } else {
        builder
    };
    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            lifecycle::setup(app)?;
            updates::setup(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            lifecycle::startup_status,
            lifecycle::choose_folder,
            lifecycle::configure_library,
            lifecycle::save_preferences,
            lifecycle::create_backup,
            updates::update_status,
            updates::check_update,
            updates::download_update,
            updates::install_update,
            updates::cancel_install,
            commands::library_root,
            commands::list_subjects,
            commands::create_subject,
            commands::list_stages,
            commands::create_stage,
            commands::update_stage,
            commands::delete_stage,
            commands::list_nodes,
            commands::create_node,
            commands::update_node,
            commands::update_node_facts,
            commands::delete_node,
            commands::delete_node_undoable,
            commands::restore_node,
            commands::list_relations,
            commands::create_relation,
            commands::delete_relation,
            commands::read_document,
            commands::write_document,
            commands::search_nodes,
            commands::layout_subject,
            commands::subject_history,
            commands::subject_diff,
            commands::validate_import
        ])
        .run(tauri::generate_context!())
        .expect("Knowledge Tree 启动失败");
}
