use crate::models::{ContentSection, DocumentContent, DocumentMetadata, SectionType};
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use std::fs;
use std::io::BufReader;
use std::path::Path;
use zip::ZipArchive;

/// Extract text content from a PPTX file
///
/// PPTX files are ZIP archives containing XML files.
/// Slides are stored in ppt/slides/slide1.xml, slide2.xml, etc.
/// Text is in <a:t> elements.
///
/// Uses quick-xml streaming parser for 10-50x faster extraction.
/// Uses direct ZIP entry access by name instead of iterating all entries.
pub fn extract_pptx(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let mut content = String::with_capacity(8192);

    // Get list of slide files by checking known slide naming pattern
    // This is faster than iterating all entries in the ZIP
    let mut slide_num = 1;
    loop {
        let slide_name = format!("ppt/slides/slide{}.xml", slide_num);

        match archive.by_name(&slide_name) {
            Ok(slide_file) => {
                let buf_reader = BufReader::new(slide_file);
                let mut reader = Reader::from_reader(buf_reader);
                reader.config_mut().trim_text(true);

                let mut buf = Vec::with_capacity(512);

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
                content.push('\n');
                slide_num += 1;
            }
            Err(_) => {
                // No more slides found
                break;
            }
        }
    }

    if content.is_empty() {
        None
    } else {
        Some(content.trim().to_string())
    }
}

/// Extract structured content from a PPTX file (for rich preview)
pub fn extract_pptx_structured(path: &Path) -> Option<DocumentContent> {
    let file = fs::File::open(path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;

    let mut sections: Vec<ContentSection> = Vec::new();
    let mut slide_count = 0;

    // Iterate over slides
    let mut slide_num = 1;
    loop {
        let slide_name = format!("ppt/slides/slide{}.xml", slide_num);

        match archive.by_name(&slide_name) {
            Ok(slide_file) => {
                slide_count += 1;

                // Add slide break/header
                sections.push(ContentSection {
                    section_type: SectionType::SlideBreak {
                        slide_number: slide_num as u32,
                    },
                    content: None,
                    runs: None,
                    children: None,
                    properties: None,
                });

                let buf_reader = BufReader::new(slide_file);
                let mut reader = Reader::from_reader(buf_reader);
                reader.config_mut().trim_text(true);

                let mut buf = Vec::with_capacity(1024);
                let mut current_paragraph_text = String::new();
                let mut in_details = false; // crude way to track if we found text in this paragraph

                // Simple parsing strategy:
                // Treat each <a:p> (paragraph) as a potential text block.
                // Reset text buffer on <a:p> start.
                // On <a:p> end, if text exists, add a Paragraph section.

                // We use checking buffer names because quick-xml events return bytes
                // <a:p> is usually just `p` in local name if namespaces are trimmed, or `a:p`.
                // quick-xml trim_text doesn't affect tag names.
                // Let's assume standard PPTX structure.

                loop {
                    match reader.read_event_into(&mut buf) {
                        Ok(Event::Start(ref e)) => {
                            if e.name().as_ref() == b"a:p" {
                                current_paragraph_text.clear();
                                in_details = true;
                            }
                        }
                        Ok(Event::End(ref e)) => {
                            if e.name().as_ref() == b"a:p" {
                                if !current_paragraph_text.is_empty() {
                                    sections.push(ContentSection {
                                        section_type: SectionType::Paragraph,
                                        content: Some(current_paragraph_text.trim().to_string()),
                                        runs: None, // We could extract runs separately but let's start simple
                                        children: None,
                                        properties: None,
                                    });
                                    current_paragraph_text = String::new();
                                }
                                in_details = false;
                            }
                        }
                        Ok(Event::Text(e)) => {
                            if in_details {
                                if let Ok(text) = e.unescape() {
                                    if !text.trim().is_empty() {
                                        current_paragraph_text.push_str(&text);
                                        current_paragraph_text.push(' ');
                                    }
                                }
                            }
                        }
                        Ok(Event::Eof) => break,
                        Err(_) => break,
                        _ => {}
                    }
                    buf.clear();
                }

                slide_num += 1;
            }
            Err(_) => {
                break;
            }
        }
    }

    Some(DocumentContent {
        doc_type: "powerpoint".to_string(),
        sections,
        metadata: DocumentMetadata {
            slide_count: Some(slide_count),
            ..Default::default()
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_nonexistent_file() {
        let result = extract_pptx(Path::new("/nonexistent/file.pptx"));
        assert!(result.is_none());
    }
}
