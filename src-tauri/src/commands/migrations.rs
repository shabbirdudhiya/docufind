//! Database schema migrations
//!
//! Handles safe upgrades between schema versions with rollback support.
//!
//! Migration Strategy:
//! - Each migration is a one-way operation
//! - Database is backed up before migration
//! - Version is tracked in metadata table
//! - Migrations run synchronously to ensure consistency

use rusqlite::Connection;
use std::fs;
use std::path::Path;

/// Current schema version
pub const CURRENT_SCHEMA_VERSION: u32 = 2;

/// Get current schema version from database
pub fn get_schema_version(conn: &Connection) -> u32 {
    conn.query_row(
        "SELECT value FROM metadata WHERE key = 'schema_version'",
        [],
        |row| row.get::<_, String>(0),
    )
    .ok()
    .and_then(|v| v.parse().ok())
    .unwrap_or(1) // Default to v1 for existing databases
}

/// Set schema version in database
pub fn set_schema_version(conn: &Connection, version: u32) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO metadata (key, value) VALUES ('schema_version', ?1)",
        [version.to_string()],
    )
    .map_err(|e| format!("Failed to set schema version: {}", e))?;
    Ok(())
}

/// Create backup of database before migrations
pub fn backup_database(db_path: &Path) -> Result<std::path::PathBuf, String> {
    let backup_path = db_path.with_extension("db.backup");

    // Remove old backup if exists
    if backup_path.exists() {
        fs::remove_file(&backup_path).map_err(|e| format!("Failed to remove old backup: {}", e))?;
    }

    // Copy current DB to backup
    fs::copy(db_path, &backup_path).map_err(|e| format!("Failed to create backup: {}", e))?;

    println!("[Migration] Created backup at {:?}", backup_path);
    Ok(backup_path)
}

/// Run all pending migrations
pub fn run_migrations(conn: &Connection, db_path: &Path) -> Result<bool, String> {
    let current_version = get_schema_version(conn);

    if current_version >= CURRENT_SCHEMA_VERSION {
        println!("[Migration] Schema up to date (v{})", current_version);
        return Ok(false); // No migration needed
    }

    println!(
        "[Migration] Upgrading schema from v{} to v{}",
        current_version, CURRENT_SCHEMA_VERSION
    );

    // Create backup before migration
    backup_database(db_path)?;

    // Run migrations in order
    if current_version < 2 {
        migrate_v1_to_v2(conn)?;
    }

    // Future migrations would go here:
    // if current_version < 3 {
    //     migrate_v2_to_v3(conn)?;
    // }

    set_schema_version(conn, CURRENT_SCHEMA_VERSION)?;
    println!(
        "[Migration] Complete! Now at schema v{}",
        CURRENT_SCHEMA_VERSION
    );

    Ok(true) // Migration was performed
}

/// Migration v1 -> v2: Optimize FTS5 tokenizer for Arabic text
///
/// Changes:
/// - Recreates files_fts with unicode61 + remove_diacritics tokenizer
/// - Better handling of Arabic, Hebrew, Chinese text
fn migrate_v1_to_v2(conn: &Connection) -> Result<(), String> {
    println!("[Migration] v1->v2: Optimizing FTS5 for Arabic/Unicode text...");
    let start = std::time::Instant::now();

    // Get current file count for progress
    let file_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0))
        .unwrap_or(0);

    println!("[Migration] v1->v2: Processing {} files...", file_count);

    // Use transaction for atomicity
    conn.execute("BEGIN TRANSACTION", [])
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    // Drop old FTS5 table
    conn.execute("DROP TABLE IF EXISTS files_fts", [])
        .map_err(|e| format!("Failed to drop old FTS5 table: {}", e))?;

    // Create new FTS5 with optimized Arabic tokenizer
    conn.execute(
        "CREATE VIRTUAL TABLE files_fts USING fts5(
            path,
            name,
            content,
            file_type,
            tokenize='unicode61 remove_diacritics 1'
        )",
        [],
    )
    .map_err(|e| format!("Failed to create optimized FTS5 table: {}", e))?;

    // Repopulate from files table
    let inserted = conn
        .execute(
            "INSERT INTO files_fts (path, name, content, file_type) 
             SELECT path, name, content, file_type FROM files",
            [],
        )
        .map_err(|e| format!("Failed to populate FTS5 table: {}", e))?;

    conn.execute("COMMIT", [])
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;

    println!(
        "[Migration] v1->v2: Indexed {} files in {:?}",
        inserted,
        start.elapsed()
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_schema_version() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            [],
        )
        .unwrap();

        // Default version should be 1
        assert_eq!(get_schema_version(&conn), 1);

        // Set and get version
        set_schema_version(&conn, 2).unwrap();
        assert_eq!(get_schema_version(&conn), 2);
    }
}
