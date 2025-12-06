use chrono::{DateTime, Utc};
use rayon::prelude::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use walkdir::WalkDir;

use crate::extractors::{extract_content, get_file_type, is_supported_extension};
use crate::models::{FileData, FolderInfo, IndexingProgress};
use crate::search::tantivy_search::add_document_to_tantivy;
use crate::state::AppState;

/// Scan a folder and index all supported documents (DOCX, PPTX, XLSX, TXT, MD)
#[tauri::command]
pub async fn scan_folder(
    path: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<FileData>, String> {
    // Phase 1: Discover all files
    let _ = app.emit(
        "indexing-progress",
        IndexingProgress {
            current: 0,
            total: 0,
            filename: "Discovering files...".to_string(),
            phase: "discovering".to_string(),
        },
    );

    // Collect supported files
    let mut entries = Vec::new();

    for entry in WalkDir::new(&path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let file_name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden and temp files
        if file_name.starts_with('.') || file_name.starts_with("~$") {
            continue;
        }

        if let Some(ext) = entry.path().extension() {
            let ext_str = ext.to_str().unwrap_or("").to_lowercase();

            if is_supported_extension(&ext_str) {
                entries.push(entry);
            }
        }
    }

    let total = entries.len();

    let _ = app.emit(
        "indexing-progress",
        IndexingProgress {
            current: 0,
            total,
            filename: format!("Indexing {} documents...", total),
            phase: "indexing".to_string(),
        },
    );

    // Phase 2: Process files with progress
    let progress_counter = Arc::new(AtomicUsize::new(0));
    let last_emitted = Arc::new(AtomicUsize::new(0));
    let app_handle = app.clone();
    let total_for_closure = total;

    let new_files: Vec<FileData> = entries
        .par_iter()
        .filter_map(|entry| {
            let file_path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();
            let ext = file_path.extension()?.to_str()?.to_lowercase();

            let file_type = get_file_type(&ext)?;
            let metadata = entry.metadata().ok()?;
            let size = metadata.len();

            if size == 0 {
                return None;
            }

            let modified: DateTime<Utc> = metadata.modified().ok()?.into();
            let path_str = file_path.to_string_lossy().to_string();
            let content = extract_content(file_path, &ext).unwrap_or_default();

            // Update progress
            let current = progress_counter.fetch_add(1, Ordering::SeqCst) + 1;
            let emit_threshold = std::cmp::max(1, total_for_closure / 50);
            let last = last_emitted.load(Ordering::SeqCst);

            if current - last >= emit_threshold || current == total_for_closure {
                last_emitted.store(current, Ordering::SeqCst);
                let _ = app_handle.emit(
                    "indexing-progress",
                    IndexingProgress {
                        current,
                        total: total_for_closure,
                        filename: file_name.clone(),
                        phase: "indexing".to_string(),
                    },
                );
            }

            Some(FileData {
                path: path_str,
                name: file_name,
                size,
                last_modified: modified,
                file_type: file_type.to_string(),
                content,
            })
        })
        .collect();

    // Phase 3: Finalize
    let _ = app.emit(
        "indexing-progress",
        IndexingProgress {
            current: total,
            total,
            filename: "Building search index...".to_string(),
            phase: "finalizing".to_string(),
        },
    );

    // Add folder to watched list
    {
        let mut folders = state.watched_folders.lock().map_err(|e| e.to_string())?;
        folders.insert(path.clone());
    }

    // Update in-memory index
    {
        let mut index = state.index.write().map_err(|e| e.to_string())?;
        index.retain(|f| !new_files.iter().any(|nf| nf.path == f.path));
        index.extend(new_files.clone());
    }

    // Index into Tantivy
    {
        let mut writer = state.tantivy_writer.lock().map_err(|e| e.to_string())?;
        let schema = &state.tantivy_schema;

        for file in &new_files {
            add_document_to_tantivy(&mut writer, schema, file)?;
        }

        writer.commit().map_err(|e| e.to_string())?;
    }

    // Auto-save
    let _ = crate::commands::persistence::save_index_internal(&state);

    Ok(new_files)
}

/// Remove a folder from the index
#[tauri::command]
pub async fn remove_folder(path: String, state: State<'_, AppState>) -> Result<(), String> {
    // Remove from watched folders
    {
        let mut folders = state.watched_folders.lock().map_err(|e| e.to_string())?;
        folders.remove(&path);
    }

    // Also remove from excluded folders if present
    {
        let mut excluded = state.excluded_folders.lock().map_err(|e| e.to_string())?;
        excluded.remove(&path);
    }

    // Remove files from index
    {
        let mut index = state.index.write().map_err(|e| e.to_string())?;
        let path_prefix = if path.ends_with(std::path::MAIN_SEPARATOR) {
            path.clone()
        } else {
            format!("{}{}", path, std::path::MAIN_SEPARATOR)
        };
        index.retain(|f| !f.path.starts_with(&path_prefix) && f.path != path);
    }

    // Auto-save after removing
    let _ = crate::commands::persistence::save_index_internal(&state);

    Ok(())
}

/// Get list of currently indexed folders
#[tauri::command]
pub async fn get_indexed_folders(state: State<'_, AppState>) -> Result<Vec<FolderInfo>, String> {
    let folders = state.watched_folders.lock().map_err(|e| e.to_string())?;
    let index = state.index.read().map_err(|e| e.to_string())?;

    let results: Vec<FolderInfo> = folders
        .iter()
        .map(|folder_path| {
            let path_prefix = if folder_path.ends_with(std::path::MAIN_SEPARATOR) {
                folder_path.clone()
            } else {
                format!("{}{}", folder_path, std::path::MAIN_SEPARATOR)
            };
            let file_count = index.iter().filter(|f| f.path.starts_with(&path_prefix)).count();
            FolderInfo {
                path: folder_path.clone(),
                file_count,
            }
        })
        .collect();

    Ok(results)
}


