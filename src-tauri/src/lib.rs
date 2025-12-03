use chrono::{DateTime, Utc};
#[allow(unused_imports)]
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::{Mutex, RwLock};
use tauri::{AppHandle, Emitter, State};
use walkdir::WalkDir;
use xml::reader::{EventReader, XmlEvent};
use zip::ZipArchive;

// Tantivy full-text search
use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::*;
use tantivy::{doc, Index, IndexReader, IndexWriter, ReloadPolicy};

// File watching
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::mpsc::channel;
use std::thread;
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileData {
    path: String,
    name: String,
    size: u64,
    last_modified: DateTime<Utc>,
    file_type: String,
    content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    file: FileData,
    matches: Vec<Match>,
    score: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Match {
    text: String,
    index: usize,
    context: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderInfo {
    path: String,
    file_count: usize,
}

struct AppState {
    index: RwLock<Vec<FileData>>,
    watched_folders: Mutex<HashSet<String>>,
    watcher: Mutex<Option<RecommendedWatcher>>,
    // Tantivy search index
    tantivy_index: Index,
    tantivy_reader: IndexReader,
    tantivy_writer: Mutex<IndexWriter>,
    tantivy_schema: Schema,
}

fn create_tantivy_index() -> (Index, IndexReader, IndexWriter, Schema) {
    let mut schema_builder = Schema::builder();
    
    // Fields for our documents
    schema_builder.add_text_field("path", STRING | STORED);
    schema_builder.add_text_field("name", TEXT | STORED);
    schema_builder.add_text_field("content", TEXT | STORED);
    schema_builder.add_text_field("file_type", STRING | STORED);
    schema_builder.add_u64_field("size", STORED);
    schema_builder.add_i64_field("modified", STORED);
    
    let schema = schema_builder.build();
    
    // Create in-memory index (faster than disk for our use case)
    let index = Index::create_in_ram(schema.clone());
    
    let writer = index
        .writer(50_000_000) // 50MB buffer
        .expect("Failed to create index writer");
    
    let reader = index
        .reader_builder()
        .reload_policy(ReloadPolicy::OnCommitWithDelay)
        .try_into()
        .expect("Failed to create index reader");
    
    (index, reader, writer, schema)
}

impl Default for AppState {
    fn default() -> Self {
        let (index, reader, writer, schema) = create_tantivy_index();
        Self {
            index: RwLock::new(Vec::new()),
            watched_folders: Mutex::new(HashSet::new()),
            watcher: Mutex::new(None),
            tantivy_index: index,
            tantivy_reader: reader,
            tantivy_writer: Mutex::new(writer),
            tantivy_schema: schema,
        }
    }
}

/// Progress event payload for frontend
#[derive(Debug, Serialize, Clone)]
struct IndexingProgress {
    current: usize,
    total: usize,
    filename: String,
    phase: String, // "discovering", "indexing", "finalizing"
}

/// Scan a single folder and add to index (supports multiple folders)
#[tauri::command]
async fn scan_folder(path: String, state: State<'_, AppState>, app: AppHandle) -> Result<Vec<FileData>, String> {
    println!("🔍 Scanning folder: {}", path);

    // Phase 1: Discover all files first (quick)
    let _ = app.emit("indexing-progress", IndexingProgress {
        current: 0,
        total: 0,
        filename: "Discovering files...".to_string(),
        phase: "discovering".to_string(),
    });

    // Collect all valid file entries first
    let file_entries: Vec<_> = WalkDir::new(&path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|entry| {
            let file_name = entry.file_name().to_string_lossy().to_string();
            // Skip hidden and temp files
            if file_name.starts_with('.') || file_name.starts_with("~$") {
                return false;
            }
            // Only include supported extensions
            if let Some(ext) = entry.path().extension() {
                let ext_str = ext.to_str().unwrap_or("").to_lowercase();
                return ["docx", "pptx", "txt", "md"].contains(&ext_str.as_str());
            }
            false
        })
        .collect();

    let total_files = file_entries.len();
    println!("📁 Found {} files to index", total_files);

    let _ = app.emit("indexing-progress", IndexingProgress {
        current: 0,
        total: total_files,
        filename: format!("Found {} documents to index", total_files),
        phase: "indexing".to_string(),
    });

    // Phase 2: Process files with progress tracking
    // Use atomic counter for thread-safe progress tracking
    let progress_counter = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let last_emitted = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let app_handle = app.clone();
    let total_for_closure = total_files;

    let new_files: Vec<FileData> = file_entries
        .par_iter()
        .filter_map(|entry| {
            let file_path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();
            let ext = file_path.extension()?.to_str()?.to_lowercase();

            let file_type = match ext.as_str() {
                "docx" => "word",
                "pptx" => "powerpoint",
                "txt" | "md" => "text",
                _ => return None,
            };

            let metadata = entry.metadata().ok()?;
            let size = metadata.len();

            // Skip empty files
            if size == 0 {
                return None;
            }

            let modified: DateTime<Utc> = metadata.modified().ok()?.into();
            let path_str = file_path.to_string_lossy().to_string();

            let content = extract_content(file_path, &ext).unwrap_or_default();

            // Update progress counter
            let current = progress_counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
            
            // Emit progress every ~2% or at least every 10 files to avoid flooding
            let emit_threshold = std::cmp::max(1, total_for_closure / 50);
            let last = last_emitted.load(std::sync::atomic::Ordering::SeqCst);
            if current - last >= emit_threshold || current == total_for_closure {
                last_emitted.store(current, std::sync::atomic::Ordering::SeqCst);
                let _ = app_handle.emit("indexing-progress", IndexingProgress {
                    current,
                    total: total_for_closure,
                    filename: file_name.clone(),
                    phase: "indexing".to_string(),
                });
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

    // Phase 3: Finalizing
    let _ = app.emit("indexing-progress", IndexingProgress {
        current: total_files,
        total: total_files,
        filename: "Building search index...".to_string(),
        phase: "finalizing".to_string(),
    });

    println!(
        "✅ Scan complete: {} files found in {}",
        new_files.len(),
        path
    );

    // Add folder to watched list
    {
        let mut folders = state.watched_folders.lock().map_err(|e| e.to_string())?;
        folders.insert(path);
    }

    // Update index - merge with existing files from other folders
    {
        let mut index = state.index.write().map_err(|e| e.to_string())?;
        // Remove files from this folder first (in case of rescan)
        index.retain(|f| !new_files.iter().any(|nf| nf.path == f.path));
        // Add new files
        index.extend(new_files.clone());
    }

    // Index into Tantivy for full-text search
    {
        let mut writer = state.tantivy_writer.lock().map_err(|e| e.to_string())?;
        let schema = &state.tantivy_schema;
        
        let path_field = schema.get_field("path").unwrap();
        let name_field = schema.get_field("name").unwrap();
        let content_field = schema.get_field("content").unwrap();
        let file_type_field = schema.get_field("file_type").unwrap();
        let size_field = schema.get_field("size").unwrap();
        let modified_field = schema.get_field("modified").unwrap();
        
        for file in &new_files {
            // Delete existing document with same path
            writer.delete_term(tantivy::Term::from_field_text(path_field, &file.path));
            
            // Add new document
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

    Ok(new_files)
}

/// Add multiple folders at once
#[tauri::command]
async fn add_folders(
    paths: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Vec<FolderInfo>, String> {
    let mut results = Vec::new();

    for path in paths {
        let files = scan_folder_internal(&path, &state)?;
        results.push(FolderInfo {
            path: path.clone(),
            file_count: files.len(),
        });
    }

    Ok(results)
}

/// Remove a folder from the index
#[tauri::command]
async fn remove_folder(path: String, state: State<'_, AppState>) -> Result<(), String> {
    println!("🗑️ Removing folder from index: {}", path);

    // Remove from watched folders
    {
        let mut folders = state.watched_folders.lock().map_err(|e| e.to_string())?;
        folders.remove(&path);
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

    Ok(())
}

/// Get list of currently indexed folders
#[tauri::command]
async fn get_indexed_folders(state: State<'_, AppState>) -> Result<Vec<FolderInfo>, String> {
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

/// Internal function to scan folder without async
fn scan_folder_internal(path: &str, state: &State<'_, AppState>) -> Result<Vec<FileData>, String> {
    let new_files: Vec<FileData> = WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .par_bridge()
        .filter_map(|entry| {
            let file_path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();

            if file_name.starts_with('.') || file_name.starts_with("~$") {
                return None;
            }

            let ext = file_path.extension()?.to_str()?.to_lowercase();

            let file_type = match ext.as_str() {
                "docx" => "word",
                "pptx" => "powerpoint",
                "txt" | "md" => "text",
                _ => return None,
            };

            let metadata = entry.metadata().ok()?;
            let size = metadata.len();
            if size == 0 {
                return None;
            }

            let modified: DateTime<Utc> = metadata.modified().ok()?.into();
            let path_str = file_path.to_string_lossy().to_string();
            let content = extract_content(file_path, &ext).unwrap_or_default();

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

    // Add folder to watched list
    {
        let mut folders = state.watched_folders.lock().map_err(|e| e.to_string())?;
        folders.insert(path.to_string());
    }

    // Update Vec index
    {
        let mut index = state.index.write().map_err(|e| e.to_string())?;
        index.retain(|f| !new_files.iter().any(|nf| nf.path == f.path));
        index.extend(new_files.clone());
    }

    // Index into Tantivy
    {
        let mut writer = state.tantivy_writer.lock().map_err(|e| e.to_string())?;
        let schema = &state.tantivy_schema;
        
        let path_field = schema.get_field("path").unwrap();
        let name_field = schema.get_field("name").unwrap();
        let content_field = schema.get_field("content").unwrap();
        let file_type_field = schema.get_field("file_type").unwrap();
        let size_field = schema.get_field("size").unwrap();
        let modified_field = schema.get_field("modified").unwrap();
        
        for file in &new_files {
            writer.delete_term(tantivy::Term::from_field_text(path_field, &file.path));
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

    Ok(new_files)
}

fn extract_content(path: &Path, ext: &str) -> Option<String> {
    match ext {
        "txt" | "md" => fs::read_to_string(path).ok(),
        "docx" => extract_docx(path),
        "pptx" => extract_pptx(path),
        _ => None,
    }
}

fn extract_docx(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let mut content = String::new();

    if let Ok(mut document) = archive.by_name("word/document.xml") {
        let mut xml = String::new();
        document.read_to_string(&mut xml).ok()?;

        // Simple XML parsing to extract text
        let reader = EventReader::from_str(&xml);
        for event in reader {
            if let Ok(XmlEvent::Characters(text)) = event {
                content.push_str(&text);
                content.push(' ');
            }
        }
    }
    Some(content)
}

fn extract_pptx(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let mut content = String::new();

    // PPTX stores slides in ppt/slides/slide1.xml, slide2.xml, etc.
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).ok()?;
        let name = file.name().to_string();

        if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") {
            let mut xml = String::new();
            file.read_to_string(&mut xml).ok()?;

            // Extract text from <a:t> tags (PowerPoint text elements)
            let reader = EventReader::from_str(&xml);
            for event in reader {
                if let Ok(XmlEvent::Characters(text)) = event {
                    content.push_str(&text);
                    content.push(' ');
                }
            }
            content.push('\n');
        }
    }

    if content.is_empty() {
        None
    } else {
        Some(content)
    }
}

/// Command to extract file content for preview
#[tauri::command]
async fn extract_file_content(file_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    extract_content(path, &ext).ok_or_else(|| "Failed to extract content".to_string())
}

#[tauri::command]
async fn search_index(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    println!("🔎 Searching for: '{}'", query);
    
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    
    let query_lower = query.to_lowercase();
    
    // First, try tantivy search for English/Latin text
    let mut results = search_with_tantivy(&query, &state)?;
    
    // If tantivy found nothing, do a direct content search
    // This handles Arabic, Chinese, and other non-Latin scripts better
    if results.is_empty() {
        println!("📝 Tantivy found nothing, trying direct content search...");
        results = search_direct_content(&query_lower, &state)?;
    }
    
    println!("✅ Search complete: {} results found", results.len());
    Ok(results)
}

/// Search using Tantivy's full-text search (good for English/Latin)
/// 
/// Supported query syntax:
/// - Simple terms: `hello world` (implicit OR)
/// - AND: `hello AND world` or `+hello +world`
/// - OR: `hello OR world`
/// - Exact phrase: `"hello world"`
/// - Exclude: `-unwanted` or `NOT unwanted`
/// - Wildcard: `hel*` (prefix), `h?llo` (single char)
/// - Field-specific: `name:report` or `content:budget`
fn search_with_tantivy(
    query: &str,
    state: &State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    let schema = &state.tantivy_schema;
    let searcher = state.tantivy_reader.searcher();
    
    let name_field = schema.get_field("name").unwrap();
    let content_field = schema.get_field("content").unwrap();
    let path_field = schema.get_field("path").unwrap();
    let file_type_field = schema.get_field("file_type").unwrap();
    let size_field = schema.get_field("size").unwrap();
    let modified_field = schema.get_field("modified").unwrap();
    
    // Create query parser that searches both name and content
    let query_parser = QueryParser::for_index(&state.tantivy_index, vec![name_field, content_field]);
    
    // Detect if the query uses advanced syntax (AND, OR, NOT, quotes, wildcards, field:, +, -)
    let uses_advanced_syntax = query.contains(" AND ") 
        || query.contains(" OR ") 
        || query.contains(" NOT ")
        || query.contains('"')
        || query.contains('*')
        || query.contains('?')
        || query.contains(':')
        || query.starts_with('+')
        || query.starts_with('-')
        || query.contains(" +")
        || query.contains(" -");
    
    // Try parsing query - avoid fuzzy for non-ASCII or advanced queries
    let has_non_ascii = query.chars().any(|c| !c.is_ascii());
    let tantivy_query = if has_non_ascii || uses_advanced_syntax {
        // For Arabic/non-Latin or advanced queries, parse as-is
        query_parser.parse_query(query)
    } else {
        // For simple ASCII text, try fuzzy matching for typo tolerance
        query_parser
            .parse_query(&format!("{}~1", query))
            .or_else(|_| query_parser.parse_query(query))
    }.map_err(|e| e.to_string())?;
    
    // Execute search - get top 100 results
    let top_docs = searcher
        .search(&tantivy_query, &TopDocs::with_limit(100))
        .map_err(|e| e.to_string())?;
    
    let query_lower = query.to_lowercase();
    let mut results: Vec<SearchResult> = Vec::new();
    
    for (score, doc_address) in top_docs {
        let retrieved_doc: tantivy::TantivyDocument = searcher.doc(doc_address).map_err(|e| e.to_string())?;
        
        let path = retrieved_doc
            .get_first(path_field)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        
        let name = retrieved_doc
            .get_first(name_field)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        
        let content = retrieved_doc
            .get_first(content_field)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        
        let file_type = retrieved_doc
            .get_first(file_type_field)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        
        let size = retrieved_doc
            .get_first(size_field)
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        
        let modified_ts = retrieved_doc
            .get_first(modified_field)
            .and_then(|v| v.as_i64())
            .unwrap_or(0);
        
        let last_modified = DateTime::from_timestamp(modified_ts, 0)
            .unwrap_or_else(|| Utc::now());
        
        // Find matches with context
        let matches = find_matches_in_content(&content, &name, &query_lower);
        
        results.push(SearchResult {
            file: FileData {
                path,
                name,
                size,
                last_modified,
                file_type,
                content,
            },
            matches,
            score,
        });
    }
    
    results
        .into_iter()
        .filter(|r| !r.matches.is_empty())
        .collect::<Vec<_>>()
        .into_iter()
        .take(100)
        .collect::<Vec<_>>()
        .pipe(Ok)
}

/// Direct substring search through all indexed content (for Arabic, Chinese, etc.)
/// Also supports basic AND/OR operators and exact phrase matching
fn search_direct_content(
    query_lower: &str,
    state: &State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    let index = state.index.read().map_err(|e| e.to_string())?;
    let mut results: Vec<SearchResult> = Vec::new();
    
    // Parse the query for operators
    let parsed_query = parse_simple_query(query_lower);
    
    for file in index.iter() {
        let content_lower = file.content.to_lowercase();
        let name_lower = file.name.to_lowercase();
        let combined = format!("{} {}", name_lower, content_lower);
        
        // Check if file matches the parsed query
        if !matches_parsed_query(&combined, &parsed_query) {
            continue;
        }
        
        // For highlighting, use the first required term or the original query
        let highlight_term = parsed_query.required_terms.first()
            .or(parsed_query.optional_terms.first())
            .map(|s| s.as_str())
            .unwrap_or(query_lower);
        
        let matches = find_matches_in_content(&file.content, &file.name, highlight_term);
        
        // Score based on match count and position
        let in_name = parsed_query.required_terms.iter().any(|t| name_lower.contains(t))
            || parsed_query.optional_terms.iter().any(|t| name_lower.contains(t));
        let score = if in_name { 2.0 } else { 1.0 } 
            + (matches.len() as f32 * 0.1);
        
        results.push(SearchResult {
            file: file.clone(),
            matches,
            score,
        });
    }
    
    // Sort by score descending
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    
    Ok(results.into_iter().take(100).collect())
}

/// Parsed query structure for direct content search
struct ParsedQuery {
    required_terms: Vec<String>,      // AND terms (all must match)
    optional_terms: Vec<String>,      // OR terms (at least one must match if no required)
    excluded_terms: Vec<String>,      // NOT terms (must not match)
    exact_phrases: Vec<String>,       // Exact phrase matches
}

/// Parse a simple query string into components
fn parse_simple_query(query: &str) -> ParsedQuery {
    let mut required = Vec::new();
    let mut optional = Vec::new();
    let mut excluded = Vec::new();
    let mut exact_phrases = Vec::new();
    
    // Extract exact phrases first (quoted strings)
    let mut remaining = query.to_string();
    let phrase_regex = regex::Regex::new(r#""([^"]+)""#).unwrap();
    for cap in phrase_regex.captures_iter(query) {
        if let Some(phrase) = cap.get(1) {
            exact_phrases.push(phrase.as_str().to_lowercase());
        }
    }
    remaining = phrase_regex.replace_all(&remaining, " ").to_string();
    
    // Split by AND/OR keywords
    let parts: Vec<&str> = remaining.split_whitespace().collect();
    let mut i = 0;
    let mut has_and = false;
    
    while i < parts.len() {
        let part = parts[i];
        
        if part.eq_ignore_ascii_case("AND") {
            has_and = true;
            i += 1;
            continue;
        }
        
        if part.eq_ignore_ascii_case("OR") {
            i += 1;
            continue;
        }
        
        if part.eq_ignore_ascii_case("NOT") || part.starts_with('-') {
            let term = if part.starts_with('-') {
                &part[1..]
            } else if i + 1 < parts.len() {
                i += 1;
                parts[i]
            } else {
                i += 1;
                continue;
            };
            if !term.is_empty() {
                excluded.push(term.to_lowercase());
            }
            i += 1;
            continue;
        }
        
        if part.starts_with('+') {
            let term = &part[1..];
            if !term.is_empty() {
                required.push(term.to_lowercase());
            }
        } else {
            optional.push(part.to_lowercase());
        }
        
        i += 1;
    }
    
    // If AND was used anywhere, treat all optional terms as required
    if has_and {
        required.extend(optional.drain(..));
    }
    
    // Exact phrases are always required
    required.extend(exact_phrases.iter().cloned());
    
    ParsedQuery {
        required_terms: required,
        optional_terms: optional,
        excluded_terms: excluded,
        exact_phrases,
    }
}

/// Check if text matches the parsed query
fn matches_parsed_query(text: &str, query: &ParsedQuery) -> bool {
    // Check excluded terms first
    for term in &query.excluded_terms {
        if text.contains(term) {
            return false;
        }
    }
    
    // Check exact phrases
    for phrase in &query.exact_phrases {
        if !text.contains(phrase) {
            return false;
        }
    }
    
    // Check required terms (all must match)
    for term in &query.required_terms {
        if !text.contains(term) {
            return false;
        }
    }
    
    // If we have optional terms and no required terms, at least one optional must match
    if query.required_terms.is_empty() && !query.optional_terms.is_empty() {
        return query.optional_terms.iter().any(|term| text.contains(term));
    }
    
    true
}

/// Find matches in content and return Match structs with context
fn find_matches_in_content(content: &str, name: &str, query_lower: &str) -> Vec<Match> {
    let content_lower = content.to_lowercase();
    let mut matches = Vec::new();
    
    // Find content matches
    for (byte_idx, _) in content_lower.match_indices(query_lower).take(5) {
        let context = get_context_around_match(content, byte_idx, query_lower.len(), 50);
        matches.push(Match {
            text: query_lower.to_string(),
            index: byte_idx,
            context,
        });
    }
    
    // Check filename match
    if name.to_lowercase().contains(query_lower) && matches.is_empty() {
        matches.push(Match {
            text: query_lower.to_string(),
            index: 0,
            context: format!("Filename: {}", name),
        });
    }
    
    matches
}

// Helper trait for pipe operator
trait Pipe: Sized {
    fn pipe<T, F: FnOnce(Self) -> T>(self, f: F) -> T {
        f(self)
    }
}

impl<S: Sized> Pipe for S {}

/// Safely extract context around a match, respecting UTF-8 character boundaries
fn get_context_around_match(
    content: &str,
    match_byte_idx: usize,
    match_len: usize,
    context_chars: usize,
) -> String {
    // Convert byte index to char index
    let char_indices: Vec<(usize, char)> = content.char_indices().collect();

    // Find the char index corresponding to the byte index
    let match_char_idx = char_indices
        .iter()
        .position(|(byte_pos, _)| *byte_pos >= match_byte_idx)
        .unwrap_or(0);

    // Calculate start and end char indices for context
    let start_char = match_char_idx.saturating_sub(context_chars);
    let end_char = (match_char_idx + match_len + context_chars).min(char_indices.len());

    // Extract the substring using char indices
    let start_byte = char_indices.get(start_char).map(|(b, _)| *b).unwrap_or(0);
    let end_byte = char_indices
        .get(end_char)
        .map(|(b, _)| *b)
        .unwrap_or(content.len());

    content[start_byte..end_byte].to_string()
}

/// Command to move file to trash
#[tauri::command]
async fn delete_file(file_path: String, state: State<'_, AppState>) -> Result<(), String> {
    // Use trash crate to move to system trash
    trash::delete(&file_path).map_err(|e| e.to_string())?;

    // Remove from Vec index
    {
        let mut index = state.index.write().map_err(|e| e.to_string())?;
        index.retain(|f| f.path != file_path);
    }
    
    // Remove from Tantivy index
    {
        let mut writer = state.tantivy_writer.lock().map_err(|e| e.to_string())?;
        let path_field = state.tantivy_schema.get_field("path").unwrap();
        writer.delete_term(tantivy::Term::from_field_text(path_field, &file_path));
        writer.commit().map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Command to open file with default application
#[tauri::command]
async fn open_file(file_path: String) -> Result<(), String> {
    opener::open(&file_path).map_err(|e| e.to_string())
}

/// Command to show file in folder/explorer
#[tauri::command]
async fn show_in_folder(file_path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &file_path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &file_path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        // Try various file managers
        if std::process::Command::new("nautilus")
            .args(["--select", &file_path])
            .spawn()
            .is_err()
        {
            if std::process::Command::new("dolphin")
                .args(["--select", &file_path])
                .spawn()
                .is_err()
            {
                // Fallback: open containing folder
                let parent = std::path::Path::new(&file_path)
                    .parent()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default();
                opener::open(&parent).map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(())
}

/// Start watching folders for changes
#[tauri::command]
async fn start_watching(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let folders = state
        .watched_folders
        .lock()
        .map_err(|e| e.to_string())?
        .clone();

    if folders.is_empty() {
        return Err("No folders to watch".to_string());
    }

    // Stop existing watcher
    {
        let mut watcher_guard = state.watcher.lock().map_err(|e| e.to_string())?;
        *watcher_guard = None;
    }

    let (tx, rx) = channel();

    let config = Config::default().with_poll_interval(Duration::from_secs(2));

    let mut watcher = RecommendedWatcher::new(tx, config).map_err(|e| e.to_string())?;

    // Watch all indexed folders
    for folder in &folders {
        watcher
            .watch(Path::new(folder), RecursiveMode::Recursive)
            .map_err(|e| format!("Failed to watch {}: {}", folder, e))?;
    }

    // Store watcher
    {
        let mut watcher_guard = state.watcher.lock().map_err(|e| e.to_string())?;
        *watcher_guard = Some(watcher);
    }

    // Spawn thread to handle events
    let app_handle = app.clone();
    thread::spawn(move || {
        let mut debounce_map: std::collections::HashMap<String, std::time::Instant> =
            std::collections::HashMap::new();
        let debounce_duration = Duration::from_millis(500);

        for res in rx {
            match res {
                Ok(event) => {
                    for path in event.paths {
                        let path_str = path.to_string_lossy().to_string();

                        // Debounce: skip if we've seen this path recently
                        let now = std::time::Instant::now();
                        if let Some(last_time) = debounce_map.get(&path_str) {
                            if now.duration_since(*last_time) < debounce_duration {
                                continue;
                            }
                        }
                        debounce_map.insert(path_str.clone(), now);

                        // Check if it's a supported file
                        if let Some(ext) = path.extension() {
                            let ext_str = ext.to_string_lossy().to_lowercase();
                            if ["docx", "pptx", "txt", "md"].contains(&ext_str.as_str()) {
                                let file_name = path
                                    .file_name()
                                    .map(|n| n.to_string_lossy().to_string())
                                    .unwrap_or_default();

                                // Skip temp files
                                if file_name.starts_with('.') || file_name.starts_with("~$") {
                                    continue;
                                }

                                match event.kind {
                                    notify::EventKind::Create(_) | notify::EventKind::Modify(_) => {
                                        let _ = app_handle.emit(
                                            "file-changed",
                                            serde_json::json!({
                                                "type": "modified",
                                                "path": path_str
                                            }),
                                        );
                                    }
                                    notify::EventKind::Remove(_) => {
                                        let _ = app_handle.emit(
                                            "file-changed",
                                            serde_json::json!({
                                                "type": "removed",
                                                "path": path_str
                                            }),
                                        );
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Watch error: {:?}", e);
                }
            }
        }
    });

    println!("👀 Started watching {} folders", folders.len());
    Ok(())
}

/// Stop watching folders
#[tauri::command]
async fn stop_watching(state: State<'_, AppState>) -> Result<(), String> {
    let mut watcher_guard = state.watcher.lock().map_err(|e| e.to_string())?;
    *watcher_guard = None;
    println!("🛑 Stopped watching folders");
    Ok(())
}

/// Clear entire index
#[tauri::command]
async fn clear_index(state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut index = state.index.write().map_err(|e| e.to_string())?;
        index.clear();
    }
    {
        let mut folders = state.watched_folders.lock().map_err(|e| e.to_string())?;
        folders.clear();
    }
    {
        let mut watcher = state.watcher.lock().map_err(|e| e.to_string())?;
        *watcher = None;
    }
    // Clear Tantivy index
    {
        let mut writer = state.tantivy_writer.lock().map_err(|e| e.to_string())?;
        writer.delete_all_documents().map_err(|e| e.to_string())?;
        writer.commit().map_err(|e| e.to_string())?;
    }
    println!("🧹 Cleared index");
    Ok(())
}

/// Get total indexed file count
#[tauri::command]
async fn get_index_stats(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    let index = state.index.read().map_err(|e| e.to_string())?;
    let folders = state.watched_folders.lock().map_err(|e| e.to_string())?;

    let word_count = index.iter().filter(|f| f.file_type == "word").count();
    let pptx_count = index.iter().filter(|f| f.file_type == "powerpoint").count();
    let text_count = index.iter().filter(|f| f.file_type == "text").count();
    let total_size: u64 = index.iter().map(|f| f.size).sum();

    Ok(serde_json::json!({
        "totalFiles": index.len(),
        "wordFiles": word_count,
        "powerPointFiles": pptx_count,
        "textFiles": text_count,
        "totalSize": total_size,
        "folderCount": folders.len()
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            scan_folder,
            add_folders,
            remove_folder,
            get_indexed_folders,
            search_index,
            extract_file_content,
            delete_file,
            open_file,
            show_in_folder,
            start_watching,
            stop_watching,
            clear_index,
            get_index_stats
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            app.handle().plugin(tauri_plugin_fs::init())?;
            app.handle().plugin(tauri_plugin_shell::init())?;
            app.handle().plugin(tauri_plugin_dialog::init())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
