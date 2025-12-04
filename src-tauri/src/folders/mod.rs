//! Folder management
//! 
//! Handles folder tree building for hierarchical exclusion UI,
//! folder hierarchy operations, and path utilities.

mod tree;

pub use tree::{build_folder_tree, FolderTreeBuilder};

use std::path::Path;

/// Normalize a folder path for consistent comparison
pub fn normalize_path(path: &str) -> String {
    let mut normalized = path.replace('/', "\\");
    if !normalized.ends_with('\\') {
        normalized.push('\\');
    }
    normalized
}

/// Check if a path is under a parent folder
pub fn is_under_folder(path: &str, folder: &str) -> bool {
    let norm_path = normalize_path(path);
    let norm_folder = normalize_path(folder);
    norm_path.starts_with(&norm_folder)
}

/// Get the parent folder of a path
pub fn get_parent_folder(path: &str) -> Option<String> {
    Path::new(path).parent().map(|p| p.to_string_lossy().to_string())
}

/// Extract folder name from full path
pub fn get_folder_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_normalize_path() {
        assert_eq!(normalize_path("C:/Users/test"), "C:\\Users\\test\\");
        assert_eq!(normalize_path("C:\\Users\\test\\"), "C:\\Users\\test\\");
    }
    
    #[test]
    fn test_is_under_folder() {
        assert!(is_under_folder("C:\\Users\\test\\doc.txt", "C:\\Users"));
        assert!(is_under_folder("C:\\Users\\test\\sub\\doc.txt", "C:\\Users\\test"));
        assert!(!is_under_folder("C:\\Other\\doc.txt", "C:\\Users"));
    }
}
