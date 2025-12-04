//! Search functionality
//! 
//! This module provides search capabilities:
//! - Tantivy full-text search (English/Latin text)
//! - Direct content search (Arabic, Chinese, other scripts)
//! - Query parsing with AND/OR/NOT operators
//! - Search history management
//! - Search filters (date, type, size)

pub mod tantivy_search;
mod direct_search;
mod query_parser;
mod history;
mod filters;

pub use tantivy_search::{create_tantivy_index, search_with_tantivy, TantivyComponents, add_document_to_tantivy, delete_document_from_tantivy};
pub use direct_search::search_direct_content;
pub use query_parser::{parse_simple_query, matches_parsed_query, ParsedQuery};
pub use history::{SearchHistory, MAX_HISTORY_ENTRIES};
pub use filters::apply_filters;

use crate::models::Match;

/// Find matches in content and return Match structs with context
pub fn find_matches_in_content(content: &str, name: &str, query_lower: &str) -> Vec<Match> {
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

/// Safely extract context around a match, respecting UTF-8 character boundaries
pub fn get_context_around_match(
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
