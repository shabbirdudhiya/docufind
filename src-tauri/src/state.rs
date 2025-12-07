//! Application state management
//!
//! Central state for the application including:
//! - File index (in-memory)
//! - SQLite FTS5 search index
//! - Folder tracking
//! - Search history

use rusqlite::Connection;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

use crate::models::FileData;
use crate::search::SearchHistory;

/// Main application state
pub struct AppState {
    /// In-memory file index
    pub index: Arc<RwLock<Vec<FileData>>>,

    /// Folders being watched/indexed
    pub watched_folders: Mutex<HashSet<String>>,

    /// Folders excluded from search results
    pub excluded_folders: Mutex<HashSet<String>>,

    /// File system watcher
    pub watcher: Mutex<Option<notify::RecommendedWatcher>>,

    /// SQLite database connection for persistence and FTS5 search
    pub db: Mutex<Option<Connection>>,

    /// App data directory path
    pub data_dir: Mutex<Option<PathBuf>>,

    /// Search history
    pub search_history: Mutex<SearchHistory>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            index: Arc::new(RwLock::new(Vec::new())),
            watched_folders: Mutex::new(HashSet::new()),
            excluded_folders: Mutex::new(HashSet::new()),
            watcher: Mutex::new(None),
            db: Mutex::new(None),
            data_dir: Mutex::new(None),
            search_history: Mutex::new(SearchHistory::new()),
        }
    }
}

impl AppState {
    /// Get data directory path
    pub fn get_data_dir(&self) -> Option<PathBuf> {
        self.data_dir.lock().ok()?.clone()
    }

    /// Set data directory path
    pub fn set_data_dir(&self, path: PathBuf) -> Result<(), String> {
        let mut dir = self.data_dir.lock().map_err(|e| e.to_string())?;
        *dir = Some(path);
        Ok(())
    }

    /// Check if a path is in an excluded folder
    pub fn is_path_excluded(&self, path: &str) -> bool {
        if let Ok(excluded) = self.excluded_folders.lock() {
            return excluded.iter().any(|excl| path.starts_with(excl));
        }
        false
    }

    /// Get count of files in a specific folder
    pub fn get_folder_file_count(&self, folder_path: &str) -> usize {
        if let Ok(index) = self.index.read() {
            let prefix = if folder_path.ends_with(std::path::MAIN_SEPARATOR) {
                folder_path.to_string()
            } else {
                format!("{}{}", folder_path, std::path::MAIN_SEPARATOR)
            };
            return index.iter().filter(|f| f.path.starts_with(&prefix)).count();
        }
        0
    }
}
