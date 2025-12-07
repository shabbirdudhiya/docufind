use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter, State};
use walkdir::WalkDir;

use crate::extractors::extract_content;
use crate::models::{FileData, IndexingProgress};
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

    // FTS5 Full-Text Search virtual table (Contentless - External Content)
    // Refers to 'files' table to avoid duplicating content storage
    // tokenize='unicode61 remove_diacritics 1' for multilingual support

    // Check if FTS5 table exists and is contentless. If not, we drop and recreate.
    // This handles migration from old schema (duplicated content) to new (contentless).
    let fts_rebuild_needed = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE name = 'files_fts'",
            [],
            |row| {
                let sql: String = row.get(0)?;
                Ok(!sql.contains("content='files'"))
            },
        )
        .unwrap_or(false); // If table doesn't exist, it's false (or effectively strictly needed creation)

    if fts_rebuild_needed {
        let _ = conn.execute("DROP TABLE IF EXISTS files_fts", []);
        let _ = conn.execute("DROP TRIGGER IF EXISTS files_ai", []);
        let _ = conn.execute("DROP TRIGGER IF EXISTS files_ad", []);
        let _ = conn.execute("DROP TRIGGER IF EXISTS files_au", []);
    }

    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
            path,
            name, 
            content,
            file_type,
            content='files',
            content_rowid='rowid',
            tokenize='unicode61 remove_diacritics 1'
        )",
        [],
    )?;

    // Triggers to keep FTS5 in sync with main 'files' table automatically
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS files_ai AFTER INSERT ON files BEGIN
            INSERT INTO files_fts(rowid, path, name, content, file_type) 
            VALUES (new.rowid, new.path, new.name, new.content, new.file_type);
        END;",
        [],
    )?;

    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS files_ad AFTER DELETE ON files BEGIN
            INSERT INTO files_fts(files_fts, rowid, path, name, content, file_type) 
            VALUES('delete', old.rowid, old.path, old.name, old.content, old.file_type);
        END;",
        [],
    )?;

    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS files_au AFTER UPDATE ON files BEGIN
            INSERT INTO files_fts(files_fts, rowid, path, name, content, file_type)
            VALUES('delete', old.rowid, old.path, old.name, old.content, old.file_type);
            INSERT INTO files_fts(rowid, path, name, content, file_type)
            VALUES (new.rowid, new.path, new.name, new.content, new.file_type);
        END;",
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

    // Set initial schema version for new databases
    conn.execute(
        "INSERT OR IGNORE INTO metadata (key, value) VALUES ('schema_version', '1')",
        [],
    )?;

    Ok(())
}

/// Check FTS5 index health and return status
/// Returns (is_healthy, file_count, fts5_count)
pub fn check_fts5_health(conn: &Connection) -> Result<(bool, i64, i64), String> {
    // Get file count from main table
    let file_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0))
        .unwrap_or(0);

    // Get FTS5 count
    let fts5_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM files_fts", [], |row| row.get(0))
        .unwrap_or(0);

    // Check if counts match (healthy state)
    let is_healthy = file_count == fts5_count;

    println!(
        "[FTS5] Health check: files={}, fts5={}, healthy={}",
        file_count, fts5_count, is_healthy
    );

    Ok((is_healthy, file_count, fts5_count))
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
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    init_database(&conn).map_err(|e| e.to_string())?;

    // Enable WAL mode for concurrency
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;

    let files = state.index.read().map_err(|e| e.to_string())?;
    let folders = state.watched_folders.lock().map_err(|e| e.to_string())?;
    let excluded = state.excluded_folders.lock().map_err(|e| e.to_string())?;

    // Replace basic transaction with batched transaction for performance
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // We can clear tables, triggers will handle FTS cleanup automatically via 'files_ad' trigger
    // BUT for mass deletion it's faster to disable triggers or just clear both manually if we are doing a full rebuild.
    // However, simplest logic is:
    tx.execute("DELETE FROM files", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM folders", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM folder_exclusions", [])
        .map_err(|e| e.to_string())?;

    // Note: 'files_fts' is automatically updated by the DELETE on 'files' via triggers

    // Batch inserts for files
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO files (path, name, size, last_modified, file_type, content) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .map_err(|e| e.to_string())?;

        for file in files.iter() {
            stmt.execute(params![
                file.path,
                file.name,
                file.size,
                file.last_modified.to_rfc3339(),
                file.file_type,
                file.content
            ])
            .map_err(|e| e.to_string())?;
        }
    }
    // FTS5 insertions happen AUTOMATICALLY via triggers! No double-write needed.

    // Insert folders
    {
        let mut stmt = tx
            .prepare("INSERT OR REPLACE INTO folders (path, is_excluded) VALUES (?1, 0)")
            .map_err(|e| e.to_string())?;

        for folder in folders.iter() {
            stmt.execute(params![folder]).map_err(|e| e.to_string())?;
        }
    }

    // Insert exclusions
    {
        let mut stmt = tx
            .prepare("INSERT OR REPLACE INTO folder_exclusions (path) VALUES (?1)")
            .map_err(|e| e.to_string())?;

        for excl in excluded.iter() {
            stmt.execute(params![excl]).map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    // Set schema version to current version
    super::migrations::set_schema_version(&conn, super::migrations::CURRENT_SCHEMA_VERSION)?;

    let file_count = files.len();
    println!(
        "[Save] Saved {} files to SQLite (FTS5 attached)",
        file_count
    );

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
            None => {
                return Ok(serde_json::json!({
                    "loaded": false,
                    "message": "Data directory not set"
                }))
            }
        }
    };

    let db_path = data_dir.join("docufind.db");

    if !db_path.exists() {
        return Ok(serde_json::json!({
            "loaded": false,
            "message": "No saved index found"
        }));
    }

    // Check database version - if old version, delete and force re-index
    // This is simpler than complex migrations for 20 users
    {
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        let schema_version = super::migrations::get_schema_version(&conn);

        if schema_version < super::migrations::CURRENT_SCHEMA_VERSION {
            println!(
                "[Load] Old database version detected (v{}), deleting for clean upgrade...",
                schema_version
            );
            drop(conn); // Close connection before deleting

            // Delete old database
            std::fs::remove_file(&db_path).map_err(|e| e.to_string())?;

            // Also delete backup if exists
            let backup_path = db_path.with_extension("db.backup");
            if backup_path.exists() {
                let _ = std::fs::remove_file(&backup_path);
            }

            println!("[Load] Old database deleted. User will need to re-add folders.");
            return Ok(serde_json::json!({
                "loaded": false,
                "upgraded": true,
                "message": "Search engine upgraded! Please re-add your folders for faster search."
            }));
        }
    }

    let load_start = std::time::Instant::now();
    println!("[Load] Starting index load from {:?}", db_path);

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // Load folders
    let mut folder_stmt = conn
        .prepare("SELECT path FROM folders")
        .map_err(|e| e.to_string())?;
    let folder_rows = folder_stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut valid_folders: Vec<String> = Vec::new();
    for row in folder_rows {
        let path = row.map_err(|e| e.to_string())?;
        if Path::new(&path).exists() {
            valid_folders.push(path);
        }
    }

    // Load exclusions
    let mut excl_stmt = conn
        .prepare("SELECT path FROM folder_exclusions")
        .map_err(|e| e.to_string())?;
    let excl_rows = excl_stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

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
    let mut file_stmt = conn
        .prepare("SELECT path, name, size, last_modified, file_type, content FROM files")
        .map_err(|e| e.to_string())?;

    let file_rows = file_stmt
        .query_map([], |row| {
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
        })
        .map_err(|e| e.to_string())?;

    let mut valid_files: Vec<FileData> = Vec::new();
    for row in file_rows {
        let file = row.map_err(|e| e.to_string())?;
        if valid_folders
            .iter()
            .any(|folder| file.path.starts_with(folder))
            && Path::new(&file.path).exists()
        {
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

    // Store connection (database is already v2+ since we deleted old ones above)
    {
        let mut db_guard = state.db.lock().map_err(|e| e.to_string())?;
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        *db_guard = Some(conn);
    }

    // Quick FTS5 health check - should always pass for v2+ databases
    {
        let db_guard = state.db.lock().map_err(|e| e.to_string())?;
        if let Some(ref conn) = *db_guard {
            let (healthy, _db_count, fts_count) = check_fts5_health(conn)?;

            if healthy {
                println!(
                    "[FTS5] Index healthy, loaded {} entries instantly",
                    fts_count
                );
            } else if file_count > 0 {
                // This should rarely happen in v2+ databases, but handle it gracefully
                println!("[FTS5] Index mismatch detected, rebuilding...");
                let start = std::time::Instant::now();
                conn.execute("INSERT INTO files_fts(files_fts) VALUES('rebuild')", [])
                    .map_err(|e| e.to_string())?;
                println!("[FTS5] Rebuilt index in {:?}", start.elapsed());
            }
        }
    }

    let load_duration = load_start.elapsed();
    println!(
        "[Load] ✅ Total load time: {:?} ({} files)",
        load_duration, file_count
    );

    Ok(serde_json::json!({
        "loaded": true,
        "fileCount": file_count,
        "folderCount": folder_count,
        "folders": valid_folders,
        "excludedFolders": excluded_folders,
        "loadTimeMs": load_duration.as_millis()
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
    // Note: FTS5 index is cleared when files table is deleted below
    {
        let db_guard = state.db.lock().map_err(|e| e.to_string())?;
        if let Some(conn) = db_guard.as_ref() {
            // Use immediate checks
            conn.execute("DELETE FROM files", [])
                .map_err(|e| format!("Failed to delete files: {}", e))?;
            conn.execute("DELETE FROM folders", [])
                .map_err(|e| format!("Failed to delete folders: {}", e))?;
            conn.execute("DELETE FROM folder_exclusions", [])
                .map_err(|e| format!("Failed to delete exclusions: {}", e))?;

            // Vacuum to reclaim space and enforce disk sync
            conn.execute("VACUUM", [])
                .map_err(|e| format!("Failed to vacuum: {}", e))?;
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
        if let Ok(mut stmt) =
            conn.prepare("SELECT value FROM metadata WHERE key = 'doc_migration_done'")
        {
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
    )
    .map_err(|e| e.to_string())?;

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
                    if let Ok(mut stmt) =
                        conn.prepare("SELECT path FROM files WHERE file_type = 'word'")
                    {
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
    let _ = app.emit(
        "doc-indexing-started",
        serde_json::json!({
            "message": "Scanning for .doc files...",
            "total": 0
        }),
    );

    // Get data directory for database operations in background task
    let data_dir = {
        let dir_guard = state.data_dir.lock().map_err(|e| e.to_string())?;
        dir_guard.clone()
    };

    // Clone state for the background task
    let state_index = state.index.clone();
    // Note: Tantivy removed - using FTS5 only

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
            let file_name = file_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            if let Ok(metadata) = std::fs::metadata(file_path) {
                let size = metadata.len();
                if size == 0 {
                    continue;
                }

                let modified: DateTime<Utc> = metadata
                    .modified()
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

            // Note: Tantivy add removed - FTS5 is updated via save_index_internal
            // The files will be added to FTS5 when saved to database below

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
