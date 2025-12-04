use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::*;
use tantivy::{doc, Index, IndexReader, IndexWriter, ReloadPolicy};
use chrono::{DateTime, Utc};

use crate::models::{FileData, SearchResult};
use super::find_matches_in_content;

/// Tantivy search index components
pub struct TantivyComponents {
    pub index: Index,
    pub reader: IndexReader,
    pub writer: IndexWriter,
    pub schema: Schema,
}

/// Create a new Tantivy in-memory index
pub fn create_tantivy_index() -> TantivyComponents {
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
    
    TantivyComponents {
        index,
        reader,
        writer,
        schema,
    }
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
pub fn search_with_tantivy(
    query: &str,
    index: &Index,
    reader: &IndexReader,
    schema: &Schema,
) -> Result<Vec<SearchResult>, String> {
    let searcher = reader.searcher();
    
    let name_field = schema.get_field("name").unwrap();
    let content_field = schema.get_field("content").unwrap();
    let path_field = schema.get_field("path").unwrap();
    let file_type_field = schema.get_field("file_type").unwrap();
    let size_field = schema.get_field("size").unwrap();
    let modified_field = schema.get_field("modified").unwrap();
    
    // Create query parser that searches both name and content
    let query_parser = QueryParser::for_index(index, vec![name_field, content_field]);
    
    // Detect if the query uses advanced syntax
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
    
    // Filter to only results with matches and limit to 100
    Ok(results
        .into_iter()
        .filter(|r| !r.matches.is_empty())
        .take(100)
        .collect())
}

/// Add a document to the Tantivy index
pub fn add_document_to_tantivy(
    writer: &mut IndexWriter,
    schema: &Schema,
    file: &FileData,
) -> Result<(), String> {
    let path_field = schema.get_field("path").unwrap();
    let name_field = schema.get_field("name").unwrap();
    let content_field = schema.get_field("content").unwrap();
    let file_type_field = schema.get_field("file_type").unwrap();
    let size_field = schema.get_field("size").unwrap();
    let modified_field = schema.get_field("modified").unwrap();
    
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
    
    Ok(())
}

/// Delete a document from the Tantivy index by path
pub fn delete_document_from_tantivy(
    writer: &mut IndexWriter,
    schema: &Schema,
    path: &str,
) -> Result<(), String> {
    let path_field = schema.get_field("path").unwrap();
    writer.delete_term(tantivy::Term::from_field_text(path_field, path));
    Ok(())
}
