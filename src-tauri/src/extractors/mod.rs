//! Document content extractors
//! 
//! This module provides text extraction for various document formats:
//! - DOCX (Microsoft Word)
//! - PPTX (Microsoft PowerPoint)  
//! - XLSX (Microsoft Excel)
//! - PDF (Portable Document Format)
//! - TXT/MD (Plain text)

mod docx;
mod pptx;
mod xlsx;
mod pdf;
mod text;

pub use docx::extract_docx;
pub use pptx::extract_pptx;
pub use xlsx::extract_xlsx;
pub use pdf::extract_pdf;
pub use text::extract_text;

use std::path::Path;

/// Supported file extensions for fast indexing (non-PDF)
pub const FAST_EXTENSIONS: &[&str] = &["docx", "pptx", "xlsx", "txt", "md"];

/// PDF extension for background indexing
pub const PDF_EXTENSION: &str = "pdf";

/// All supported extensions
pub const ALL_EXTENSIONS: &[&str] = &["docx", "pptx", "xlsx", "txt", "md", "pdf"];

/// Extract content from any supported file type
pub fn extract_content(path: &Path, ext: &str) -> Option<String> {
    match ext {
        "txt" | "md" => extract_text(path),
        "docx" => extract_docx(path),
        "pptx" => extract_pptx(path),
        "xlsx" => extract_xlsx(path),
        "pdf" => extract_pdf(path),
        _ => None,
    }
}

/// Check if extension is supported
pub fn is_supported_extension(ext: &str) -> bool {
    ALL_EXTENSIONS.contains(&ext.to_lowercase().as_str())
}

/// Check if extension is a "fast" type (non-PDF)
pub fn is_fast_extension(ext: &str) -> bool {
    FAST_EXTENSIONS.contains(&ext.to_lowercase().as_str())
}

/// Get file type string from extension
pub fn get_file_type(ext: &str) -> Option<&'static str> {
    match ext.to_lowercase().as_str() {
        "docx" => Some("word"),
        "pptx" => Some("powerpoint"),
        "xlsx" => Some("excel"),
        "pdf" => Some("pdf"),
        "txt" | "md" => Some("text"),
        _ => None,
    }
}
