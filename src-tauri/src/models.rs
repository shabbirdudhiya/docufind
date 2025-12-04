use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Core file data structure representing an indexed document
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileData {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub last_modified: DateTime<Utc>,
    pub file_type: String,
    pub content: String,
}

/// Search result with match highlights and score
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub file: FileData,
    pub matches: Vec<Match>,
    pub score: f32,
}

/// Individual match within a document
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Match {
    pub text: String,
    pub index: usize,
    pub context: String,
}

/// Information about an indexed folder
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderInfo {
    pub path: String,
    pub file_count: usize,
}

/// Progress event payload for frontend during indexing
#[derive(Debug, Serialize, Clone)]
pub struct IndexingProgress {
    pub current: usize,
    pub total: usize,
    pub filename: String,
    pub phase: String, // "discovering", "indexing", "finalizing", "pdf-background"
}

/// Folder node for hierarchical tree view
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderNode {
    pub path: String,
    pub name: String,
    pub is_excluded: bool,
    pub file_count: usize,
    pub children: Vec<FolderNode>,
}

/// Search history entry
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchHistoryEntry {
    pub query: String,
    pub timestamp: DateTime<Utc>,
    pub result_count: usize,
}

/// Search filters for advanced filtering
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SearchFilters {
    pub file_types: Option<Vec<String>>,      // ["word", "pdf", "powerpoint"]
    pub date_from: Option<DateTime<Utc>>,
    pub date_to: Option<DateTime<Utc>>,
    pub min_size: Option<u64>,
    pub max_size: Option<u64>,
    pub folder_path: Option<String>,          // Limit search to specific folder
}

/// Index statistics for dashboard
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IndexStats {
    pub total_files: usize,
    pub word_files: usize,
    pub powerpoint_files: usize,
    pub pdf_files: usize,
    pub excel_files: usize,
    pub text_files: usize,
    pub total_size: u64,
    pub folder_count: usize,
    pub pdf_queue_pending: usize,
}
