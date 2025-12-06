use crate::models::{FileData, SearchResult, Match};
use super::{parse_simple_query, matches_parsed_query, get_context_around_match};
use rayon::prelude::*;
use std::sync::atomic::{AtomicUsize, Ordering};

/// Default maximum results to collect
const DEFAULT_MAX_RESULTS: usize = 100;

/// Check if a string is primarily Arabic/RTL script (no case transformation needed)
#[inline]
fn is_caseless_script(s: &str) -> bool {
    // Arabic, Hebrew, and other RTL scripts don't have case
    // Check first few chars to determine script
    s.chars()
        .take(20)
        .filter(|c| c.is_alphabetic())
        .take(5)
        .all(|c| {
            let code = c as u32;
            // Arabic: 0x0600-0x06FF, 0x0750-0x077F, 0xFB50-0xFDFF, 0xFE70-0xFEFF
            // Hebrew: 0x0590-0x05FF
            // Chinese: 0x4E00-0x9FFF
            // Japanese Hiragana/Katakana: 0x3040-0x30FF
            (0x0600..=0x06FF).contains(&code) ||  // Arabic
            (0x0750..=0x077F).contains(&code) ||  // Arabic Supplement
            (0xFB50..=0xFDFF).contains(&code) ||  // Arabic Presentation Forms-A
            (0xFE70..=0xFEFF).contains(&code) ||  // Arabic Presentation Forms-B
            (0x0590..=0x05FF).contains(&code) ||  // Hebrew
            (0x4E00..=0x9FFF).contains(&code) ||  // CJK Unified Ideographs
            (0x3040..=0x30FF).contains(&code)     // Japanese
        })
}

/// Direct substring search through all indexed content (for Arabic, Chinese, etc.)
/// Also supports basic AND/OR operators and exact phrase matching
/// 
/// OPTIMIZATIONS APPLIED:
/// 1. Skip lowercase for caseless scripts (Arabic, Chinese, Hebrew)
/// 2. Single lowercase conversion per file for Latin scripts
/// 3. Early termination once max_results found
/// 4. Parallel processing with rayon
/// 5. Optional single-file search mode
pub fn search_direct_content(
    query: &str,
    files: &[FileData],
    max_results: Option<usize>,
    file_path_filter: Option<&str>,
) -> Result<Vec<SearchResult>, String> {
    let max_results = max_results.unwrap_or(DEFAULT_MAX_RESULTS);
    
    // Detect if query is in a caseless script (Arabic, Chinese, etc.)
    let query_is_caseless = is_caseless_script(query);
    
    // For caseless scripts, use query as-is; otherwise lowercase
    let query_normalized = if query_is_caseless {
        query.to_string()
    } else {
        query.to_lowercase()
    };
    
    // Parse the query for operators
    let parsed_query = parse_simple_query(&query_normalized);
    
    // Atomic counter for early termination across threads
    let found_count = AtomicUsize::new(0);
    
    // Filter files if single-file search is requested
    let files_to_search: Vec<&FileData> = if let Some(path) = file_path_filter {
        files.iter().filter(|f| f.path == path).collect()
    } else {
        files.iter().collect()
    };
    
    // Use parallel iteration for speed on large indexes
    let mut results: Vec<SearchResult> = files_to_search
        .par_iter()
        .filter_map(|file| {
            // Early termination: stop processing if we have enough results
            if found_count.load(Ordering::Relaxed) >= max_results {
                return None;
            }
            
            // OPTIMIZATION: For caseless scripts, skip expensive lowercase conversion
            let (content_normalized, name_normalized) = if query_is_caseless {
                // For Arabic/Chinese/Hebrew, case doesn't exist - use original
                (file.content.clone(), file.name.clone())
            } else {
                // For Latin scripts, normalize to lowercase
                (file.content.to_lowercase(), file.name.to_lowercase())
            };
            
            // Fast path: quick check before parsing
            let content_has_match = content_normalized.contains(&query_normalized);
            let name_has_match = name_normalized.contains(&query_normalized);
            
            if !content_has_match && !name_has_match {
                return None;
            }
            
            // Check if file matches the parsed query (for AND/OR operators)
            if !parsed_query.required_terms.is_empty() || !parsed_query.optional_terms.is_empty() || !parsed_query.excluded_terms.is_empty() {
                let combined = format!("{} {}", name_normalized, content_normalized);
                if !matches_parsed_query(&combined, &parsed_query) {
                    return None;
                }
            }
            
            // For highlighting, use the first required term or the original query
            let highlight_term = parsed_query.required_terms.first()
                .or(parsed_query.optional_terms.first())
                .map(|s| s.as_str())
                .unwrap_or(&query_normalized);
            
            // Find matches using the normalized content
            let matches = find_matches_fast(&content_normalized, &name_normalized, &file.name, highlight_term);
            
            if matches.is_empty() {
                return None;
            }
            
            // Increment found counter
            found_count.fetch_add(1, Ordering::Relaxed);
            
            // Score based on match count and position
            let score = if name_has_match { 2.0 } else { 1.0 } 
                + (matches.len() as f32 * 0.1);
            
            Some(SearchResult {
                file: (*file).clone(),
                matches,
                score,
            })
        })
        .collect();
    
    // Sort by score descending
    results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    
    // Limit results
    results.truncate(max_results);
    
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
