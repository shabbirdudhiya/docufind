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

    // If Tantivy found nothing, try direct content search
    // (better for Arabic, Chinese, other scripts)
    if results.is_empty() {
        println!("📝 Tantivy found nothing, trying direct content search...");
        let files = state.index.read().map_err(|e| e.to_string())?;
        results = search_direct_content(&query_lower, &files)?;
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
    let pdf_status = state.pdf_queue.status();

    let word_count = index.iter().filter(|f| f.file_type == "word").count();
    let pptx_count = index.iter().filter(|f| f.file_type == "powerpoint").count();
    let pdf_count = index.iter().filter(|f| f.file_type == "pdf").count();
    let excel_count = index.iter().filter(|f| f.file_type == "excel").count();
    let text_count = index.iter().filter(|f| f.file_type == "text").count();
    let total_size: u64 = index.iter().map(|f| f.size).sum();

    Ok(serde_json::json!({
        "totalFiles": index.len(),
        "wordFiles": word_count,
        "powerPointFiles": pptx_count,
        "pdfFiles": pdf_count,
        "excelFiles": excel_count,
        "textFiles": text_count,
        "totalSize": total_size,
        "folderCount": folders.len(),
        "pdfQueuePending": pdf_status.pending + pdf_status.processing
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
