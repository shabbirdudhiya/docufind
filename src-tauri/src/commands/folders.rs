use tauri::State;

use crate::folders::build_folder_tree;
use crate::models::FolderNode;
use crate::state::AppState;

/// Get folder tree for exclusion UI
/// 
/// Returns a hierarchical tree of all indexed folders
/// with exclusion status and file counts.
#[tauri::command]
pub async fn get_folder_tree(state: State<'_, AppState>) -> Result<Vec<FolderNode>, String> {
    let files = state.index.read().map_err(|e| e.to_string())?;
    let root_folders = state.watched_folders.lock().map_err(|e| e.to_string())?;
    let excluded = state.excluded_folders.lock().map_err(|e| e.to_string())?;
    
    Ok(build_folder_tree(&files, &root_folders, &excluded))
}

/// Add a folder to the exclusion list
/// 
/// Files in excluded folders won't appear in search results.
/// Child folders automatically inherit exclusion from parents.
#[tauri::command]
pub async fn add_excluded_folder(path: String, state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut excluded = state.excluded_folders.lock().map_err(|e| e.to_string())?;
        excluded.insert(path.clone());
    }
    println!("🚫 Added to exclusion list: {}", path);
    
    // Update in database
    let db_guard = state.db.lock().map_err(|e| e.to_string())?;
    if let Some(conn) = db_guard.as_ref() {
        conn.execute(
            "INSERT OR REPLACE INTO folder_exclusions (path) VALUES (?1)",
            rusqlite::params![path],
        ).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

/// Remove a folder from the exclusion list
#[tauri::command]
pub async fn remove_excluded_folder(path: String, state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut excluded = state.excluded_folders.lock().map_err(|e| e.to_string())?;
        excluded.remove(&path);
    }
    println!("✅ Removed from exclusion list: {}", path);
    
    // Update in database
    let db_guard = state.db.lock().map_err(|e| e.to_string())?;
    if let Some(conn) = db_guard.as_ref() {
        conn.execute(
            "DELETE FROM folder_exclusions WHERE path = ?1",
            rusqlite::params![path],
        ).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

/// Toggle folder exclusion status
/// 
/// Convenience method that adds or removes based on current state.
#[tauri::command]
pub async fn toggle_folder_exclusion(
    path: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let is_currently_excluded = {
        let excluded = state.excluded_folders.lock().map_err(|e| e.to_string())?;
        excluded.contains(&path)
    };
    
    if is_currently_excluded {
        remove_excluded_folder(path, state).await?;
        Ok(false) // Now not excluded
    } else {
        add_excluded_folder(path, state).await?;
        Ok(true) // Now excluded
    }
}

/// Get list of all excluded folders
#[tauri::command]
pub async fn get_excluded_folders(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let excluded = state.excluded_folders.lock().map_err(|e| e.to_string())?;
    Ok(excluded.iter().cloned().collect())
}

/// Exclude multiple folders at once
#[tauri::command]
pub async fn exclude_folders_batch(
    paths: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    {
        let mut excluded = state.excluded_folders.lock().map_err(|e| e.to_string())?;
        for path in &paths {
            excluded.insert(path.clone());
        }
    }
    
    // Update database
    let db_guard = state.db.lock().map_err(|e| e.to_string())?;
    if let Some(conn) = db_guard.as_ref() {
        for path in &paths {
            conn.execute(
                "INSERT OR REPLACE INTO folder_exclusions (path) VALUES (?1)",
                rusqlite::params![path],
            ).map_err(|e| e.to_string())?;
        }
    }
    
    println!("🚫 Batch excluded {} folders", paths.len());
    Ok(())
}

/// Include multiple folders at once (remove from exclusion)
#[tauri::command]
pub async fn include_folders_batch(
    paths: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    {
        let mut excluded = state.excluded_folders.lock().map_err(|e| e.to_string())?;
        for path in &paths {
            excluded.remove(path);
        }
    }
    
    // Update database
    let db_guard = state.db.lock().map_err(|e| e.to_string())?;
    if let Some(conn) = db_guard.as_ref() {
        for path in &paths {
            conn.execute(
                "DELETE FROM folder_exclusions WHERE path = ?1",
                rusqlite::params![path],
            ).map_err(|e| e.to_string())?;
        }
    }
    
    println!("✅ Batch included {} folders", paths.len());
    Ok(())
}
