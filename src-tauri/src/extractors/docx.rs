use std::fs;
use std::io::Read;
use std::path::Path;
use xml::reader::{EventReader, XmlEvent};
use zip::ZipArchive;

use crate::models::{
    ContentSection, DocumentContent, DocumentMetadata, SectionType, TextRun, TextStyle,
};

/// Extract text content from a DOCX file (plain text for indexing)
///
/// DOCX files are ZIP archives containing XML files.
/// The main document content is in word/document.xml
pub fn extract_docx(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let mut content = String::with_capacity(8192);

    if let Ok(mut document) = archive.by_name("word/document.xml") {
        let mut xml = String::new();
        document.read_to_string(&mut xml).ok()?;

        // Parse XML and extract text from <w:t> elements
        let reader = EventReader::from_str(&xml);
        for event in reader {
            if let Ok(XmlEvent::Characters(text)) = event {
                content.push_str(&text);
                content.push(' ');
            }
        }
    }

    if content.is_empty() {
        None
    } else {
        Some(content.trim().to_string())
    }
}

/// Extract structured content from a DOCX file (for rich preview)
///
/// Parses the document XML to extract:
/// - Paragraphs with their styles (headings, normal, etc.)
/// - Text runs with formatting (bold, italic, underline)
/// - Lists (bullets and numbered)
/// - Tables
pub fn extract_docx_structured(path: &Path) -> Option<DocumentContent> {
    let file = fs::File::open(path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;

    // Parse styles.xml to get style name mappings
    let style_map = parse_styles(&mut archive);

    // Parse document.xml for content
    let sections = if let Ok(mut document) = archive.by_name("word/document.xml") {
        let mut xml = String::new();
        document.read_to_string(&mut xml).ok()?;
        parse_document_xml(&xml, &style_map)
    } else {
        Vec::new()
    };

    // Parse core.xml for metadata
    let metadata = parse_metadata(&mut archive);

    if sections.is_empty() {
        None
    } else {
        Some(DocumentContent {
            doc_type: "word".to_string(),
            sections,
            metadata,
        })
    }
}

/// Parse styles.xml to map style IDs to human-readable names and heading levels
fn parse_styles(
    archive: &mut ZipArchive<fs::File>,
) -> std::collections::HashMap<String, StyleInfo> {
    let mut styles = std::collections::HashMap::new();

    if let Ok(mut styles_file) = archive.by_name("word/styles.xml") {
        let mut xml = String::new();
        if styles_file.read_to_string(&mut xml).is_ok() {
            let reader = EventReader::from_str(&xml);
            let mut current_style_id = String::new();
            let mut current_style_name = String::new();
            let mut in_style = false;

            for event in reader {
                match event {
                    Ok(XmlEvent::StartElement {
                        name, attributes, ..
                    }) => {
                        if name.local_name == "style" {
                            in_style = true;
                            for attr in &attributes {
                                if attr.name.local_name == "styleId" {
                                    current_style_id = attr.value.clone();
                                }
                            }
                        } else if in_style && name.local_name == "name" {
                            for attr in &attributes {
                                if attr.name.local_name == "val" {
                                    current_style_name = attr.value.clone();
                                }
                            }
                        }
                    }
                    Ok(XmlEvent::EndElement { name }) => {
                        if name.local_name == "style" && in_style {
                            if !current_style_id.is_empty() {
                                let heading_level =
                                    detect_heading_level(&current_style_id, &current_style_name);
                                styles.insert(
                                    current_style_id.clone(),
                                    StyleInfo {
                                        name: current_style_name.clone(),
                                        heading_level,
                                    },
                                );
                            }
                            current_style_id.clear();
                            current_style_name.clear();
                            in_style = false;
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    styles
}

#[derive(Clone, Debug)]
struct StyleInfo {
    #[allow(dead_code)]
    name: String,
    heading_level: Option<u8>,
}

/// Detect heading level from style ID or name
fn detect_heading_level(style_id: &str, style_name: &str) -> Option<u8> {
    let id_lower = style_id.to_lowercase();
    let name_lower = style_name.to_lowercase();

    // Check common patterns
    for level in 1..=6 {
        let patterns = [
            format!("heading{}", level),
            format!("heading {}", level),
            format!("h{}", level),
            format!("titre{}", level),      // French
            format!("berschrift{}", level), // German
        ];

        for pattern in &patterns {
            if id_lower.contains(pattern) || name_lower.contains(pattern) {
                return Some(level);
            }
        }
    }

    // Check for title style (treat as h1)
    if id_lower == "title" || name_lower == "title" {
        return Some(1);
    }

    // Check for subtitle (treat as h2)
    if id_lower == "subtitle" || name_lower == "subtitle" {
        return Some(2);
    }

    None
}

/// Parse document.xml and extract structured content
fn parse_document_xml(
    xml: &str,
    style_map: &std::collections::HashMap<String, StyleInfo>,
) -> Vec<ContentSection> {
    let mut sections = Vec::new();
    let reader = EventReader::from_str(xml);

    let mut in_paragraph = false;
    let mut in_run = false;
    let mut in_text = false;
    let mut in_table = false;
    let mut in_table_row = false;
    let mut in_table_cell = false;
    let mut in_list_item = false;

    let mut current_paragraph_style: Option<String> = None;
    let mut current_runs: Vec<TextRun> = Vec::new();
    let mut current_text = String::new();
    let mut current_style = TextStyle::default();

    // List tracking
    let mut list_depth: u8 = 0;
    let is_ordered_list = false; // TODO: Detect from numFmt in numbering.xml

    // Table tracking
    let mut table_rows: Vec<ContentSection> = Vec::new();
    let mut current_row_cells: Vec<ContentSection> = Vec::new();

    for event in reader {
        match event {
            Ok(XmlEvent::StartElement {
                name, attributes, ..
            }) => {
                match name.local_name.as_str() {
                    // Paragraph
                    "p" => {
                        in_paragraph = true;
                        current_paragraph_style = None;
                        current_runs.clear();
                    }
                    // Paragraph style
                    "pStyle" => {
                        if in_paragraph {
                            for attr in &attributes {
                                if attr.name.local_name == "val" {
                                    current_paragraph_style = Some(attr.value.clone());
                                }
                            }
                        }
                    }
                    // Numbering (list item indicator)
                    "numPr" => {
                        in_list_item = true;
                    }
                    // List level
                    "ilvl" => {
                        if in_list_item {
                            for attr in &attributes {
                                if attr.name.local_name == "val" {
                                    list_depth = attr.value.parse().unwrap_or(0);
                                }
                            }
                        }
                    }
                    // Run (text with formatting)
                    "r" => {
                        in_run = true;
                        current_style = TextStyle::default();
                    }
                    // Bold
                    "b" => {
                        if in_run {
                            // Check if it's not <w:b w:val="false"/>
                            let is_disabled = attributes.iter().any(|a| {
                                a.name.local_name == "val" && a.value == "false" || a.value == "0"
                            });
                            if !is_disabled {
                                current_style.bold = true;
                            }
                        }
                    }
                    // Italic
                    "i" => {
                        if in_run {
                            let is_disabled = attributes.iter().any(|a| {
                                a.name.local_name == "val" && a.value == "false" || a.value == "0"
                            });
                            if !is_disabled {
                                current_style.italic = true;
                            }
                        }
                    }
                    // Underline
                    "u" => {
                        if in_run {
                            // Underline is enabled unless val="none"
                            let is_disabled = attributes
                                .iter()
                                .any(|a| a.name.local_name == "val" && a.value == "none");
                            if !is_disabled {
                                current_style.underline = true;
                            }
                        }
                    }
                    // Strikethrough
                    "strike" => {
                        if in_run {
                            let is_disabled = attributes.iter().any(|a| {
                                a.name.local_name == "val" && a.value == "false" || a.value == "0"
                            });
                            if !is_disabled {
                                current_style.strikethrough = true;
                            }
                        }
                    }
                    // Highlight
                    "highlight" => {
                        if in_run {
                            for attr in &attributes {
                                if attr.name.local_name == "val" && attr.value != "none" {
                                    current_style.highlight = Some(attr.value.clone());
                                }
                            }
                        }
                    }
                    // Text content
                    "t" => {
                        in_text = true;
                        current_text.clear();
                    }
                    // Table
                    "tbl" => {
                        in_table = true;
                        table_rows.clear();
                    }
                    // Table row
                    "tr" => {
                        if in_table {
                            in_table_row = true;
                            current_row_cells.clear();
                        }
                    }
                    // Table cell
                    "tc" => {
                        if in_table_row {
                            in_table_cell = true;
                        }
                    }
                    // Page break
                    "lastRenderedPageBreak" | "pageBreakBefore" => {
                        sections.push(ContentSection {
                            section_type: SectionType::PageBreak,
                            content: None,
                            runs: None,
                            children: None,
                            properties: None,
                        });
                    }
                    // Explicit break
                    "br" => {
                        let mut is_page_break = false;
                        for attr in &attributes {
                            if attr.name.local_name == "type" && attr.value == "page" {
                                is_page_break = true;
                                sections.push(ContentSection {
                                    section_type: SectionType::PageBreak,
                                    content: None,
                                    runs: None,
                                    children: None,
                                    properties: None,
                                });
                            }
                        }
                        if !is_page_break {
                            if in_text {
                                current_text.push('\n');
                            } else if in_run {
                                current_runs.push(TextRun {
                                    text: "\n".to_string(),
                                    style: current_style.clone(),
                                });
                            }
                        }
                    }
                    "tab" => {
                        if in_run {
                            current_runs.push(TextRun {
                                text: "\t".to_string(),
                                style: current_style.clone(),
                            });
                        }
                    }
                    "noBreakHyphen" => {
                        if in_run {
                            current_runs.push(TextRun {
                                text: "-".to_string(), // non-breaking hyphen
                                style: current_style.clone(),
                            });
                        }
                    }
                    "softHyphen" => {
                        if in_run {
                            current_runs.push(TextRun {
                                text: "\u{00AD}".to_string(), // soft hyphen
                                style: current_style.clone(),
                            });
                        }
                    }
                    "cr" => {
                        if in_run {
                            current_runs.push(TextRun {
                                text: "\n".to_string(),
                                style: current_style.clone(),
                            });
                        }
                    }
                    _ => {}
                }
            }
            Ok(XmlEvent::Characters(text)) => {
                if in_text {
                    current_text.push_str(&text);
                }
            }
            Ok(XmlEvent::EndElement { name }) => {
                match name.local_name.as_str() {
                    "t" => {
                        if in_text && !current_text.is_empty() {
                            current_runs.push(TextRun {
                                text: current_text.clone(),
                                style: current_style.clone(),
                            });
                        }
                        in_text = false;
                    }
                    "r" => {
                        in_run = false;
                    }
                    "numPr" => {
                        // Don't reset in_list_item here, it applies to the paragraph
                    }
                    "p" => {
                        if in_paragraph && !current_runs.is_empty() {
                            // Determine section type based on style
                            let section_type = if in_list_item {
                                SectionType::ListItem {
                                    ordered: is_ordered_list,
                                    depth: list_depth,
                                }
                            } else if let Some(ref style_id) = current_paragraph_style {
                                if let Some(style_info) = style_map.get(style_id) {
                                    if let Some(level) = style_info.heading_level {
                                        SectionType::Heading { level }
                                    } else {
                                        SectionType::Paragraph
                                    }
                                } else {
                                    // Check style ID directly for common patterns
                                    if let Some(level) = detect_heading_level(style_id, "") {
                                        SectionType::Heading { level }
                                    } else {
                                        SectionType::Paragraph
                                    }
                                }
                            } else {
                                SectionType::Paragraph
                            };

                            // Build combined content string
                            let combined_content: String =
                                current_runs.iter().map(|r| r.text.as_str()).collect();

                            // If in table cell, add to cell, otherwise add to sections
                            if in_table_cell {
                                current_row_cells.push(ContentSection {
                                    section_type: SectionType::TableCell,
                                    content: Some(combined_content),
                                    runs: Some(current_runs.clone()),
                                    children: None,
                                    properties: None,
                                });
                            } else {
                                sections.push(ContentSection {
                                    section_type,
                                    content: Some(combined_content),
                                    runs: Some(current_runs.clone()),
                                    children: None,
                                    properties: None,
                                });
                            }
                        }
                        in_paragraph = false;
                        in_list_item = false;
                        list_depth = 0;
                        current_runs.clear();
                    }
                    "tc" => {
                        in_table_cell = false;
                    }
                    "tr" => {
                        if in_table_row && !current_row_cells.is_empty() {
                            table_rows.push(ContentSection {
                                section_type: SectionType::TableRow,
                                content: None,
                                runs: None,
                                children: Some(current_row_cells.clone()),
                                properties: None,
                            });
                        }
                        in_table_row = false;
                        current_row_cells.clear();
                    }
                    "tbl" => {
                        if in_table && !table_rows.is_empty() {
                            sections.push(ContentSection {
                                section_type: SectionType::Table,
                                content: None,
                                runs: None,
                                children: Some(table_rows.clone()),
                                properties: None,
                            });
                        }
                        in_table = false;
                        table_rows.clear();
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }

    sections
}

/// Parse core.xml for document metadata
fn parse_metadata(archive: &mut ZipArchive<fs::File>) -> DocumentMetadata {
    let mut metadata = DocumentMetadata::default();

    if let Ok(mut core) = archive.by_name("docProps/core.xml") {
        let mut xml = String::new();
        if core.read_to_string(&mut xml).is_ok() {
            let reader = EventReader::from_str(&xml);
            let mut current_element = String::new();

            for event in reader {
                match event {
                    Ok(XmlEvent::StartElement { name, .. }) => {
                        current_element = name.local_name.clone();
                    }
                    Ok(XmlEvent::Characters(text)) => match current_element.as_str() {
                        "title" => metadata.title = Some(text),
                        "creator" => metadata.author = Some(text),
                        "created" => metadata.created = Some(text),
                        "modified" => metadata.modified = Some(text),
                        _ => {}
                    },
                    _ => {}
                }
            }
        }
    }

    metadata
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_nonexistent_file() {
        let result = extract_docx(Path::new("/nonexistent/file.docx"));
        assert!(result.is_none());
    }

    #[test]
    fn test_detect_heading_levels() {
        assert_eq!(detect_heading_level("Heading1", "Heading 1"), Some(1));
        assert_eq!(detect_heading_level("Heading2", ""), Some(2));
        assert_eq!(detect_heading_level("Title", "Title"), Some(1));
        assert_eq!(detect_heading_level("Normal", "Normal"), None);
    }
}
