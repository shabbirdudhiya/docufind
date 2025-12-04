use std::fs;
use std::io::Read;
use std::path::Path;
use xml::reader::{EventReader, XmlEvent};
use zip::ZipArchive;

/// Extract text content from a DOCX file
/// 
/// DOCX files are ZIP archives containing XML files.
/// The main document content is in word/document.xml
pub fn extract_docx(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let mut content = String::new();

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

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_extract_nonexistent_file() {
        let result = extract_docx(Path::new("/nonexistent/file.docx"));
        assert!(result.is_none());
    }
}
