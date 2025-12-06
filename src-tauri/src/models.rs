use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Core file data structure representing an indexed document
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileData {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub last_modified: DateTime<Utc>,
    pub file_type: String,
    pub content: String,
}

/// Search result with match highlights and score
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub file: FileData,
    pub matches: Vec<Match>,
    pub score: f32,
}

/// Individual match within a document
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Match {
    pub text: String,
    pub index: usize,
    pub context: String,
}

/// Information about an indexed folder
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderInfo {
    pub path: String,
    pub file_count: usize,
}

/// Progress event payload for frontend during indexing
#[derive(Debug, Serialize, Clone)]
pub struct IndexingProgress {
    pub current: usize,
    pub total: usize,
    pub filename: String,
    pub phase: String, // "discovering", "indexing", "finalizing"
}

/// Folder node for hierarchical tree view
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderNode {
    pub path: String,
    pub name: String,
    pub is_excluded: bool,
    pub file_count: usize,
    pub children: Vec<FolderNode>,
}

/// Search history entry
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchHistoryEntry {
    pub query: String,
    pub timestamp: DateTime<Utc>,
    pub result_count: usize,
}

/// Search filters for advanced filtering
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SearchFilters {
    pub file_types: Option<Vec<String>>,      // ["word", "powerpoint", "excel", "text"]
    pub date_from: Option<DateTime<Utc>>,
    pub date_to: Option<DateTime<Utc>>,
    pub min_size: Option<u64>,
    pub max_size: Option<u64>,
    pub folder_path: Option<String>,          // Limit search to specific folder
    pub file_path: Option<String>,            // Search in a single specific file
    pub max_results: Option<usize>,           // Limit number of results (default 100)
    pub offset: Option<usize>,                // Skip first N results (for pagination)
}

/// Index statistics for dashboard
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IndexStats {
    pub total_files: usize,
    pub word_files: usize,
    pub powerpoint_files: usize,
    pub excel_files: usize,
    pub text_files: usize,
    pub total_size: u64,
    pub folder_count: usize,
}

// ============================================================================
// Structured Document Content Models (for rich preview)
// ============================================================================

/// Structured document content for rich preview rendering
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocumentContent {
    /// The type of document (word, powerpoint, excel, text)
    pub doc_type: String,
    /// Structured content sections
    pub sections: Vec<ContentSection>,
    /// Document metadata (title, author, etc.)
    pub metadata: DocumentMetadata,
}

/// Document metadata extracted from file properties
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct DocumentMetadata {
    pub title: Option<String>,
    pub author: Option<String>,
    pub created: Option<String>,
    pub modified: Option<String>,
    pub page_count: Option<usize>,
    pub slide_count: Option<usize>,
    pub sheet_count: Option<usize>,
}

/// A section of content within a document
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContentSection {
    /// Type of this section
    pub section_type: SectionType,
    /// Text content (may contain inline formatting via TextRun)
    pub content: Option<String>,
    /// Rich text runs for inline formatting
    pub runs: Option<Vec<TextRun>>,
    /// Child sections (for nested lists, etc.)
    pub children: Option<Vec<ContentSection>>,
    /// Additional properties based on section type
    pub properties: Option<SectionProperties>,
}

/// Type of content section
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(tag = "type")]
pub enum SectionType {
    /// Heading with level 1-6
    Heading { level: u8 },
    /// Normal paragraph
    Paragraph,
    /// List item (bullet or numbered)
    ListItem { ordered: bool, depth: u8 },
    /// Table with rows and cells
    Table,
    /// Table row
    TableRow,
    /// Table cell
    TableCell,
    /// Image/picture
    Image,
    /// Page break marker
    PageBreak,
    /// Slide break (for PPTX)
    SlideBreak { slide_number: u32 },
    /// Code block or preformatted text
    CodeBlock,
    /// Horizontal rule
    HorizontalRule,
    /// Hyperlink
    Link { url: String },
}

/// A run of text with consistent formatting
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TextRun {
    pub text: String,
    pub style: TextStyle,
}

/// Text formatting style
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct TextStyle {
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub strikethrough: bool,
    pub superscript: bool,
    pub subscript: bool,
    pub highlight: Option<String>,  // Highlight color if any
    pub color: Option<String>,       // Text color if specified
    pub font_size: Option<f32>,      // Font size in points
}

/// Additional properties for specific section types
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SectionProperties {
    /// For tables: column widths
    pub column_widths: Option<Vec<f32>>,
    /// For images: base64 data or path
    pub image_data: Option<String>,
    /// For images: alt text
    pub alt_text: Option<String>,
    /// For images: width in pixels
    pub width: Option<u32>,
    /// For images: height in pixels
    pub height: Option<u32>,
}
