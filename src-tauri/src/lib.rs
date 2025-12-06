//! DocuFind - Fast Document Search Engine
//! 
//! A Tauri-based desktop application for indexing and searching
//! documents (DOCX, PPTX, XLSX, TXT, MD) with blazing fast
//! full-text search powered by Tantivy.
//! 
//! ## Architecture
//! 
//! - `models` - Data structures (FileData, SearchResult, etc.)
//! - `extractors` - Document content extraction (docx, pptx, xlsx, txt)
//! - `search` - Search functionality (Tantivy, direct search, query parsing)
//! - `state` - Application state management
//! - `commands` - Tauri command handlers
//! - `folders` - Folder tree management for exclusion UI

pub mod models;
pub mod extractors;
pub mod search;
pub mod state;
pub mod commands;
pub mod folders;

use state::AppState;
use tauri::Manager;

// Re-export commonly used types
pub use models::{FileData, SearchResult, FolderInfo, IndexingProgress};
pub use state::AppState as DocuFindState;

/// File watching functionality
mod watcher;
pub use watcher::{start_watching, stop_watching};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            // Scanning
            commands::scan_folder,
            commands::remove_folder,
            commands::get_indexed_folders,
            
            // Search
            commands::search_index,
            commands::get_index_stats,
            commands::get_all_files,
            commands::get_search_history,
            commands::clear_search_history,
            commands::remove_from_search_history,
            
            // Files
            commands::extract_file_content,
            commands::extract_file_content_structured,
            commands::delete_file,
            commands::open_file,
            commands::open_file_and_search,
            commands::show_in_folder,
            
            // Folders
            commands::get_folder_tree,
            commands::add_excluded_folder,
            commands::remove_excluded_folder,
            commands::toggle_folder_exclusion,
            commands::get_excluded_folders,
            commands::exclude_folders_batch,
            commands::include_folders_batch,
            
            // Persistence
            commands::save_index,
            commands::load_index,
            commands::clear_index,
            commands::scan_for_new_doc_files,
            
            // Watching
            start_watching,
            stop_watching,
        ])
        .setup(|app| {
            // Initialize data directory for persistence
            if let Some(data_dir) = app.path().app_data_dir().ok() {
                let state = app.state::<AppState>();
                if let Ok(mut dir) = state.data_dir.lock() {
                    *dir = Some(data_dir.clone());
                };
            }
            
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Warn) // Only warnings/errors, no Tantivy noise
                        .build(),
                )?;
            }
            app.handle().plugin(tauri_plugin_fs::init())?;
            app.handle().plugin(tauri_plugin_shell::init())?;
            app.handle().plugin(tauri_plugin_dialog::init())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
