use rusqlite::{Connection, OpenFlags};
use std::collections::HashSet;
use tauri::State;

use crate::models::{FileData, SearchFilters, SearchHistoryEntry, SearchResult};
use crate::search::{apply_filters, search_direct_content, search_fts5};
use crate::state::AppState;

/// Default max results if not specified
const DEFAULT_MAX_RESULTS: usize = 100;

/// Search the index with optional filters
///
/// SEARCH STRATEGY:
/// 1. SQLite FTS5 (primary) - Instant search for ALL languages including Arabic
/// 2. Direct content search (fallback) - Linear scan if FTS5 unavailable
///
/// FTS5 is the primary search engine because:
/// - Works with Arabic, Chinese, Hebrew, and all Unicode
/// - Uses inverted index (O(log n) vs O(n))
/// - Already stored in SQLite database
#[tauri::command]
pub async fn search_index(
    query: String,
    filters: Option<SearchFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    let total_start = std::time::Instant::now();

    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    println!("[Search] Query: '{}'", query);

    // Extract pagination/scope options from filters
    let max_results = filters
        .as_ref()
        .and_then(|f| f.max_results)
        .unwrap_or(DEFAULT_MAX_RESULTS);
    let offset = filters.as_ref().and_then(|f| f.offset).unwrap_or(0);
    let file_path_filter = filters.as_ref().and_then(|f| f.file_path.as_deref());

    // Get excluded folders for filtering
    let excluded_folders: HashSet<String> = state
        .excluded_folders
        .lock()
        .map_err(|e| e.to_string())?
        .clone();

    let mut results: Vec<SearchResult> = Vec::new();
    let mut used_fts5 = false;

    // Try FTS5 search first using a dedicated read-only connection to avoid writer lock
    if let Some(data_dir) = state.get_data_dir() {
        let db_path = data_dir.join("docufind.db");
        if db_path.exists() {
            // Open READ-ONLY and NO_MUTEX (multi-threaded mode) to bypass writer lock
            let conn_start = std::time::Instant::now();
            if let Ok(conn) = Connection::open_with_flags(
                &db_path,
                OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
            ) {
                println!(
                    "[Search] Opened DB connection in {:?}",
                    conn_start.elapsed()
                );

                println!("[Search] Using FTS5 (Dedicated Connection)");
                let search_start = std::time::Instant::now();
                match search_fts5(
                    &conn,
                    &query,
                    max_results + offset,
                    0,
                    file_path_filter,
                    &excluded_folders,
                ) {
                    Ok(res) => {
                        println!(
                            "[Search] FTS5 search executed in {:?}",
                            search_start.elapsed()
                        );
                        results = res;
                        used_fts5 = true;
                    }
                    Err(e) => println!("[FTS5] Error: {}", e),
                }
            }
        }
    }

    if !used_fts5 {
        // FTS5 is our primary search engine. If it fails, fall back to direct search.
        // This should rarely happen in normal operation.
        println!("[Search] Fallback: FTS5 unavailable, using direct content search.");

        let files = state.index.read().map_err(|e| e.to_string())?;
        results =
            search_direct_content(&query, &files, Some(max_results + offset), file_path_filter)?;

        // Filter excluded folders
        if file_path_filter.is_none() && !excluded_folders.is_empty() {
            results.retain(|r| {
                !excluded_folders
                    .iter()
                    .any(|excluded| r.file.path.starts_with(excluded))
            });
        }
    }

    // Apply additional filters if provided
    if let Some(ref f) = filters {
        results = apply_filters(results, f);
    }

    // Apply pagination
    if offset > 0 {
        results = results.into_iter().skip(offset).collect();
    }
    results.truncate(max_results);

    // Add to search history (skip for single-file search)
    if file_path_filter.is_none() {
        if let Ok(mut history) = state.search_history.lock() {
            history.add(query.clone(), results.len());
        }
    }

    // Log final stats
    let total_time = total_start.elapsed();
    if used_fts5 {
        println!(
            "[Search] ✅ FTS5 succeeded: {} results in {:?}",
            results.len(),
            total_time
        );
    } else {
        println!(
            "[Search] ⚠️ Used fallback engine: {} results in {:?}",
            results.len(),
            total_time
        );
    }

    Ok(results)
}

/// Get search history
#[tauri::command]
pub async fn get_search_history(
    count: Option<usize>,
    state: State<'_, AppState>,
) -> Result<Vec<SearchHistoryEntry>, String> {
    let history = state.search_history.lock().map_err(|e| e.to_string())?;
    Ok(history.get_recent(count.unwrap_or(10)))
}

/// Clear search history
#[tauri::command]
pub async fn clear_search_history(state: State<'_, AppState>) -> Result<(), String> {
    let mut history = state.search_history.lock().map_err(|e| e.to_string())?;
    history.clear();
    Ok(())
}

/// Remove a specific search from history
#[tauri::command]
pub async fn remove_from_search_history(
    query: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut history = state.search_history.lock().map_err(|e| e.to_string())?;
    history.remove(&query);
    Ok(())
}

/// Get index statistics
#[tauri::command]
pub async fn get_index_stats(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let index = state.index.read().map_err(|e| e.to_string())?;
    let folders = state.watched_folders.lock().map_err(|e| e.to_string())?;

    let word_count = index.iter().filter(|f| f.file_type == "word").count();
    let pptx_count = index.iter().filter(|f| f.file_type == "powerpoint").count();
    let excel_count = index.iter().filter(|f| f.file_type == "excel").count();
    let text_count = index.iter().filter(|f| f.file_type == "text").count();
    let total_size: u64 = index.iter().map(|f| f.size).sum();

    Ok(serde_json::json!({
        "totalFiles": index.len(),
        "wordFiles": word_count,
        "powerPointFiles": pptx_count,
        "excelFiles": excel_count,
        "textFiles": text_count,
        "totalSize": total_size,
        "folderCount": folders.len()
    }))
}

/// Get all indexed files (for Files view)
#[tauri::command]
pub async fn get_all_files(state: State<'_, AppState>) -> Result<Vec<FileData>, String> {
    let index = state.index.read().map_err(|e| e.to_string())?;

    // Return files without content to reduce payload size
    Ok(index
        .iter()
        .map(|f| FileData {
            path: f.path.clone(),
            name: f.name.clone(),
            size: f.size,
            last_modified: f.last_modified,
            file_type: f.file_type.clone(),
            content: String::new(), // Don't send content
        })
        .collect())
}
