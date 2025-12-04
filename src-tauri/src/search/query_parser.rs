use regex::Regex;

/// Parsed query structure for direct content search
pub struct ParsedQuery {
    pub required_terms: Vec<String>,      // AND terms (all must match)
    pub optional_terms: Vec<String>,      // OR terms (at least one must match if no required)
    pub excluded_terms: Vec<String>,      // NOT terms (must not match)
    pub exact_phrases: Vec<String>,       // Exact phrase matches
}

/// Parse a simple query string into components
/// 
/// Supports:
/// - AND: `hello AND world` or `+hello +world`
/// - OR: `hello OR world` (default for space-separated)
/// - NOT: `hello NOT world` or `-world`
/// - Exact phrase: `"hello world"`
pub fn parse_simple_query(query: &str) -> ParsedQuery {
    let mut required = Vec::new();
    let mut optional = Vec::new();
    let mut excluded = Vec::new();
    let mut exact_phrases = Vec::new();
    
    // Extract exact phrases first (quoted strings)
    let mut remaining = query.to_string();
    let phrase_regex = Regex::new(r#""([^"]+)""#).unwrap();
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
pub fn matches_parsed_query(text: &str, query: &ParsedQuery) -> bool {
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

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_simple_query() {
        let parsed = parse_simple_query("hello world");
        assert_eq!(parsed.optional_terms, vec!["hello", "world"]);
        assert!(parsed.required_terms.is_empty());
    }
    
    #[test]
    fn test_and_query() {
        let parsed = parse_simple_query("hello AND world");
        assert!(parsed.optional_terms.is_empty());
        assert_eq!(parsed.required_terms.len(), 2);
    }
    
    #[test]
    fn test_not_query() {
        let parsed = parse_simple_query("hello -spam");
        assert_eq!(parsed.excluded_terms, vec!["spam"]);
    }
    
    #[test]
    fn test_exact_phrase() {
        let parsed = parse_simple_query("\"exact phrase\"");
        assert_eq!(parsed.exact_phrases, vec!["exact phrase"]);
    }
}
