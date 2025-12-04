use crate::models::{SearchResult, SearchFilters};

/// Apply filters to search results
pub fn apply_filters(results: Vec<SearchResult>, filters: &SearchFilters) -> Vec<SearchResult> {
    results.into_iter().filter(|r| {
        // Filter by file type
        if let Some(ref types) = filters.file_types {
            if !types.is_empty() && !types.contains(&r.file.file_type) {
                return false;
            }
        }
        
        // Filter by date range
        if let Some(from) = filters.date_from {
            if r.file.last_modified < from {
                return false;
            }
        }
        if let Some(to) = filters.date_to {
            if r.file.last_modified > to {
                return false;
            }
        }
        
        // Filter by size
        if let Some(min) = filters.min_size {
            if r.file.size < min {
                return false;
            }
        }
        if let Some(max) = filters.max_size {
            if r.file.size > max {
                return false;
            }
        }
        
        // Filter by folder path
        if let Some(ref folder) = filters.folder_path {
            if !r.file.path.starts_with(folder) {
                return false;
            }
        }
        
        true
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use crate::models::{FileData, Match};
    
    fn make_result(file_type: &str, size: u64) -> SearchResult {
        SearchResult {
            file: FileData {
                path: "/test/file.docx".to_string(),
                name: "file.docx".to_string(),
                size,
                last_modified: Utc::now(),
                file_type: file_type.to_string(),
                content: "test content".to_string(),
            },
            matches: vec![Match {
                text: "test".to_string(),
                index: 0,
                context: "test content".to_string(),
            }],
            score: 1.0,
        }
    }
    
    #[test]
    fn test_filter_by_type() {
        let results = vec![
            make_result("word", 100),
            make_result("powerpoint", 200),
            make_result("word", 300),
        ];
        
        let filters = SearchFilters {
            file_types: Some(vec!["word".to_string()]),
            ..Default::default()
        };
        
        let filtered = apply_filters(results, &filters);
        assert_eq!(filtered.len(), 2);
    }
    
    #[test]
    fn test_filter_by_size() {
        let results = vec![
            make_result("word", 100),
            make_result("word", 500),
            make_result("word", 1000),
        ];
        
        let filters = SearchFilters {
            min_size: Some(200),
            max_size: Some(800),
            ..Default::default()
        };
        
        let filtered = apply_filters(results, &filters);
        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].file.size, 500);
    }
}
