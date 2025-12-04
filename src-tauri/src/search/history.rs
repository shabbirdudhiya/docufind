use chrono::Utc;
use std::collections::VecDeque;
use serde::{Deserialize, Serialize};

use crate::models::SearchHistoryEntry;

/// Maximum number of search history entries to keep
pub const MAX_HISTORY_ENTRIES: usize = 50;

/// Search history manager
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct SearchHistory {
    entries: VecDeque<SearchHistoryEntry>,
}

impl SearchHistory {
    pub fn new() -> Self {
        Self {
            entries: VecDeque::with_capacity(MAX_HISTORY_ENTRIES),
        }
    }
    
    /// Add a new search to history
    pub fn add(&mut self, query: String, result_count: usize) {
        // Don't add empty queries
        if query.trim().is_empty() {
            return;
        }
        
        // Remove existing entry with same query (we'll add fresh one at front)
        self.entries.retain(|e| e.query.to_lowercase() != query.to_lowercase());
        
        // Add new entry at front
        self.entries.push_front(SearchHistoryEntry {
            query,
            timestamp: Utc::now(),
            result_count,
        });
        
        // Trim to max size
        while self.entries.len() > MAX_HISTORY_ENTRIES {
            self.entries.pop_back();
        }
    }
    
    /// Get all history entries (most recent first)
    pub fn get_all(&self) -> Vec<SearchHistoryEntry> {
        self.entries.iter().cloned().collect()
    }
    
    /// Get recent entries (limited count)
    pub fn get_recent(&self, count: usize) -> Vec<SearchHistoryEntry> {
        self.entries.iter().take(count).cloned().collect()
    }
    
    /// Clear all history
    pub fn clear(&mut self) {
        self.entries.clear();
    }
    
    /// Remove a specific entry by query
    pub fn remove(&mut self, query: &str) {
        self.entries.retain(|e| e.query.to_lowercase() != query.to_lowercase());
    }
    
    /// Search history entries matching a prefix (for autocomplete)
    pub fn search(&self, prefix: &str) -> Vec<SearchHistoryEntry> {
        let prefix_lower = prefix.to_lowercase();
        self.entries
            .iter()
            .filter(|e| e.query.to_lowercase().starts_with(&prefix_lower))
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_add_and_get() {
        let mut history = SearchHistory::new();
        history.add("test query".to_string(), 10);
        
        let entries = history.get_all();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].query, "test query");
    }
    
    #[test]
    fn test_dedup() {
        let mut history = SearchHistory::new();
        history.add("test".to_string(), 10);
        history.add("other".to_string(), 5);
        history.add("test".to_string(), 15); // Duplicate
        
        let entries = history.get_all();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].query, "test"); // Most recent at front
        assert_eq!(entries[0].result_count, 15);
    }
    
    #[test]
    fn test_max_entries() {
        let mut history = SearchHistory::new();
        for i in 0..60 {
            history.add(format!("query{}", i), i);
        }
        
        assert_eq!(history.get_all().len(), MAX_HISTORY_ENTRIES);
    }
}
