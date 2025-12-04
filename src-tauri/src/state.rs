//! Application state management
//! 
//! Central state for the application including:
//! - File index (in-memory)
//! - Tantivy search index
//! - Folder tracking
//! - Background PDF processing queue
//! - Search history

use std::collections::HashSet;
use std::sync::{Mutex, RwLock};
use std::path::PathBuf;
use rusqlite::Connection;
use tantivy::{Index, IndexReader, IndexWriter};
use tantivy::schema::Schema;

use crate::models::FileData;
use crate::search::{create_tantivy_index, SearchHistory};
use crate::background::PdfQueue;

/// Main application state
pub struct AppState {
    /// In-memory file index
    pub index: RwLock<Vec<FileData>>,
    
    /// Folders being watched/indexed
    pub watched_folders: Mutex<HashSet<String>>,
    
    /// Folders excluded from search results
    pub excluded_folders: Mutex<HashSet<String>>,
    
    /// File system watcher
    pub watcher: Mutex<Option<notify::RecommendedWatcher>>,
    
    /// Tantivy full-text search index
    pub tantivy_index: Index,
    
    /// Tantivy index reader
    pub tantivy_reader: IndexReader,
    
    /// Tantivy index writer (mutex for thread safety)
    pub tantivy_writer: Mutex<IndexWriter>,
    
    /// Tantivy schema
    pub tantivy_schema: Schema,
    
    /// SQLite database connection for persistence
    pub db: Mutex<Option<Connection>>,
    
    /// App data directory path
    pub data_dir: Mutex<Option<PathBuf>>,
    
    /// Background PDF processing queue
    pub pdf_queue: PdfQueue,
    
    /// Search history
    pub search_history: Mutex<SearchHistory>,
}

impl Default for AppState {
    fn default() -> Self {
        let tantivy = create_tantivy_index();
        
        Self {
            index: RwLock::new(Vec::new()),
            watched_folders: Mutex::new(HashSet::new()),
            excluded_folders: Mutex::new(HashSet::new()),
            watcher: Mutex::new(None),
            tantivy_index: tantivy.index,
            tantivy_reader: tantivy.reader,
            tantivy_writer: Mutex::new(tantivy.writer),
            tantivy_schema: tantivy.schema,
            db: Mutex::new(None),
            data_dir: Mutex::new(None),
            pdf_queue: PdfQueue::new(),
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
