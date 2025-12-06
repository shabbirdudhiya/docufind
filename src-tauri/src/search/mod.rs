//! Search functionality
//! 
//! This module provides search capabilities:
//! - SQLite FTS5 full-text search (ALL languages including Arabic, Chinese)
//! - Tantivy full-text search (English/Latin text - legacy)
//! - Direct content search (fallback)
//! - Query parsing with AND/OR/NOT operators
//! - Search history management
//! - Search filters (date, type, size)
//!
//! ARCHITECTURE:
//! - FTS5: Primary search engine for all languages (instant)
//! - Tantivy: Fast indexed search for ASCII (legacy support)
//! - Direct: Fallback when FTS5 not available

pub mod tantivy_search;
mod direct_search;
mod query_parser;
mod history;
mod filters;
pub mod fts5_search;

pub use tantivy_search::{create_tantivy_index, search_with_tantivy, TantivyComponents, add_document_to_tantivy, delete_document_from_tantivy};
pub use direct_search::search_direct_content;
pub use query_parser::{parse_simple_query, matches_parsed_query, ParsedQuery};
pub use history::{SearchHistory, MAX_HISTORY_ENTRIES};
pub use filters::apply_filters;
pub use fts5_search::{search_fts5, has_fts5_data, rebuild_fts5_index};

use crate::models::Match;

/// Find matches in content and return Match structs with context
/// Used primarily by Tantivy search results
#[inline]
pub fn find_matches_in_content(content: &str, name: &str, query_lower: &str) -> Vec<Match> {
    let content_lower = content.to_lowercase();
    let mut matches = Vec::with_capacity(5);
    
    // Find content matches (limit to 5 for performance)
    for (byte_idx, _) in content_lower.match_indices(query_lower).take(5) {
        let context = get_context_around_match(content, byte_idx, query_lower.len(), 50);
        matches.push(Match {
            text: query_lower.to_string(),
            index: byte_idx,
            context,
        });
    }
    
    // Check filename match only if no content matches found
    if matches.is_empty() && name.to_lowercase().contains(query_lower) {
        matches.push(Match {
            text: query_lower.to_string(),
            index: 0,
            context: format!("Filename: {}", name),
        });
    }
    
    matches
}

/// Safely extract context around a match, respecting UTF-8 character boundaries
/// 
/// OPTIMIZATION: Fast path for ASCII content (most common case for English)
/// Falls back to char iteration for non-ASCII content
#[inline]
pub fn get_context_around_match(
    content: &str,
    match_byte_idx: usize,
    match_len: usize,
    context_chars: usize,
) -> String {
    // Fast path: ASCII content can use byte indices directly
    if content.is_ascii() {
        let start = match_byte_idx.saturating_sub(context_chars);
        let end = (match_byte_idx + match_len + context_chars).min(content.len());
        return content[start..end].to_string();
    }
    
    // Slow path: Non-ASCII requires careful char boundary handling
    // Use a more efficient approach - iterate once and track positions
    let mut char_positions: Vec<usize> = Vec::with_capacity(content.len() / 2);
    char_positions.push(0);
    for (byte_pos, _) in content.char_indices().skip(1) {
        char_positions.push(byte_pos);
    }
    char_positions.push(content.len());
    
    // Binary search to find the char index for match_byte_idx
    let match_char_idx = match char_positions.binary_search(&match_byte_idx) {
        Ok(idx) => idx,
        Err(idx) => idx.saturating_sub(1),
    };
    
    // Calculate context boundaries in char space
    let start_char = match_char_idx.saturating_sub(context_chars);
    let end_char = (match_char_idx + match_len + context_chars).min(char_positions.len() - 1);
    
    // Convert back to byte indices
    let start_byte = char_positions[start_char];
    let end_byte = char_positions[end_char];
    
    content[start_byte..end_byte].to_string()
}
