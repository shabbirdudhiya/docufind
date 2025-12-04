use tauri::State;

use crate::models::{FileData, SearchResult, SearchFilters, SearchHistoryEntry};
use crate::search::{
    search_with_tantivy, search_direct_content, apply_filters,
};
use crate::state::AppState;

/// Search the index with optional filters
#[tauri::command]
pub async fn search_index(
    query: String,
    filters: Option<SearchFilters>,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    println!("🔎 Searching for: '{}'", query);

    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let query_lower = query.to_lowercase();

    // Get excluded folders for filtering
    let excluded_folders = state
        .excluded_folders
        .lock()
        .map_err(|e| e.to_string())?
        .clone();

    // Try Tantivy search first (good for English/Latin text)
    let mut results = search_with_tantivy(
        &query,
        &state.tantivy_index,
        &state.tantivy_reader,
        &state.tantivy_schema,
    )?;

    // Also do direct content search for non-Latin scripts (Arabic, Chinese, etc.)
    // OR if Tantivy didn't find results
    let has_non_ascii = query.chars().any(|c| !c.is_ascii());
    let files = state.index.read().map_err(|e| e.to_string())?;
    
    if has_non_ascii || results.is_empty() {
        println!("📝 Running direct content search (non-ASCII: {}, tantivy results: {})", has_non_ascii, results.len());
        let direct_results = search_direct_content(&query_lower, &files)?;
        
        // Merge results, avoiding duplicates by path
        let existing_paths: std::collections::HashSet<_> = results.iter().map(|r| r.file.path.clone()).collect();
        for dr in direct_results {
            if !existing_paths.contains(&dr.file.path) {
                results.push(dr);
            }
        }
    }

    // Filter out results from excluded folders
    if !excluded_folders.is_empty() {
        let before_filter = results.len();
        results.retain(|r| {
            !excluded_folders
                .iter()
                .any(|excluded| r.file.path.starts_with(excluded))
        });
        if before_filter != results.len() {
            println!(
                "🚫 Filtered out {} results from excluded folders",
                before_filter - results.len()
            );
        }
    }

    // Apply additional filters if provided
    if let Some(f) = filters {
        results = apply_filters(results, &f);
    }

    // Log result types for debugging
    let word_count = results.iter().filter(|r| r.file.file_type == "word").count();
    let pptx_count = results.iter().filter(|r| r.file.file_type == "powerpoint").count();
    let total = results.len();
    println!("📊 Results breakdown: {} total ({} Word, {} PowerPoint, {} other)", total, word_count, pptx_count, total - word_count - pptx_count);

    // Add to search history
    {
        if let Ok(mut history) = state.search_history.lock() {
            history.add(query.clone(), results.len());
        }
    }

    println!("✅ Search complete: {} results found", results.len());
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
