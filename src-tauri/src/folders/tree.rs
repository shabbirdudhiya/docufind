use std::collections::{HashMap, HashSet};
use std::path::Path;

use crate::models::{FileData, FolderNode};

/// Build a hierarchical folder tree from indexed files
/// 
/// This creates a tree structure that can be rendered in the UI
/// for users to easily toggle folder exclusions.
pub fn build_folder_tree(
    files: &[FileData],
    root_folders: &HashSet<String>,
    excluded_folders: &HashSet<String>,
) -> Vec<FolderNode> {
    let mut builder = FolderTreeBuilder::new(excluded_folders.clone());
    
    // Add all file paths to build the tree
    for file in files {
        builder.add_path(&file.path);
    }
    
    // Build trees for each root folder
    let mut trees = Vec::new();
    for root in root_folders {
        if let Some(tree) = builder.build_tree(root) {
            trees.push(tree);
        }
    }
    
    trees
}

/// Builder for constructing folder trees
pub struct FolderTreeBuilder {
    /// Map of folder path -> set of immediate child folders
    folder_children: HashMap<String, HashSet<String>>,
    
    /// Map of folder path -> file count
    folder_file_counts: HashMap<String, usize>,
    
    /// Set of excluded folder paths
    excluded: HashSet<String>,
}

impl FolderTreeBuilder {
    pub fn new(excluded: HashSet<String>) -> Self {
        Self {
            folder_children: HashMap::new(),
            folder_file_counts: HashMap::new(),
            excluded,
        }
    }
    
    /// Add a file path to the tree builder
    pub fn add_path(&mut self, file_path: &str) {
        let path = Path::new(file_path);
        
        // Walk up the directory tree
        let mut current = path.parent();
        let mut child: Option<&Path> = None;
        
        while let Some(dir) = current {
            let dir_str = dir.to_string_lossy().to_string();
            
            // Count file in this directory
            *self.folder_file_counts.entry(dir_str.clone()).or_insert(0) += 1;
            
            // Register child folder relationship
            if let Some(child_path) = child {
                let child_str = child_path.to_string_lossy().to_string();
                self.folder_children
                    .entry(dir_str.clone())
                    .or_insert_with(HashSet::new)
                    .insert(child_str);
            }
            
            child = Some(dir);
            current = dir.parent();
        }
    }
    
    /// Build the tree starting from a root folder
    pub fn build_tree(&self, root: &str) -> Option<FolderNode> {
        let root_path = Path::new(root);
        
        if !root_path.exists() {
            return None;
        }
        
        Some(self.build_node(root))
    }
    
    /// Recursively build a folder node and its children
    fn build_node(&self, path: &str) -> FolderNode {
        let folder_path = Path::new(path);
        let name = folder_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string());
        
        let file_count = self.folder_file_counts.get(path).copied().unwrap_or(0);
        let is_excluded = self.is_excluded(path);
        
        // Build children
        let mut children = Vec::new();
        if let Some(child_paths) = self.folder_children.get(path) {
            let mut sorted_children: Vec<_> = child_paths.iter().collect();
            sorted_children.sort();
            
            for child_path in sorted_children {
                children.push(self.build_node(child_path));
            }
        }
        
        FolderNode {
            path: path.to_string(),
            name,
            is_excluded,
            file_count,
            children,
        }
    }
    
    /// Check if a folder is excluded (directly or via parent)
    fn is_excluded(&self, path: &str) -> bool {
        // Check direct exclusion
        if self.excluded.contains(path) {
            return true;
        }
        
        // Check if any parent is excluded
        let mut current = Path::new(path).parent();
        while let Some(parent) = current {
            let parent_str = parent.to_string_lossy().to_string();
            if self.excluded.contains(&parent_str) {
                return true;
            }
            current = parent.parent();
        }
        
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    
    fn make_file(path: &str) -> FileData {
        FileData {
            path: path.to_string(),
            name: Path::new(path).file_name().unwrap().to_string_lossy().to_string(),
            size: 100,
            last_modified: Utc::now(),
            file_type: "word".to_string(),
            content: "test".to_string(),
        }
    }
    
    #[test]
    fn test_build_simple_tree() {
        let files = vec![
            make_file("C:\\Users\\test\\doc1.docx"),
            make_file("C:\\Users\\test\\doc2.docx"),
            make_file("C:\\Users\\test\\sub\\doc3.docx"),
        ];
        
        let mut roots = HashSet::new();
        roots.insert("C:\\Users\\test".to_string());
        
        let trees = build_folder_tree(&files, &roots, &HashSet::new());
        
        assert_eq!(trees.len(), 1);
        assert_eq!(trees[0].name, "test");
        assert_eq!(trees[0].file_count, 3); // All files under this root
    }
    
    #[test]
    fn test_exclusion_inheritance() {
        let excluded: HashSet<String> = vec!["C:\\Users\\test".to_string()].into_iter().collect();
        let builder = FolderTreeBuilder::new(excluded);
        
        // Child should inherit parent's exclusion
        assert!(builder.is_excluded("C:\\Users\\test\\sub"));
    }
}
