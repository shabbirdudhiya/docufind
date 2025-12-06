use crate::models::{FileData, SearchResult};
use super::{find_matches_in_content, parse_simple_query, matches_parsed_query};
use rayon::prelude::*;

/// Direct substring search through all indexed content (for Arabic, Chinese, etc.)
/// Also supports basic AND/OR operators and exact phrase matching
/// Optimized with parallel search for speed
pub fn search_direct_content(
    query_lower: &str,
    files: &[FileData],
) -> Result<Vec<SearchResult>, String> {
    // Parse the query for operators
    let parsed_query = parse_simple_query(query_lower);
    
    // Use parallel iteration for speed on large indexes
    let mut results: Vec<SearchResult> = files
        .par_iter()
        .filter_map(|file| {
            // Fast path: check if content contains the query before expensive operations
            // Use case-insensitive contains for non-ASCII (Arabic, etc.)
            let content_has_match = file.content.to_lowercase().contains(query_lower);
            let name_has_match = file.name.to_lowercase().contains(query_lower);
            
            if !content_has_match && !name_has_match {
                return None;
            }
            
            let content_lower = file.content.to_lowercase();
            let name_lower = file.name.to_lowercase();
            let combined = format!("{} {}", name_lower, content_lower);
            
            // Check if file matches the parsed query (for AND/OR operators)
            if !matches_parsed_query(&combined, &parsed_query) {
                return None;
            }
            
            // For highlighting, use the first required term or the original query
            let highlight_term = parsed_query.required_terms.first()
                .or(parsed_query.optional_terms.first())
                .map(|s| s.as_str())
                .unwrap_or(query_lower);
            
            let matches = find_matches_in_content(&file.content, &file.name, highlight_term);
            
            // Score based on match count and position
            let score = if name_has_match { 2.0 } else { 1.0 } 
                + (matches.len() as f32 * 0.1);
            
            Some(SearchResult {
                file: file.clone(),
                matches,
                score,
            })
        })
        .collect();
    
    // Sort by score descending
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    
    // Limit to top 100 results
    results.truncate(100);
    
    Ok(results)
}
