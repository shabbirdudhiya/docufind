use std::fs;
use std::io::Read;
use std::path::Path;
use xml::reader::{EventReader, XmlEvent};
use zip::ZipArchive;

/// Extract text content from an XLSX file
/// 
/// XLSX files are ZIP archives containing XML files.
/// - xl/sharedStrings.xml contains the string table (most text content)
/// - xl/worksheets/sheet1.xml, sheet2.xml, etc. contain cell data
/// 
/// We extract from sharedStrings.xml for the text content.
pub fn extract_xlsx(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let mut content = String::new();

    // First, extract shared strings (most cell text is stored here)
    if let Ok(mut shared_strings) = archive.by_name("xl/sharedStrings.xml") {
        let mut xml = String::new();
        shared_strings.read_to_string(&mut xml).ok()?;

        // Extract text from <t> tags within <si> elements
        let reader = EventReader::from_str(&xml);
        let mut in_si = false;
        
        for event in reader {
            match event {
                Ok(XmlEvent::StartElement { name, .. }) => {
                    if name.local_name == "si" {
                        in_si = true;
                    }
                }
                Ok(XmlEvent::EndElement { name }) => {
                    if name.local_name == "si" {
                        in_si = false;
                        content.push(' ');
                    }
                }
                Ok(XmlEvent::Characters(text)) if in_si => {
                    content.push_str(&text);
                }
                _ => {}
            }
        }
    }

    // Also check for inline strings in sheet data (less common but possible)
    for i in 0..archive.len() {
        if let Ok(file) = archive.by_index(i) {
            let name = file.name().to_string();
            if name.starts_with("xl/worksheets/sheet") && name.ends_with(".xml") {
                // We could parse inline strings here, but sharedStrings covers most cases
                // This is a performance tradeoff - most Excel files use shared strings
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
        let result = extract_xlsx(Path::new("/nonexistent/file.xlsx"));
        assert!(result.is_none());
    }
}
