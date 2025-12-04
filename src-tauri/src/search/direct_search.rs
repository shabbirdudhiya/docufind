use crate::models::{FileData, SearchResult};
use super::{find_matches_in_content, parse_simple_query, matches_parsed_query};

/// Direct substring search through all indexed content (for Arabic, Chinese, etc.)
/// Also supports basic AND/OR operators and exact phrase matching
pub fn search_direct_content(
    query_lower: &str,
    files: &[FileData],
) -> Result<Vec<SearchResult>, String> {
    let mut results: Vec<SearchResult> = Vec::new();
    
    // Parse the query for operators
    let parsed_query = parse_simple_query(query_lower);
    
    for file in files.iter() {
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
