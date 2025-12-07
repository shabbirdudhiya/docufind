//! SQLite FTS5 Full-Text Search
//!
//! Uses SQLite's built-in FTS5 for fast multilingual full-text search.
//! FTS5 with unicode61 tokenizer handles Arabic, Chinese, Hebrew, and all Unicode scripts.
//!
//! This is MUCH faster than direct content search because:
//! 1. FTS5 uses an inverted index (like Tantivy)
//! 2. Searches are O(log n) instead of O(n)
//! 3. No need to scan all file contents

use chrono::Utc;
use rusqlite::{params, Connection};
use std::collections::HashSet;

use crate::models::{FileData, Match, SearchResult};

/// Search using SQLite FTS5 full-text search
///
/// This provides instant search for ANY language including Arabic, Chinese, etc.
/// Returns up to `max_results` files matching the query.
pub fn search_fts5(
    conn: &Connection,
    query: &str,
    max_results: usize,
    offset: usize,
    file_path_filter: Option<&str>,
    excluded_folders: &HashSet<String>,
) -> Result<Vec<SearchResult>, String> {
    let start = std::time::Instant::now();

    // Prepare FTS5 query - just use the query as-is, FTS5 handles tokenization
    let fts_query = query.trim().to_string();
    if fts_query.is_empty() {
        return Ok(Vec::new());
    }

    println!(
        "[FTS5] Searching for: '{}' (max: {}, offset: {})",
        fts_query, max_results, offset
    );

    let mut results = Vec::new();

    // Super simple, fast query - NO snippet, NO ordering (both are slow!)
    // Just get the matching file paths/names
    let sql = if file_path_filter.is_some() {
        "SELECT path, name, file_type
         FROM files_fts 
         WHERE files_fts MATCH ?1 AND path = ?2
         LIMIT ?3 OFFSET ?4"
    } else {
        "SELECT path, name, file_type
         FROM files_fts 
         WHERE files_fts MATCH ?1
         LIMIT ?2 OFFSET ?3"
    };

    let mut stmt = conn.prepare(sql).map_err(|e| {
        println!("[FTS5] SQL Error: {}", e);
        e.to_string()
    })?;

    let rows_result = if let Some(file_path) = file_path_filter {
        stmt.query(params![
            &fts_query,
            file_path,
            max_results as i64,
            offset as i64
        ])
    } else {
        stmt.query(params![&fts_query, max_results as i64, offset as i64])
    };

    let mut rows = rows_result.map_err(|e| {
        println!("[FTS5] Query Error: {}", e);
        e.to_string()
    })?;

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let path: String = row.get(0).unwrap_or_default();
        let name: String = row.get(1).unwrap_or_default();
        let file_type: String = row.get(2).unwrap_or_default();

        // Skip excluded folders
        if !excluded_folders.is_empty() {
            if excluded_folders.iter().any(|excl| path.starts_with(excl)) {
                continue;
            }
        }

        // Create minimal FileData - we'll fetch full content only when user opens the file
        let file_data = FileData {
            path: path.clone(),
            name,
            size: 0,                   // We don't need size for search results
            last_modified: Utc::now(), // Placeholder
            file_type,
            content: String::new(), // Don't fetch full content - it's slow!
        };

        // Simple match - context will be loaded when user clicks on result
        let matches = vec![Match {
            text: query.to_string(),
            index: 0,
            context: format!("Match found for '{}'", query),
        }];

        results.push(SearchResult {
            file: file_data,
            matches,
            score: 1.0,
        });
    }

    println!(
        "[FTS5] Found {} results in {:?}",
        results.len(),
        start.elapsed()
    );

    Ok(results)
}

/// Check if database has FTS5 table populated
pub fn has_fts5_data(conn: &Connection) -> bool {
    conn.query_row("SELECT COUNT(*) FROM files_fts", [], |row| {
        row.get::<_, i64>(0)
    })
    .map(|count| count > 0)
    .unwrap_or(false)
}

/// Rebuild FTS5 index from files table
/// Call this if FTS5 table is empty but files table has data
pub fn rebuild_fts5_index(conn: &Connection) -> Result<(), String> {
    // Clear existing FTS5 data
    conn.execute("DELETE FROM files_fts", [])
        .map_err(|e| e.to_string())?;

    // Populate from files table
    // Use the standard rebuild command which is optimized and correct for all FTS5 configurations
    // especially contentless/external content tables
    conn.execute("INSERT INTO files_fts(files_fts) VALUES('rebuild')", [])
        .map_err(|e| e.to_string())?;

    Ok(())
}
