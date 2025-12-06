use tauri::State;
use rustc_hash::FxHashSet;

use crate::models::{FileData, SearchResult, SearchFilters, SearchHistoryEntry};
use crate::search::{
    search_with_tantivy, search_direct_content, apply_filters,
};
use crate::state::AppState;

/// Minimum results from Tantivy before skipping direct search (for ASCII queries)
const MIN_TANTIVY_RESULTS: usize = 5;

/// Search the index with optional filters
/// 
/// OPTIMIZATION STRATEGY:
/// 1. For ASCII queries: Use Tantivy first (fast indexed search)
///    - Skip direct search if Tantivy finds enough results
/// 2. For non-ASCII queries (Arabic, Chinese, etc.): Use direct search
///    - Tantivy's tokenizer doesn't handle these well
/// 3. Hybrid fallback: If Tantivy finds few results, supplement with direct search
#[tauri::command]
pub async fn search_index(
    query: String,
    filters: Option<SearchFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let query_lower = query.to_lowercase();
    let has_non_ascii = query.chars().any(|c| !c.is_ascii());

    // Get excluded folders for filtering
    let excluded_folders = state
        .excluded_folders
        .lock()
        .map_err(|e| e.to_string())?
        .clone();

    let mut results: Vec<SearchResult>;
    
    if has_non_ascii {
        // NON-ASCII QUERY (Arabic, Chinese, etc.): Direct search only
        // Tantivy's standard tokenizer doesn't handle these scripts well
        let files = state.index.read().map_err(|e| e.to_string())?;
        results = search_direct_content(&query_lower, &files)?;
    } else {
        // ASCII QUERY: Tantivy first (indexed, fast)
        results = search_with_tantivy(
            &query,
            &state.tantivy_index,
            &state.tantivy_reader,
            &state.tantivy_schema,
        )?;
        
        // Only do direct search if Tantivy found very few results
        // This handles cases where tokenization might miss exact matches
        if results.len() < MIN_TANTIVY_RESULTS {
            let files = state.index.read().map_err(|e| e.to_string())?;
            let direct_results = search_direct_content(&query_lower, &files)?;
            
            // Merge results, avoiding duplicates by path
            if !direct_results.is_empty() {
                // Use FxHashSet for O(1) lookup with fast hashing
                // Collect owned strings to avoid borrow issues
                let existing_paths: FxHashSet<String> = 
                    results.iter().map(|r| r.file.path.clone()).collect();
                    
                for dr in direct_results {
                    if !existing_paths.contains(&dr.file.path) {
                        results.push(dr);
                    }
                }
            }
        }
    }

    // Filter out results from excluded folders
    if !excluded_folders.is_empty() {
        results.retain(|r| {
            !excluded_folders
                .iter()
                .any(|excluded| r.file.path.starts_with(excluded))
        });
    }

    // Apply additional filters if provided
    if let Some(f) = filters {
        results = apply_filters(results, &f);
    }

    // Add to search history
    {
        if let Ok(mut history) = state.search_history.lock() {
            history.add(query.clone(), results.len());
        }
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
