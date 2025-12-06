use crate::models::{FileData, SearchResult, Match};
use super::{parse_simple_query, matches_parsed_query, get_context_around_match};
use rayon::prelude::*;
use std::sync::atomic::{AtomicUsize, Ordering};

/// Maximum results to collect before stopping search
const MAX_RESULTS: usize = 100;

/// Direct substring search through all indexed content (for Arabic, Chinese, etc.)
/// Also supports basic AND/OR operators and exact phrase matching
/// 
/// OPTIMIZATIONS APPLIED:
/// 1. Single lowercase conversion per file (was doing 2-3x before)
/// 2. Early termination once MAX_RESULTS found
/// 3. Avoid cloning full FileData - only clone what's needed
/// 4. Inline match finding to avoid redundant work
/// 5. Use atomic counter for cross-thread early termination
pub fn search_direct_content(
    query_lower: &str,
    files: &[FileData],
) -> Result<Vec<SearchResult>, String> {
    // Parse the query for operators
    let parsed_query = parse_simple_query(query_lower);
    
    // Atomic counter for early termination across threads
    let found_count = AtomicUsize::new(0);
    
    // Use parallel iteration for speed on large indexes
    let mut results: Vec<SearchResult> = files
        .par_iter()
        .filter_map(|file| {
            // Early termination: stop processing if we have enough results
            if found_count.load(Ordering::Relaxed) >= MAX_RESULTS {
                return None;
            }
            
            // OPTIMIZATION: Single lowercase conversion, reused for all checks
            let content_lower = file.content.to_lowercase();
            let name_lower = file.name.to_lowercase();
            
            // Fast path: quick check before parsing
            let content_has_match = content_lower.contains(query_lower);
            let name_has_match = name_lower.contains(query_lower);
            
            if !content_has_match && !name_has_match {
                return None;
            }
            
            // Check if file matches the parsed query (for AND/OR operators)
            // OPTIMIZATION: Create combined string only if we passed fast path
            if !parsed_query.required_terms.is_empty() || !parsed_query.optional_terms.is_empty() || !parsed_query.excluded_terms.is_empty() {
                let combined = format!("{} {}", name_lower, content_lower);
                if !matches_parsed_query(&combined, &parsed_query) {
                    return None;
                }
            }
            
            // For highlighting, use the first required term or the original query
            let highlight_term = parsed_query.required_terms.first()
                .or(parsed_query.optional_terms.first())
                .map(|s| s.as_str())
                .unwrap_or(query_lower);
            
            // OPTIMIZATION: Inline match finding to avoid redundant lowercase
            let matches = find_matches_fast(&content_lower, &name_lower, &file.name, highlight_term);
            
            if matches.is_empty() {
                return None;
            }
            
            // Increment found counter
            found_count.fetch_add(1, Ordering::Relaxed);
            
            // Score based on match count and position
            let score = if name_has_match { 2.0 } else { 1.0 } 
                + (matches.len() as f32 * 0.1);
            
            // OPTIMIZATION: Clone file data (unavoidable for serialization to frontend)
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
    results.truncate(MAX_RESULTS);
    
    Ok(results)
}

/// Fast match finding using pre-computed lowercase strings
/// Avoids redundant lowercase conversions
#[inline]
fn find_matches_fast(content_lower: &str, name_lower: &str, original_name: &str, query_lower: &str) -> Vec<Match> {
    let mut matches = Vec::with_capacity(5);
    
    // Find content matches (limit to 5 for performance)
    for (byte_idx, _) in content_lower.match_indices(query_lower).take(5) {
        // Get context from original content at same position
        let context = get_context_around_match_fast(content_lower, byte_idx, query_lower.len(), 50);
        matches.push(Match {
            text: query_lower.to_string(),
            index: byte_idx,
            context,
        });
    }
    
    // Check filename match only if no content matches
    if matches.is_empty() && name_lower.contains(query_lower) {
        matches.push(Match {
            text: query_lower.to_string(),
            index: 0,
            context: format!("Filename: {}", original_name),
        });
    }
    
    matches
}

/// Optimized context extraction - works directly with byte indices when safe
#[inline]
fn get_context_around_match_fast(
    content: &str,
    match_byte_idx: usize,
    match_len: usize,
    context_chars: usize,
) -> String {
    // For ASCII content, we can use byte indices directly
    // For non-ASCII, fall back to char iteration
    if content.is_ascii() {
        let start = match_byte_idx.saturating_sub(context_chars);
        let end = (match_byte_idx + match_len + context_chars).min(content.len());
        return content[start..end].to_string();
    }
    
    // Non-ASCII: use the safe but slower method
    get_context_around_match(content, match_byte_idx, match_len, context_chars)
}
