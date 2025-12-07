use chrono::{DateTime, Utc};
use rayon::prelude::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use walkdir::WalkDir;

use crate::extractors::{extract_content, get_file_type, is_supported_extension};
use crate::models::{FileData, FolderInfo, IndexingProgress};
use crate::state::AppState;

/// Scan a folder and index all supported documents (DOCX, PPTX, XLSX, TXT, MD)
/// Scan a folder and index all supported documents (DOCX, PPTX, XLSX, TXT, MD)
#[tauri::command]
pub async fn scan_folder(
    path: String,
    force_reindex: Option<bool>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<FileData>, String> {
    let should_force = force_reindex.unwrap_or(false);

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

    // Create lookup map of existing files for incremental indexing
    // keys: path string, values: (size, last_modified timestamp)
    let existing_files_map: std::collections::HashMap<String, (u64, i64)> = if !should_force {
        let index_guard = state.index.read().map_err(|e| e.to_string())?;
        index_guard
            .iter()
            .map(|f| (f.path.clone(), (f.size, f.last_modified.timestamp())))
            .collect()
    } else {
        std::collections::HashMap::new()
    };

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

    // Need to clone map for closure if we want to use it inside par_iter
    // Since HashMap is not Sync by default if it contains non-Sync types (String/ints are Sync)
    // Actually HashMap is Sync if K, V are Sync. String, u64, i64 are Sync.
    // But we need to wrap in Arc to pass to multiple threads cheaply?
    // par_iter will reference it.
    let existing_map_ref = &existing_files_map;

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

            // INCREMENTAL CHECK:
            // If file exists in index AND size matches AND modified time matches -> SKIP extraction
            // We return a "placeholder" FileData? No, we need existing content.
            // But we don't have access to existing content in this closure easily without cloning full index.
            // Actually, if we skip here, we just need to ensure the existing entry is preserved in Phase 4.
            // So we can return None here if unchanged?
            // YES: filtering map keeps only NEW or UPDATED files.
            // But wait, if we return None, `new_files` won't have it.
            // Then in Phase 4 (update index), we do:
            // `index.retain(|f| !new_files.iter().any(|nf| nf.path == f.path))`
            // If we return None, existing file is RETAINED. Correct!

            // Check if file is unchanged
            if let Some((old_size, old_mod_ts)) = existing_map_ref.get(&path_str) {
                if *old_size == size && *old_mod_ts == modified.timestamp() {
                    // Update progress even if skipped
                    let current = progress_counter.fetch_add(1, Ordering::SeqCst) + 1;
                    // ... verify emit logic ...
                    let emit_threshold = std::cmp::max(1, total_for_closure / 50);
                    let last = last_emitted.load(Ordering::SeqCst);

                    if current - last >= emit_threshold || current == total_for_closure {
                        last_emitted.store(current, Ordering::SeqCst);
                        let _ = app_handle.emit(
                            "indexing-progress",
                            IndexingProgress {
                                current,
                                total: total_for_closure,
                                filename: format!("Skipped: {}", file_name), // Show skipped
                                phase: "indexing".to_string(),
                            },
                        );
                    }
                    return None; // Skip processing, keeping existing index entry
                }
            }

            // If we are here, it's a new or modified file. EXTRACT!
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
    // We only want to add `new_files` (either new or modified).
    // If a file was modified, we need to replace the old entry.
    // If a file was unchanged, we did NOT return it in `new_files`, so we must KEEP the old entry.
    // So logic:
    // 1. Remove entries from index that are in `new_files` (collision = update)
    // 2. Add `new_files`
    // What about deleted files?
    // This function scans a folder. Files NOT found in filesystem are not handled here - they remain in index?
    // Wait, the current logic is purely additive/update.
    // If a file was DELETED from disk, `WalkDir` won't find it.
    // `new_files` won't trigger `retain`.
    // So deleted files persist until when?
    // `WalkDir` finds current files.
    // If I want to sync deletions, I need to know which files *were* in this folder path but are no longer.
    // That's a "sync" operation.
    // Current logic: `index.retain(|f| !new_files.iter().any(|nf| nf.path == f.path));`
    // This ONLY removes files that we are about to update. It does NOT remove deleted files.
    // For now, I will stick to the existing behavior + optimization.
    // Ideally we should also clean up deleted files, but that might be a separate task.
    // But wait, if I want to "Scan Folder" I usually expect it to sync.
    // Let's keep scope to "make it fast".

    {
        let mut index = state.index.write().map_err(|e| e.to_string())?;
        // Remove ANY file in `new_files` from index (preparation for replacement)
        // We use a HashSet for faster lookup if new_files is huge, but usually it's small in incremental
        let new_paths: std::collections::HashSet<String> =
            new_files.iter().map(|f| f.path.clone()).collect();
        if !new_paths.is_empty() {
            index.retain(|f| !new_paths.contains(&f.path));
            index.extend(new_files.clone());
        }
    }

    // Note: FTS5 is updated via save_index_internal
    // But since we optimizing writes, we should only save if there are changes?
    // `save_index_internal` clears `files` table and rewrites EVERYTHING.
    // That's inefficient if we only processed 5 new files out of 4000.
    // With `save_index_internal` doing a full wipe, our "Incremental" work is partially wasted
    // because we still rewrite the whole DB.
    // BUT! We skipped the expensive PART: content extraction (XML parsing).
    // Rewriting 4000 rows to SQLite is fast (~100ms).
    // Extracting 4000 DOCX files is slow (10 mins).
    // So this IS a huge win even with full DB rewrite.
    // Optimization for later: Incremental DB save.

    // Auto-save to SQLite (includes FTS5)
    let _ = crate::commands::persistence::save_index_internal(&state);

    // Strip content from returned files to avoid huge IPC payload
    // The content is already in Memory Index and SQLite DB
    let lightweight_files = new_files
        .into_iter()
        .map(|mut f| {
            f.content.clear();
            f
        })
        .collect();

    Ok(lightweight_files)
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
            let file_count = index
                .iter()
                .filter(|f| f.path.starts_with(&path_prefix))
                .count();
            FolderInfo {
                path: folder_path.clone(),
                file_count,
            }
        })
        .collect();

    Ok(results)
}
