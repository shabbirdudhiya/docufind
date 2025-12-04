use std::fs;
use std::path::Path;

/// Extract content from plain text files (txt, md)
/// 
/// Simply reads the file content as UTF-8 text.
pub fn extract_text(path: &Path) -> Option<String> {
    fs::read_to_string(path).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_extract_nonexistent_file() {
        let result = extract_text(Path::new("/nonexistent/file.txt"));
        assert!(result.is_none());
    }
}
