//! Document content extractors
//! 
//! This module provides text extraction for various document formats:
//! - DOCX (Microsoft Word)
//! - PPTX (Microsoft PowerPoint)  
//! - XLSX (Microsoft Excel)
//! - TXT/MD (Plain text)

mod docx;
mod pptx;
mod xlsx;
mod text;

pub use docx::extract_docx;
pub use docx::extract_docx_structured;
pub use pptx::extract_pptx;
pub use xlsx::extract_xlsx;
pub use text::extract_text;

use std::path::Path;
use crate::models::DocumentContent;

/// Supported file extensions
pub const SUPPORTED_EXTENSIONS: &[&str] = &["docx", "pptx", "xlsx", "txt", "md"];

/// All supported extensions (alias for compatibility)
pub const ALL_EXTENSIONS: &[&str] = SUPPORTED_EXTENSIONS;

/// Extract content from any supported file type
pub fn extract_content(path: &Path, ext: &str) -> Option<String> {
    match ext {
        "txt" | "md" => extract_text(path),
        "docx" => extract_docx(path),
        "pptx" => extract_pptx(path),
        "xlsx" => extract_xlsx(path),
        _ => None,
    }
}

/// Extract structured content from any supported file type (for rich preview)
pub fn extract_content_structured(path: &Path, ext: &str) -> Option<DocumentContent> {
    match ext {
        "docx" => extract_docx_structured(path),
        // TODO: Add structured extraction for other formats
        // "pptx" => extract_pptx_structured(path),
        // "xlsx" => extract_xlsx_structured(path),
        // For txt/md, we return plain text wrapped in a simple structure
        "txt" | "md" => {
            extract_text(path).map(|content| {
                DocumentContent {
                    doc_type: "text".to_string(),
                    sections: vec![crate::models::ContentSection {
                        section_type: crate::models::SectionType::Paragraph,
                        content: Some(content),
                        runs: None,
                        children: None,
                        properties: None,
                    }],
                    metadata: crate::models::DocumentMetadata::default(),
                }
            })
        }
        _ => None,
    }
}

/// Check if extension is supported
pub fn is_supported_extension(ext: &str) -> bool {
    ALL_EXTENSIONS.contains(&ext.to_lowercase().as_str())
}

/// Get file type string from extension
pub fn get_file_type(ext: &str) -> Option<&'static str> {
    match ext.to_lowercase().as_str() {
        "docx" => Some("word"),
        "pptx" => Some("powerpoint"),
        "xlsx" => Some("excel"),
        "txt" | "md" => Some("text"),
        _ => None,
    }
}
