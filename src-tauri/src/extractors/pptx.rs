use std::fs;
use std::io::Read;
use std::path::Path;
use xml::reader::{EventReader, XmlEvent};
use zip::ZipArchive;

/// Extract text content from a PPTX file
/// 
/// PPTX files are ZIP archives containing XML files.
/// Slides are stored in ppt/slides/slide1.xml, slide2.xml, etc.
/// Text is in <a:t> elements.
pub fn extract_pptx(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let mut content = String::new();

    // PPTX stores slides in ppt/slides/slide1.xml, slide2.xml, etc.
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).ok()?;
        let name = file.name().to_string();

        if name.starts_with("ppt/slides/slide") && name.ends_with(".xml") {
            let mut xml = String::new();
            file.read_to_string(&mut xml).ok()?;

            // Extract text from <a:t> tags (PowerPoint text elements)
            let reader = EventReader::from_str(&xml);
            for event in reader {
                if let Ok(XmlEvent::Characters(text)) = event {
                    content.push_str(&text);
                    content.push(' ');
                }
            }
            content.push('\n');
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
        let result = extract_pptx(Path::new("/nonexistent/file.pptx"));
        assert!(result.is_none());
    }
}
