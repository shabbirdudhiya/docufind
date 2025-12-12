use quick_xml::events::Event;
use quick_xml::reader::Reader;
use std::fs;
use std::io::{BufReader, Read};
use std::path::Path;
use zip::ZipArchive;

use crate::models::{
    ContentSection, DocumentContent, DocumentMetadata, SectionType, TextRun, TextStyle,
};

/// Extract text content from a DOCX file (plain text for indexing)
///
/// DOCX files are ZIP archives containing XML files.
/// The main document content is in word/document.xml
///
/// Uses quick-xml streaming parser for 10-50x faster extraction.
pub fn extract_docx(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let mut content = String::with_capacity(8192);

    // Direct access to document.xml (faster than iterating all entries)
    if let Ok(document) = archive.by_name("word/document.xml") {
        let buf_reader = BufReader::new(document);
        let mut reader = Reader::from_reader(buf_reader);
        reader.config_mut().trim_text(true);

        let mut buf = Vec::with_capacity(1024);

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Text(e)) => {
                    if let Ok(text) = e.unescape() {
                        content.push_str(&text);
                        content.push(' ');
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
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
    let sections = if let Ok(document) = archive.by_name("word/document.xml") {
        let buf_reader = BufReader::new(document);
        parse_document_xml_streaming(buf_reader, &style_map)
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

    if let Ok(styles_file) = archive.by_name("word/styles.xml") {
        let buf_reader = BufReader::new(styles_file);
        let mut reader = Reader::from_reader(buf_reader);
        reader.config_mut().trim_text(true);

        let mut buf = Vec::with_capacity(512);
        let mut current_style_id = String::new();
        let mut current_style_name = String::new();
        let mut in_style = false;

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(e)) | Ok(Event::Empty(e)) => match e.local_name().as_ref() {
                    b"style" => {
                        in_style = true;
                        for attr in e.attributes().filter_map(|a| a.ok()) {
                            if attr.key.local_name().as_ref() == b"styleId" {
                                current_style_id = String::from_utf8_lossy(&attr.value).to_string();
                            }
                        }
                    }
                    b"name" if in_style => {
                        for attr in e.attributes().filter_map(|a| a.ok()) {
                            if attr.key.local_name().as_ref() == b"val" {
                                current_style_name =
                                    String::from_utf8_lossy(&attr.value).to_string();
                            }
                        }
                    }
                    _ => {}
                },
                Ok(Event::End(e)) => {
                    if e.local_name().as_ref() == b"style" && in_style {
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
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
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

/// Parse document.xml using streaming parser and extract structured content
fn parse_document_xml_streaming<R: Read>(
    reader: R,
    style_map: &std::collections::HashMap<String, StyleInfo>,
) -> Vec<ContentSection> {
    let mut sections = Vec::new();
    let mut xml_reader = Reader::from_reader(BufReader::new(reader));
    xml_reader.config_mut().trim_text(true);

    let mut buf = Vec::with_capacity(1024);

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

    loop {
        match xml_reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                match e.local_name().as_ref() {
                    // Paragraph
                    b"p" => {
                        in_paragraph = true;
                        current_paragraph_style = None;
                        current_runs.clear();
                    }
                    // Paragraph style
                    b"pStyle" => {
                        if in_paragraph {
                            for attr in e.attributes().filter_map(|a| a.ok()) {
                                if attr.key.local_name().as_ref() == b"val" {
                                    current_paragraph_style =
                                        Some(String::from_utf8_lossy(&attr.value).to_string());
                                }
                            }
                        }
                    }
                    // Numbering (list item indicator)
                    b"numPr" => {
                        in_list_item = true;
                    }
                    // List level
                    b"ilvl" => {
                        if in_list_item {
                            for attr in e.attributes().filter_map(|a| a.ok()) {
                                if attr.key.local_name().as_ref() == b"val" {
                                    list_depth =
                                        String::from_utf8_lossy(&attr.value).parse().unwrap_or(0);
                                }
                            }
                        }
                    }
                    // Run (text with formatting)
                    b"r" => {
                        in_run = true;
                        current_style = TextStyle::default();
                    }
                    // Bold
                    b"b" => {
                        if in_run {
                            let is_disabled = e.attributes().filter_map(|a| a.ok()).any(|a| {
                                a.key.local_name().as_ref() == b"val"
                                    && (a.value.as_ref() == b"false" || a.value.as_ref() == b"0")
                            });
                            if !is_disabled {
                                current_style.bold = true;
                            }
                        }
                    }
                    // Italic
                    b"i" => {
                        if in_run {
                            let is_disabled = e.attributes().filter_map(|a| a.ok()).any(|a| {
                                a.key.local_name().as_ref() == b"val"
                                    && (a.value.as_ref() == b"false" || a.value.as_ref() == b"0")
                            });
                            if !is_disabled {
                                current_style.italic = true;
                            }
                        }
                    }
                    // Underline
                    b"u" => {
                        if in_run {
                            let is_disabled = e.attributes().filter_map(|a| a.ok()).any(|a| {
                                a.key.local_name().as_ref() == b"val" && a.value.as_ref() == b"none"
                            });
                            if !is_disabled {
                                current_style.underline = true;
                            }
                        }
                    }
                    // Strikethrough
                    b"strike" => {
                        if in_run {
                            let is_disabled = e.attributes().filter_map(|a| a.ok()).any(|a| {
                                a.key.local_name().as_ref() == b"val"
                                    && (a.value.as_ref() == b"false" || a.value.as_ref() == b"0")
                            });
                            if !is_disabled {
                                current_style.strikethrough = true;
                            }
                        }
                    }
                    // Highlight
                    b"highlight" => {
                        if in_run {
                            for attr in e.attributes().filter_map(|a| a.ok()) {
                                if attr.key.local_name().as_ref() == b"val"
                                    && attr.value.as_ref() != b"none"
                                {
                                    current_style.highlight =
                                        Some(String::from_utf8_lossy(&attr.value).to_string());
                                }
                            }
                        }
                    }
                    // Text content
                    b"t" => {
                        in_text = true;
                        current_text.clear();
                    }
                    // Table
                    b"tbl" => {
                        in_table = true;
                        table_rows.clear();
                    }
                    // Table row
                    b"tr" => {
                        if in_table {
                            in_table_row = true;
                            current_row_cells.clear();
                        }
                    }
                    // Table cell
                    b"tc" => {
                        if in_table_row {
                            in_table_cell = true;
                        }
                    }
                    // Page break
                    b"lastRenderedPageBreak" | b"pageBreakBefore" => {
                        sections.push(ContentSection {
                            section_type: SectionType::PageBreak,
                            content: None,
                            runs: None,
                            children: None,
                            properties: None,
                        });
                    }
                    // Explicit break
                    b"br" => {
                        let mut is_page_break = false;
                        for attr in e.attributes().filter_map(|a| a.ok()) {
                            if attr.key.local_name().as_ref() == b"type"
                                && attr.value.as_ref() == b"page"
                            {
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
                    b"tab" => {
                        if in_run {
                            current_runs.push(TextRun {
                                text: "\t".to_string(),
                                style: current_style.clone(),
                            });
                        }
                    }
                    b"noBreakHyphen" => {
                        if in_run {
                            current_runs.push(TextRun {
                                text: "-".to_string(),
                                style: current_style.clone(),
                            });
                        }
                    }
                    b"softHyphen" => {
                        if in_run {
                            current_runs.push(TextRun {
                                text: "\u{00AD}".to_string(),
                                style: current_style.clone(),
                            });
                        }
                    }
                    b"cr" => {
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
            Ok(Event::Text(e)) => {
                if in_text {
                    if let Ok(text) = e.unescape() {
                        current_text.push_str(&text);
                    }
                }
            }
            Ok(Event::End(e)) => {
                match e.local_name().as_ref() {
                    b"t" => {
                        if in_text && !current_text.is_empty() {
                            current_runs.push(TextRun {
                                text: current_text.clone(),
                                style: current_style.clone(),
                            });
                        }
                        in_text = false;
                    }
                    b"r" => {
                        in_run = false;
                    }
                    b"numPr" => {
                        // Don't reset in_list_item here, it applies to the paragraph
                    }
                    b"p" => {
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
                    b"tc" => {
                        in_table_cell = false;
                    }
                    b"tr" => {
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
                    b"tbl" => {
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
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    sections
}

/// Parse core.xml for document metadata
fn parse_metadata(archive: &mut ZipArchive<fs::File>) -> DocumentMetadata {
    let mut metadata = DocumentMetadata::default();

    if let Ok(core) = archive.by_name("docProps/core.xml") {
        let buf_reader = BufReader::new(core);
        let mut reader = Reader::from_reader(buf_reader);
        reader.config_mut().trim_text(true);

        let mut buf = Vec::with_capacity(256);
        let mut current_element = String::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(e)) => {
                    current_element = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                }
                Ok(Event::Text(e)) => {
                    if let Ok(text) = e.unescape() {
                        match current_element.as_str() {
                            "title" => metadata.title = Some(text.to_string()),
                            "creator" => metadata.author = Some(text.to_string()),
                            "created" => metadata.created = Some(text.to_string()),
                            "modified" => metadata.modified = Some(text.to_string()),
                            _ => {}
                        }
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
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
