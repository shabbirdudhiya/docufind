use std::fs;
use std::path::Path;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use tauri::{AppHandle, Emitter, State};
use tantivy::doc;
use walkdir::WalkDir;
use std::collections::HashSet;

use crate::models::{FileData, IndexingProgress};
use crate::extractors::extract_content;
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
    
    // Metadata table for app settings/migrations
    conn.execute(
        "CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
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
    
    // Update state IMMEDIATELY - UI can work with in-memory index
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
    
    // Store connection
    {
        let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
        *db_guard = Some(Connection::open(&db_path).map_err(|e| e.to_string())?);
    }
    
    // Rebuild Tantivy index IN BACKGROUND - don't block UI
    // Search will still work via direct content search until Tantivy is ready
    let tantivy_writer = state.tantivy_writer.clone();
    let tantivy_schema = state.tantivy_schema.clone();
    let files_for_tantivy = valid_files.clone();
    
    std::thread::spawn(move || {
        let start = std::time::Instant::now();
        
        if let Ok(mut writer) = tantivy_writer.lock() {
            let path_field = tantivy_schema.get_field("path").unwrap();
            let name_field = tantivy_schema.get_field("name").unwrap();
            let content_field = tantivy_schema.get_field("content").unwrap();
            let file_type_field = tantivy_schema.get_field("file_type").unwrap();
            let size_field = tantivy_schema.get_field("size").unwrap();
            let modified_field = tantivy_schema.get_field("modified").unwrap();
            
            let _ = writer.delete_all_documents();
            
            // Add all files silently
            for file in files_for_tantivy.iter() {
                let _ = writer.add_document(doc!(
                    path_field => file.path.clone(),
                    name_field => file.name.clone(),
                    content_field => file.content.clone(),
                    file_type_field => file.file_type.clone(),
                    size_field => file.size,
                    modified_field => file.last_modified.timestamp()
                ));
            }
            
            // Commit
            if let Err(_e) = writer.commit() {
                // Silent failure - search still works via direct search
            }
        }
    });
    
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
    
    Ok(())
}

/// Check if .doc migration has been completed
fn is_doc_migration_done(state: &State<'_, AppState>) -> bool {
    let data_dir = {
        let dir_guard = state.data_dir.lock().ok();
        match dir_guard.as_ref().and_then(|g| g.as_ref()) {
            Some(d) => d.clone(),
            None => return false,
        }
    };
    
    let db_path = data_dir.join("docufind.db");
    if let Ok(conn) = Connection::open(&db_path) {
        if let Ok(mut stmt) = conn.prepare("SELECT value FROM metadata WHERE key = 'doc_migration_done'") {
            if let Ok(mut rows) = stmt.query([]) {
                if let Ok(Some(_row)) = rows.next() {
                    return true;
                }
            }
        }
    }
    false
}

/// Mark .doc migration as complete
fn mark_doc_migration_done(state: &State<'_, AppState>) -> Result<(), String> {
    let data_dir = {
        let dir_guard = state.data_dir.lock().map_err(|e| e.to_string())?;
        match dir_guard.as_ref() {
            Some(d) => d.clone(),
            None => return Ok(()),
        }
    };
    
    let db_path = data_dir.join("docufind.db");
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    init_database(&conn).map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT OR REPLACE INTO metadata (key, value) VALUES ('doc_migration_done', '1')",
        [],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Scan for new .doc files in existing indexed folders (background update)
/// This is called automatically after loading index to pick up any .doc files
/// that weren't indexed before .doc support was added
/// Only runs ONCE - after migration is complete, it won't run again
/// Returns immediately and runs indexing in the background, emitting events
#[tauri::command]
pub async fn scan_for_new_doc_files(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<serde_json::Value, String> {
    // Check if migration was already done - skip silently
    if is_doc_migration_done(&state) {
        return Ok(serde_json::json!({
            "found": 0,
            "indexed": 0,
            "skipped": true,
            "message": ".doc migration already completed"
        }));
    }
    
    // Get current indexed folders
    let folders: Vec<String> = {
        let folders_guard = state.watched_folders.lock().map_err(|e| e.to_string())?;
        folders_guard.iter().cloned().collect()
    };
    
    if folders.is_empty() {
        // Mark as done even if no folders - user can add folders later
        let _ = mark_doc_migration_done(&state);
        return Ok(serde_json::json!({
            "found": 0,
            "indexed": 0,
            "message": "No folders to scan"
        }));
    }
    
    // Get already indexed file paths - check BOTH in-memory index AND database
    let indexed_paths: HashSet<String> = {
        let index = state.index.read().map_err(|e| e.to_string())?;
        let mut paths: HashSet<String> = index.iter().map(|f| f.path.clone()).collect();
        
        // Also check database for any files that were indexed but not loaded yet
        if let Ok(data_dir) = state.data_dir.lock() {
            if let Some(ref data_dir_path) = *data_dir {
                let db_path = data_dir_path.join("docufind.db");
                if let Ok(conn) = Connection::open(&db_path) {
                    if let Ok(mut stmt) = conn.prepare("SELECT path FROM files WHERE file_type = 'word'") {
                        if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
                            for path in rows.flatten() {
                                paths.insert(path);
                            }
                        }
                    }
                }
            }
        }
        
        paths
    };
    
    // Emit that .doc indexing is starting  
    let _ = app.emit("doc-indexing-started", serde_json::json!({
        "message": "Scanning for .doc files...",
        "total": 0
    }));
    
    // Get data directory for database operations in background task
    let data_dir = {
        let dir_guard = state.data_dir.lock().map_err(|e| e.to_string())?;
        dir_guard.clone()
    };
    
    // Clone state for the background task
    let state_index = state.index.clone();
    let state_tantivy_writer = state.tantivy_writer.clone();
    let state_tantivy_schema = state.tantivy_schema.clone();
    
    // Spawn background task for BOTH scanning and indexing
    std::thread::spawn(move || {
        // Find .doc files that aren't indexed yet (now in background)
        let mut new_doc_files: Vec<std::path::PathBuf> = Vec::new();
        
        for folder in &folders {
            for entry in WalkDir::new(folder)
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
                    
                    // Only look for .doc files that aren't already indexed
                    if ext_str == "doc" {
                        let path_str = entry.path().to_string_lossy().to_string();
                        if !indexed_paths.contains(&path_str) {
                            new_doc_files.push(entry.path().to_path_buf());
                        }
                    }
                }
            }
        }
        
        let total_found = new_doc_files.len();
        
        if total_found == 0 {
            // Mark migration done silently
            if let Some(ref data_dir_path) = data_dir {
                let db_path = data_dir_path.join("docufind.db");
                if let Ok(conn) = Connection::open(&db_path) {
                    let _ = conn.execute(
                        "INSERT OR REPLACE INTO metadata (key, value) VALUES ('doc_migration_done', '1')",
                        [],
                    );
                }
            }
            let _ = app.emit(
                "doc-indexing-complete",
                serde_json::json!({
                    "found": 0,
                    "indexed": 0
                }),
            );
            return;
        }
        
        // Emit progress update with total found immediately
        let _ = app.emit(
            "doc-indexing-progress",
            IndexingProgress {
                current: 0,
                total: total_found,
                filename: "Starting indexing...".to_string(),
                phase: "scanning".to_string(),
            },
        );
        
        let mut indexed_count = 0;
        let mut new_files: Vec<FileData> = Vec::new();
        
        for (i, file_path) in new_doc_files.iter().enumerate() {
            
            let file_name = file_path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            
            if let Ok(metadata) = std::fs::metadata(file_path) {
                let size = metadata.len();
                if size == 0 {
                    continue;
                }
                
                let modified: DateTime<Utc> = metadata.modified()
                    .map(|t| t.into())
                    .unwrap_or_else(|_| Utc::now());
                let path_str = file_path.to_string_lossy().to_string();
                
                // Extract content
                if let Some(content) = extract_content(file_path, "doc") {
                    let file_data = FileData {
                        path: path_str.clone(),
                        name: file_name.clone(),
                        size: size,
                        last_modified: modified,
                        file_type: "word".to_string(),
                        content,
                    };
                    
                    new_files.push(file_data);
                    indexed_count += 1;
                }
            }
            
            // Emit progress every 10 files or at the end
            if (i + 1) % 10 == 0 || i + 1 == total_found {
                if (i + 1) % 100 == 0 {
                    // Save batch to database every 100 files to avoid losing progress
                    if !new_files.is_empty() {
                        if let Some(ref data_dir_path) = data_dir {
                            let db_path = data_dir_path.join("docufind.db");
                            if let Ok(conn) = Connection::open(&db_path) {
                                for file in &new_files {
                                    let _ = conn.execute(
                                        "INSERT OR REPLACE INTO files (path, name, content, file_type, size, last_modified) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                                        params![
                                            file.path,
                                            file.name,
                                            file.content,
                                            file.file_type,
                                            file.size as i64,
                                            file.last_modified.timestamp()
                                        ],
                                    );
                                }
                            }
                        }
                        
                        // Add to in-memory index
                        if let Ok(mut index) = state_index.write() {
                            index.extend(new_files.drain(..));
                        }
                    }
                }
                let _ = app.emit(
                    "doc-indexing-progress",
                    IndexingProgress {
                        current: i + 1,
                        total: total_found,
                        filename: file_name.clone(),
                        phase: "indexing".to_string(),
                    },
                );
            }
        }
        
        if !new_files.is_empty() {
            // Add to index
            if let Ok(mut index) = state_index.write() {
                index.extend(new_files.clone());
            }
            
            // Add to Tantivy
            if let Ok(mut writer) = state_tantivy_writer.lock() {
                let schema = &state_tantivy_schema;
                
                let path_field = schema.get_field("path").unwrap();
                let name_field = schema.get_field("name").unwrap();
                let content_field = schema.get_field("content").unwrap();
                let file_type_field = schema.get_field("file_type").unwrap();
                let size_field = schema.get_field("size").unwrap();
                let modified_field = schema.get_field("modified").unwrap();
                
                for file in &new_files {
                    let _ = writer.add_document(doc!(
                        path_field => file.path.clone(),
                        name_field => file.name.clone(),
                        content_field => file.content.clone(),
                        file_type_field => file.file_type.clone(),
                        size_field => file.size,
                        modified_field => file.last_modified.timestamp()
                    ));
                }
                
                let _ = writer.commit();
            }
            
            // Save newly indexed files to database
            if let Some(ref data_dir_path) = data_dir {
                let db_path = data_dir_path.join("docufind.db");
                if let Ok(conn) = Connection::open(&db_path) {
                    // Only save newly indexed files (not the whole index)
                    for file in &new_files {
                        let _ = conn.execute(
                            "INSERT OR REPLACE INTO files (path, name, content, file_type, size, last_modified) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                            params![
                                file.path,
                                file.name,
                                file.content,
                                file.file_type,
                                file.size as i64,
                                file.last_modified.timestamp()
                            ],
                        );
                    }
                    
                    // Mark migration done
                    let _ = conn.execute(
                        "INSERT OR REPLACE INTO metadata (key, value) VALUES ('doc_migration_done', '1')",
                        [],
                    );
                }
            }
        } else {
            // Mark migration done even if no files indexed
            if let Some(ref data_dir_path) = data_dir {
                let db_path = data_dir_path.join("docufind.db");
                if let Ok(conn) = Connection::open(&db_path) {
                    let _ = conn.execute(
                        "INSERT OR REPLACE INTO metadata (key, value) VALUES ('doc_migration_done', '1')",
                        [],
                    );
                }
            }
        }
        
        // Emit completion
        let _ = app.emit(
            "doc-indexing-complete",
            serde_json::json!({
                "found": total_found,
                "indexed": indexed_count
            }),
        );
    });
    
    // Return immediately - scanning and indexing happens in background
    Ok(serde_json::json!({
        "found": 0,
        "indexed": 0,
        "started": true,
        "message": "Started .doc migration scan in background"
    }))
}
