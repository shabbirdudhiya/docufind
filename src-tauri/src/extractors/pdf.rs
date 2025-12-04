use std::fs;
use std::path::Path;

/// Extract text content from a PDF file
/// 
/// This extracts text from "digital-native" PDFs that contain
/// selectable text. Scanned documents (image-only PDFs) will
/// return empty or minimal content - no OCR is performed.
/// 
/// Uses the pdf-extract crate which is lightweight and offline.
pub fn extract_pdf(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    
    match pdf_extract::extract_text_from_mem(&bytes) {
        Ok(text) => {
            let trimmed = text.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }
        Err(e) => {
            // Log error but don't fail - some PDFs may be malformed or image-only
            eprintln!("⚠️ PDF extraction failed for {:?}: {}", path, e);
            None
        }
    }
}

/// Check if a PDF has extractable text content
/// 
/// Returns true if the PDF contains meaningful text (more than 50 chars).
/// Can be used to detect image-only/scanned PDFs.
pub fn pdf_has_text(path: &Path) -> bool {
    match extract_pdf(path) {
        Some(text) => text.len() > 50,
        None => false,
    }
}

/// Estimate if PDF extraction will be slow based on file size
/// 
/// Large PDFs (>10MB) may take significant time to process.
pub fn is_large_pdf(path: &Path) -> bool {
    match fs::metadata(path) {
        Ok(meta) => meta.len() > 10 * 1024 * 1024, // 10MB
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_extract_nonexistent_file() {
        let result = extract_pdf(Path::new("/nonexistent/file.pdf"));
        assert!(result.is_none());
    }
    
    #[test]
    fn test_pdf_has_text_nonexistent() {
        assert!(!pdf_has_text(Path::new("/nonexistent/file.pdf")));
    }
}
