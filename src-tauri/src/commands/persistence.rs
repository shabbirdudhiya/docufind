use std::fs;
use std::path::Path;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use tauri::State;
use tantivy::doc;

use crate::models::FileData;
use crate::state::AppState;

/// Initialize SQLite database schema
pub fn init_database(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS files (
            path TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            size INTEGER NOT NULL,
            last_modified TEXT NOT NULL,
            file_type TEXT NOT NULL,
            content TEXT NOT NULL
        )",
        [],
    )?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS folders (
            path TEXT PRIMARY KEY,
            is_excluded INTEGER NOT NULL DEFAULT 0
        )",
        [],
    )?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS folder_exclusions (
            path TEXT PRIMARY KEY
        )",
        [],
    )?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS search_history (
            query TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            result_count INTEGER NOT NULL
        )",
        [],
    )?;
    
    // Create indexes for faster queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_files_folder ON files(path)",
        [],
    )?;
    
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_files_type ON files(file_type)",
        [],
    )?;
    
    Ok(())
}

/// Save index to SQLite database
#[tauri::command]
pub async fn save_index(state: State<'_, AppState>) -> Result<(), String> {
    save_index_internal(&state)
}

/// Internal synchronous save function
pub fn save_index_internal(state: &State<'_, AppState>) -> Result<(), String> {
    let data_dir = {
        let dir_guard = state.data_dir.lock().map_err(|e| e.to_string())?;
        match dir_guard.as_ref() {
            Some(d) => d.clone(),
            None => return Ok(()), // No data dir yet
        }
    };
    
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    
    let db_path = data_dir.join("docufind.db");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    init_database(&conn).map_err(|e| e.to_string())?;
    
    let files = state.index.read().map_err(|e| e.to_string())?;
    let folders = state.watched_folders.lock().map_err(|e| e.to_string())?;
    let excluded = state.excluded_folders.lock().map_err(|e| e.to_string())?;
    
    // Clear and rewrite
    conn.execute("DELETE FROM files", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM folders", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM folder_exclusions", []).map_err(|e| e.to_string())?;
    
    // Insert files
    for file in files.iter() {
        conn.execute(
            "INSERT OR REPLACE INTO files (path, name, size, last_modified, file_type, content) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                file.path,
                file.name,
                file.size,
                file.last_modified.to_rfc3339(),
                file.file_type,
                file.content
            ],
        ).map_err(|e| e.to_string())?;
    }
    
    // Insert folders
    for folder in folders.iter() {
        conn.execute(
            "INSERT OR REPLACE INTO folders (path, is_excluded) VALUES (?1, 0)",
            params![folder],
        ).map_err(|e| e.to_string())?;
    }
    
    // Insert exclusions
    for excl in excluded.iter() {
        conn.execute(
            "INSERT OR REPLACE INTO folder_exclusions (path) VALUES (?1)",
            params![excl],
        ).map_err(|e| e.to_string())?;
    }
    
    // Update connection in state
    {
        let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
        *db_guard = Some(Connection::open(&db_path).map_err(|e| e.to_string())?);
    }
    
    println!("💾 Saved {} files, {} folders to SQLite", files.len(), folders.len());
    Ok(())
}

/// Load index from SQLite database
#[tauri::command]
pub async fn load_index(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let data_dir = {
        let dir_guard = state.data_dir.lock().map_err(|e| e.to_string())?;
        match dir_guard.as_ref() {
            Some(d) => d.clone(),
            None => return Ok(serde_json::json!({
                "loaded": false,
                "message": "Data directory not set"
            })),
        }
    };
    
    let db_path = data_dir.join("docufind.db");
    
    if !db_path.exists() {
        return Ok(serde_json::json!({
            "loaded": false,
            "message": "No saved index found"
        }));
    }
    
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    // Load folders
    let mut folder_stmt = conn.prepare("SELECT path FROM folders")
        .map_err(|e| e.to_string())?;
    let folder_rows = folder_stmt.query_map([], |row| {
        row.get::<_, String>(0)
    }).map_err(|e| e.to_string())?;
    
    let mut valid_folders: Vec<String> = Vec::new();
    for row in folder_rows {
        let path = row.map_err(|e| e.to_string())?;
        if Path::new(&path).exists() {
            valid_folders.push(path);
        }
    }
    
    // Load exclusions
    let mut excl_stmt = conn.prepare("SELECT path FROM folder_exclusions")
        .map_err(|e| e.to_string())?;
    let excl_rows = excl_stmt.query_map([], |row| {
        row.get::<_, String>(0)
    }).map_err(|e| e.to_string())?;
    
    let mut excluded_folders: Vec<String> = Vec::new();
    for row in excl_rows {
        excluded_folders.push(row.map_err(|e| e.to_string())?);
    }
    
    if valid_folders.is_empty() {
        return Ok(serde_json::json!({
            "loaded": false,
            "message": "No saved folders found"
        }));
    }
    
    // Load files
    let mut file_stmt = conn.prepare(
        "SELECT path, name, size, last_modified, file_type, content FROM files"
    ).map_err(|e| e.to_string())?;
    
    let file_rows = file_stmt.query_map([], |row| {
        Ok(FileData {
            path: row.get(0)?,
            name: row.get(1)?,
            size: row.get(2)?,
            last_modified: DateTime::parse_from_rfc3339(&row.get::<_, String>(3)?)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            file_type: row.get(4)?,
            content: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut valid_files: Vec<FileData> = Vec::new();
    for row in file_rows {
        let file = row.map_err(|e| e.to_string())?;
        if valid_folders.iter().any(|folder| file.path.starts_with(folder)) 
            && Path::new(&file.path).exists() {
            valid_files.push(file);
        }
    }
    
    let file_count = valid_files.len();
    let folder_count = valid_folders.len();
    
    // Update state
    {
        let mut index = state.index.write().map_err(|e| e.to_string())?;
        *index = valid_files.clone();
    }
    {
        let mut folders = state.watched_folders.lock().map_err(|e| e.to_string())?;
        *folders = valid_folders.iter().cloned().collect();
    }
    {
        let mut excluded = state.excluded_folders.lock().map_err(|e| e.to_string())?;
        *excluded = excluded_folders.iter().cloned().collect();
    }
    
    // Rebuild Tantivy index
    {
        let mut writer = state.tantivy_writer.lock().map_err(|e| e.to_string())?;
        let schema = &state.tantivy_schema;
        
        let path_field = schema.get_field("path").unwrap();
        let name_field = schema.get_field("name").unwrap();
        let content_field = schema.get_field("content").unwrap();
        let file_type_field = schema.get_field("file_type").unwrap();
        let size_field = schema.get_field("size").unwrap();
        let modified_field = schema.get_field("modified").unwrap();
        
        writer.delete_all_documents().map_err(|e| e.to_string())?;
        
        for file in &valid_files {
            writer.add_document(doc!(
                path_field => file.path.clone(),
                name_field => file.name.clone(),
                content_field => file.content.clone(),
                file_type_field => file.file_type.clone(),
                size_field => file.size,
                modified_field => file.last_modified.timestamp()
            )).map_err(|e| e.to_string())?;
        }
        
        writer.commit().map_err(|e| e.to_string())?;
    }
    
    // Store connection
    {
        let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
        *db_guard = Some(Connection::open(&db_path).map_err(|e| e.to_string())?);
    }
    
    println!("📂 Loaded {} files from {} folders", file_count, folder_count);
    
    Ok(serde_json::json!({
        "loaded": true,
        "fileCount": file_count,
        "folderCount": folder_count,
        "folders": valid_folders,
        "excludedFolders": excluded_folders
    }))
}

/// Clear entire index
#[tauri::command]
pub async fn clear_index(state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut index = state.index.write().map_err(|e| e.to_string())?;
        index.clear();
    }
    {
        let mut folders = state.watched_folders.lock().map_err(|e| e.to_string())?;
        folders.clear();
    }
    {
        let mut excluded = state.excluded_folders.lock().map_err(|e| e.to_string())?;
        excluded.clear();
    }
    {
        let mut watcher = state.watcher.lock().map_err(|e| e.to_string())?;
        *watcher = None;
    }
    {
        let mut writer = state.tantivy_writer.lock().map_err(|e| e.to_string())?;
        writer.delete_all_documents().map_err(|e| e.to_string())?;
        writer.commit().map_err(|e| e.to_string())?;
    }
    {
        let db_guard = state.db.lock().map_err(|e| e.to_string())?;
        if let Some(conn) = db_guard.as_ref() {
            conn.execute("DELETE FROM files", []).map_err(|e| e.to_string())?;
            conn.execute("DELETE FROM folders", []).map_err(|e| e.to_string())?;
            conn.execute("DELETE FROM folder_exclusions", []).map_err(|e| e.to_string())?;
        }
    }
    
    println!("🧹 Cleared index");
    Ok(())
}
